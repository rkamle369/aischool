import { Router } from "express";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import dgram from "node:dgram";
import net from "node:net";

const router = Router();

function resolveRtcProbeHost(httpProbeUrl) {
  const explicitHost = (process.env.LIVEKIT_NODE_IP || "").trim();
  if (explicitHost) {
    return explicitHost;
  }
  try {
    return new URL(httpProbeUrl).hostname;
  } catch {
    return null;
  }
}

async function probeTcp(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!host || !Number.isFinite(port)) {
      resolve({ ok: false, error: "invalid host/port" });
      return;
    }
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(payload);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: "timeout" }));
    socket.once("error", (error) => finish({ ok: false, error: error?.message || "tcp error" }));
  });
}

async function probeUdp(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!host || !Number.isFinite(port)) {
      resolve({ status: "invalid-target", error: "invalid host/port" });
      return;
    }
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finish({
        status: "no-refusal",
        note: "No ICMP/OS refusal observed; UDP might be open or silently filtered."
      });
    }, timeoutMs);

    socket.once("error", (error) => {
      clearTimeout(timer);
      const message = String(error?.message || "udp error");
      if (message.toLowerCase().includes("refused")) {
        finish({ status: "refused", error: message });
      } else {
        finish({ status: "error", error: message });
      }
    });

    socket.send(Buffer.from("livekit-health"), port, host, (error) => {
      if (error) {
        clearTimeout(timer);
        finish({ status: "error", error: error?.message || "udp send failed" });
      }
    });
  });
}

function buildAgentDispatchMetadata(tutorContext) {
  if (!tutorContext || typeof tutorContext !== "object") {
    return null;
  }

  const payload = {
    agentType: String(tutorContext.agentType || "").slice(0, 50),
    courseTitle: String(tutorContext.courseTitle || "").slice(0, 500),
    chapterId: String(tutorContext.chapterId || "").slice(0, 200),
    chapterTitle: String(tutorContext.chapterTitle || "").slice(0, 500),
    // Keep dispatch payload intentionally small for Twirp reliability.
    chapterSummary: String(tutorContext.chapterSummary || "").slice(0, 1200)
  };

  return JSON.stringify(payload);
}

async function withDispatchRetries(dispatchFn, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await dispatchFn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

router.post("/token", async (req, res) => {
  const { roomName = "ai-tutor-room", participantName = "student", tutorContext } = req.body || {};

  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return res.status(500).json({
      error: "Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in backend environment."
    });
  }

  try {
    const livekitHttpUrl = (process.env.LIVEKIT_URL || "")
      .trim()
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://");

    // Ensure agent is explicitly dispatched to this room (if available).
    try {
      const agentClient = new AgentDispatchClient(
        livekitHttpUrl,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
      );
      const agentName = process.env.LIVEKIT_AGENT_NAME || "ai-tutor";
      const dispatchMetadata = buildAgentDispatchMetadata(tutorContext);

      if (dispatchMetadata) {
        await withDispatchRetries(() =>
          agentClient.createDispatch(roomName, agentName, { metadata: dispatchMetadata })
        );
      } else {
        await withDispatchRetries(() => agentClient.createDispatch(roomName, agentName));
      }
    } catch (dispatchError) {
      if (tutorContext) {
        const details = String(dispatchError?.message || dispatchError || "unknown dispatch error");
        return res.status(503).json({
          error: `LiveKit agent dispatch failed: ${details}`
        });
      }
      console.warn("Agent dispatch warning:", dispatchError?.message || dispatchError);
    }

    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: participantName,
      ttl: "30m"
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true
    });

    const token = await at.toJwt();
    return res.json({ token, roomName });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Failed to generate LiveKit token."
    });
  }
});

router.get("/health", async (_req, res) => {
  const livekitUrl = (process.env.LIVEKIT_URL || "").trim();
  const hasApiKey = Boolean(process.env.LIVEKIT_API_KEY);
  const hasApiSecret = Boolean(process.env.LIVEKIT_API_SECRET);

  if (!hasApiKey || !hasApiSecret) {
    return res.status(500).json({
      ok: false,
      error: "Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET in backend environment."
    });
  }

  if (!livekitUrl) {
    return res.status(500).json({
      ok: false,
      error: "Missing LIVEKIT_URL in backend environment."
    });
  }

  const httpProbeUrl = livekitUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/+$/, "");
  const rtcProbeHost = resolveRtcProbeHost(httpProbeUrl);
  const rtcUdpPort = Number(process.env.LIVEKIT_RTC_UDP_PORT || 5000);
  const rtcTcpPort = Number(process.env.LIVEKIT_RTC_TCP_PORT || 7881);

  try {
    const probeResponse = await fetch(httpProbeUrl, {
      method: "GET",
      redirect: "manual"
    });

    const reachable = probeResponse.status > 0;
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: "health-check-user",
      ttl: "5m"
    });
    at.addGrant({
      room: "health-check-room",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true
    });
    const token = await at.toJwt();

    const roomService = new RoomServiceClient(
      httpProbeUrl,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );

    let authVerified = false;
    let authError = null;
    try {
      await roomService.listRooms();
      authVerified = true;
    } catch (error) {
      authVerified = false;
      authError = error?.message || "LiveKit server rejected API credentials.";
    }

    const [tcpProbe, udpProbe] = await Promise.all([
      probeTcp(rtcProbeHost, rtcTcpPort),
      probeUdp(rtcProbeHost, rtcUdpPort)
    ]);

    const statusCode = authVerified ? 200 : 500;
    return res.status(statusCode).json({
      ok: authVerified,
      mode: "self-hosted",
      livekitUrl,
      httpProbeUrl,
      reachable,
      probeStatus: probeResponse.status,
      tokenGenerated: Boolean(token),
      authVerified,
      authError,
      rtcProbe: {
        host: rtcProbeHost,
        udpPort: rtcUdpPort,
        tcpPort: rtcTcpPort,
        tcp: tcpProbe,
        udp: udpProbe
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mode: "self-hosted",
      livekitUrl,
      httpProbeUrl,
      error: error?.message || "Failed to reach LiveKit server."
    });
  }
});

export default router;
