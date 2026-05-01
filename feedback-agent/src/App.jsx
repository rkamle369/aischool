import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import welcomeBg from "../welcome_to_aura_feedback_dark/screen.png";
import sessionBackdrop from "../ai_feedback_session/screen.png";
import thankYouHero from "../thank_you/screen.png";
import avatarImg from "../image.png/screen.png";

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE_URL = runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const LIVEKIT_URL = runtimeConfig.VITE_LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL || "";
const LIVEKIT_AGENT_MODE = (runtimeConfig.VITE_LIVEKIT_AGENT_MODE || import.meta.env.VITE_LIVEKIT_AGENT_MODE) !== "false";
const AURA_FEEDBACK_SECONDS = Number(
  runtimeConfig.VITE_AURA_FEEDBACK_SECONDS || import.meta.env.VITE_AURA_FEEDBACK_SECONDS || 300
);
const AGENT_TTS_PROVIDER = (
  runtimeConfig.VITE_AGENT_TTS_PROVIDER ||
  import.meta.env.VITE_AGENT_TTS_PROVIDER ||
  "openai"
).toLowerCase();

/** Must match `livekit-agent/agent_prompts.json` → `feedback` and room prefix in `agent.py`. */
const FEEDBACK_AGENT = {
  id: "feedback",
  roomPrefix: "agent-feedback"
};

const INVALID_CLOSE_PHRASE = "your response is not correct. we are closing this session now.";
const CONNECT_TIMEOUT_MS = 15000;
const TOKEN_TIMEOUT_MS = 10000;
const AUDIO_UNLOCK_TIMEOUT_MS = 3000;

function normalizeLiveKitUrl(rawUrl) {
  const value = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("wss://") || value.startsWith("ws://")) return value;
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  return `wss://${value}`;
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function buildRoomName(suffix) {
  return `${FEEDBACK_AGENT.roomPrefix}-${suffix}`;
}

export default function App() {
  const [phase, setPhase] = useState("welcome");
  const [thanksReason, setThanksReason] = useState("user");

  const [livekitState, setLivekitState] = useState("disconnected");
  const [livekitError, setLivekitError] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [liveCaptionText, setLiveCaptionText] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [requiresManualStart, setRequiresManualStart] = useState(false);

  const [remainingSeconds, setRemainingSeconds] = useState(AURA_FEEDBACK_SECONDS);

  const roomRef = useRef(null);
  const remoteAudioElementsRef = useRef(new Map());
  const assistantSpeakingTimeoutRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const assistantSegmentsRef = useRef(new Map());
  const endingSessionRef = useRef(false);

  const unlockAudioPlayback = useCallback(async () => {
    setAudioUnlocked(true);
    try {
      const primer = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      );
      primer.muted = true;
      await withTimeout(
        primer.play(),
        AUDIO_UNLOCK_TIMEOUT_MS,
        "Audio unlock timed out; continuing with connection attempt."
      );
      primer.pause();
    } catch {
      // best-effort
    }
  }, []);

  const clearSessionTimers = useCallback(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const disconnectLiveKit = useCallback(async () => {
    clearSessionTimers();
    if (assistantSpeakingTimeoutRef.current) {
      clearTimeout(assistantSpeakingTimeoutRef.current);
      assistantSpeakingTimeoutRef.current = null;
    }
    setAiSpeaking(false);
    setLiveCaptionText("");
    assistantSegmentsRef.current.clear();
    setSummaryOpen(false);

    const roomToClose = roomRef.current;
    roomRef.current = null;
    remoteAudioElementsRef.current.forEach((element) => {
      try {
        element.pause?.();
        element.remove();
      } catch {
        // ignore
      }
    });
    remoteAudioElementsRef.current.clear();
    try {
      await roomToClose?.disconnect?.();
    } finally {
      setLivekitState("disconnected");
    }
  }, [clearSessionTimers]);

  const goToThanks = useCallback(
    async (reason) => {
      setThanksReason(reason);
      try {
        await disconnectLiveKit();
      } finally {
        setPhase("thanks");
        setIsStarting(false);
        endingSessionRef.current = false;
      }
    },
    [disconnectLiveKit]
  );

  const resetToWelcome = useCallback(async () => {
    await disconnectLiveKit();
    setPhase("welcome");
    setLivekitError("");
    setRemainingSeconds(AURA_FEEDBACK_SECONDS);
    setIsStarting(false);
    endingSessionRef.current = false;
  }, [disconnectLiveKit]);

  const connectLiveKit = useCallback(async () => {
    setLivekitError("");
    setLiveCaptionText("");
    setAiSpeaking(false);
    assistantSegmentsRef.current.clear();

    await disconnectLiveKit();

    const normalizedLivekitUrl = normalizeLiveKitUrl(LIVEKIT_URL);
    if (!normalizedLivekitUrl) {
      throw new Error("Missing VITE_LIVEKIT_URL in feedback-agent/.env");
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const roomName = buildRoomName(suffix);
    const participantName = `aura-${crypto.randomUUID().slice(0, 8)}`;

    const controller = new AbortController();
    const tokenTimeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
    let tokenResponse;
    try {
      tokenResponse = await fetch(`${API_BASE_URL}/livekit/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          roomName,
          participantName,
          tutorContext: {
            agentType: FEEDBACK_AGENT.id
          }
        })
      });
    } finally {
      clearTimeout(tokenTimeout);
    }

    if (!tokenResponse.ok) {
      let details = "";
      try {
        const payload = await tokenResponse.json();
        details = String(payload?.error || "").trim();
      } catch {
        // ignore non-JSON error bodies
      }
      throw new Error(details || "Unable to fetch LiveKit token from backend.");
    }

    const { token } = await tokenResponse.json();
    const room = new Room();
    roomRef.current = room;

    setLivekitState("connecting");
    room.on(RoomEvent.Reconnected, () => setLivekitState("connected"));
    room.on(RoomEvent.Reconnecting, () => setLivekitState("reconnecting"));
    room.on(RoomEvent.Disconnected, () => setLivekitState("disconnected"));

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== "audio") return;
      const mediaElement = track.attach();
      mediaElement.autoplay = true;
      mediaElement.playsInline = true;
      mediaElement.muted = false;
      mediaElement.style.display = "none";
      document.body.appendChild(mediaElement);
      remoteAudioElementsRef.current.set(track.sid, mediaElement);
      mediaElement.play().catch(() => {
        setLivekitError("Remote audio playback blocked. Tap the screen once, then use Start again.");
      });
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      const element = remoteAudioElementsRef.current.get(track.sid);
      if (element) {
        element.pause?.();
        element.remove();
        remoteAudioElementsRef.current.delete(track.sid);
      }
      track.detach?.();
    });

    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      if (!LIVEKIT_AGENT_MODE || !Array.isArray(segments) || !segments.length) return;
      const isAssistant = !participant?.isLocal;
      if (!isAssistant) return;

      for (const seg of segments) {
        const id = String(seg?.id || "").trim();
        const text = String(seg?.text || "").trim();
        if (!id || !text) continue;
        assistantSegmentsRef.current.set(id, {
          text,
          firstReceivedTime: Number(seg?.firstReceivedTime || Date.now())
        });
      }

      const transcript = [...assistantSegmentsRef.current.values()]
        .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (transcript) {
        setLiveCaptionText(transcript);
        const normalizedTranscript = transcript.toLowerCase();
        if (normalizedTranscript.includes(INVALID_CLOSE_PHRASE) && !endingSessionRef.current) {
          endingSessionRef.current = true;
          setLivekitError("Session closed: validation did not pass.");
          setTimeout(() => {
            void goToThanks("validation");
          }, 600);
        }
      }
      setAiSpeaking(true);
      if (assistantSpeakingTimeoutRef.current) {
        clearTimeout(assistantSpeakingTimeoutRef.current);
      }
      assistantSpeakingTimeoutRef.current = setTimeout(() => {
        setAiSpeaking(false);
        assistantSpeakingTimeoutRef.current = null;
      }, 1100);
    });

    await withTimeout(
      room.connect(normalizedLivekitUrl, token),
      CONNECT_TIMEOUT_MS,
      "LiveKit connection timed out. Please try again."
    );
    setLivekitState("connected");
    setHasEverConnected(true);

    try {
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true
      });
    } catch {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    const limit = AURA_FEEDBACK_SECONDS;
    setRemainingSeconds(limit);
    if (Number.isFinite(limit) && limit > 0) {
      const deadline = Date.now() + limit * 1000;
      tickIntervalRef.current = setInterval(() => {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        setRemainingSeconds(Math.max(0, left));
      }, 250);

      sessionTimerRef.current = setTimeout(() => {
        if (endingSessionRef.current) return;
        endingSessionRef.current = true;
        setLivekitError("Session ended: 5 minute limit reached.");
        void goToThanks("timeout");
      }, limit * 1000);
    }
  }, [disconnectLiveKit, goToThanks]);

  const startCall = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setLivekitError("");
    setLivekitState("connecting");
    await unlockAudioPlayback();
    try {
      await connectLiveKit();
    } catch (error) {
      setLivekitError(String(error?.message || error || "Failed to start session."));
      setLivekitState("disconnected");
      try {
        await disconnectLiveKit();
      } catch {
        // ignore
      }
      setPhase("session");
    } finally {
      setIsStarting(false);
    }
  }, [connectLiveKit, unlockAudioPlayback, isStarting, disconnectLiveKit]);

  const endCall = useCallback(async () => {
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance("Thank you for your feedback. Goodbye.");
        u.lang = "en-US";
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch {
      // ignore
    }
    await goToThanks("user");
  }, [goToThanks]);

  useEffect(() => {
    return () => {
      void disconnectLiveKit();
    };
  }, [disconnectLiveKit]);

  const orbState = useMemo(() => {
    if (aiSpeaking) return "speaking";
    if (livekitState === "connecting" || livekitState === "reconnecting") return "thinking";
    if (livekitState === "connected") return "listening";
    return "idle";
  }, [aiSpeaking, livekitState]);

  const waveState = aiSpeaking ? "speaking" : livekitState === "connected" ? "listening" : "static";

  const beginFeedback = useCallback(() => {
    setPhase("session");
    const isIOS = isIOSDevice();
    setRequiresManualStart(isIOS);
    if (isIOS) {
      setLivekitError("On iPhone, tap Start voice session to connect the microphone.");
    } else {
      setLivekitError("");
      void startCall();
    }
  }, [startCall]);

  const thanksSubtitle = useMemo(() => {
    if (thanksReason === "timeout") return "The session closed automatically after five minutes.";
    if (thanksReason === "validation") return "We could not accept one of the responses. You can try again anytime.";
    return "Your voice session has ended.";
  }, [thanksReason]);

  if (phase === "welcome") {
    return (
      <main className="relative isolate mx-auto min-h-[100dvh] w-full max-w-lg bg-aura-bg">
        {/* Background art: fixed so content scrolls independently; strong scrim so UI never fights the image */}
        <div className="pointer-events-none fixed inset-0 z-0 mx-auto max-w-lg overflow-hidden">
          <img alt="" className="h-full w-full object-cover object-center" src={welcomeBg} />
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#051424]/88 via-[#051424]/82 to-[#051424]/96"
            aria-hidden
          />
        </div>

        <div className="relative z-10 flex min-h-[100dvh] flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#051424]/90 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-[#051424]/75">
            <div className="flex items-center gap-2">
              <span className="text-xl text-aura-tertiary" aria-hidden>
                ◆
              </span>
              <span className="bg-gradient-to-r from-aura-tertiary to-aura-secondary bg-clip-text text-base font-black tracking-tight text-transparent">
                Aura Feedback
              </span>
            </div>
            {!audioUnlocked ? (
              <button
                type="button"
                onClick={unlockAudioPlayback}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs text-aura-on-surface"
              >
                Enable audio
              </button>
            ) : null}
          </header>

          <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-6 sm:px-6">
            <div className="glass-panel mx-auto w-full max-w-md rounded-2xl border border-white/12 bg-[#051424]/90 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
              <div className="mb-4 inline-flex items-center rounded-full border border-aura-secondary/30 bg-aura-secondary-container/25 px-3 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aura-secondary">
                  Intelligent insights
                </span>
              </div>
              <h1 className="text-2xl font-bold leading-tight text-aura-on-surface sm:text-4xl">
                Share your thoughts
                <br />
                <span className="text-aura-tertiary">with Aura</span>
              </h1>
              <p className="mt-4 text-left text-sm leading-relaxed text-aura-on-variant sm:text-center sm:text-base">
                Voice-guided feedback in English. Share your experience—up to five minutes per session.
              </p>
            </div>
          </div>

          <footer className="shrink-0 border-t border-white/10 bg-[#051424]/95 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md supports-[backdrop-filter]:bg-[#051424]/88">
            <button
              type="button"
              onClick={beginFeedback}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-aura-secondary py-4 text-base font-semibold text-aura-on-secondary shadow-lg ring-1 ring-cyan-400/25 transition hover:brightness-110 active:scale-[0.99] sm:text-lg"
            >
              <span aria-hidden>🎤</span>
              Start feedback
              <span aria-hidden>→</span>
            </button>
            <p className="mt-2 text-center text-[11px] text-aura-outline">
              Microphone turns on after you connect on the next screen.
            </p>
          </footer>
        </div>
      </main>
    );
  }

  if (phase === "thanks") {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-aura-bg px-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-10%] top-[-10%] h-[50%] w-[50%] rounded-full bg-aura-secondary/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-aura-tertiary/10 blur-[120px]" />
        </div>

        <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
          <div className="glass-panel mb-6 overflow-hidden rounded-[2rem] p-2 shadow-2xl">
            <img
              alt=""
              className="h-48 w-48 rounded-3xl object-cover shadow-xl sm:h-56 sm:w-56"
              src={thankYouHero}
            />
          </div>
          <h1 className="bg-gradient-to-r from-aura-secondary to-aura-tertiary bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            Thank you for your feedback!
          </h1>
          <p className="mt-3 text-aura-on-variant">{thanksSubtitle}</p>
          <button
            type="button"
            onClick={() => void resetToWelcome()}
            className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-gradient-to-br from-aura-secondary-container to-cyan-600 py-4 text-base font-bold text-white shadow-xl transition active:scale-[0.98]"
          >
            Done
            <span aria-hidden>↻</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col bg-aura-bg"
      style={{
        backgroundImage: `linear-gradient(rgba(5,20,36,0.92), rgba(5,20,36,0.95)), url(${sessionBackdrop})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#12141d]/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-aura-tertiary" aria-hidden>
            ◆
          </span>
          <span className="truncate text-sm font-bold text-aura-on-surface">Aura Feedback</span>
        </div>
        <div
          className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums ${
            remainingSeconds <= 60 ? "border-rose-400/50 text-rose-200" : "border-cyan-400/40 text-cyan-100"
          }`}
          title="Session time remaining"
        >
          {formatTime(remainingSeconds)}
        </div>
      </header>

      <section className="flex flex-1 flex-col px-4 pb-6 pt-4">
        <p className="text-center text-[10px] uppercase tracking-widest text-aura-outline">
          Voice · English only · TTS: {AGENT_TTS_PROVIDER}
        </p>
        <p className="mt-1 text-center text-xs text-aura-on-variant">
          LiveKit: <span className="text-aura-tertiary">{livekitState}</span>
        </p>

        <div className="mt-6 flex flex-1 flex-col items-center">
          <div
            className={`relative w-full max-w-[280px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-aura-surface/40 shadow-2xl backdrop-blur-md ${
              orbState === "speaking"
                ? "ai-orb-glow-speaking"
                : orbState === "listening"
                  ? "ai-orb-glow-listening"
                  : ""
            }`}
          >
            <img alt="Aura voice guide" className="aspect-square w-full object-cover" src={avatarImg} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#051424]/90 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-1/2 flex w-[88%] -translate-x-1/2 items-end justify-center gap-1 rounded-full border border-cyan-400/20 bg-black/30 px-3 py-2.5 backdrop-blur">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                <span
                  key={bar}
                  className={`ai-wave-bar ai-wave-bar-${waveState}`}
                  style={{ animationDelay: `${bar * 0.07}s` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-full border border-aura-tertiary/30 bg-black/50 px-4 py-2 backdrop-blur">
            <span className="text-sm text-aura-tertiary" aria-hidden>
              🎤
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-aura-tertiary">
              {livekitState === "connected" ? (aiSpeaking ? "Aura is speaking…" : "Listening…") : "Connecting…"}
            </span>
          </div>

          <div className="glass-panel mt-6 w-full max-w-md rounded-xl p-4 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-aura-tertiary">Live caption</p>
            <p className="mt-2 text-sm leading-relaxed text-aura-on-surface">
              {liveCaptionText || "Captions appear when the agent speaks (LiveKit agent mode)."}
            </p>
          </div>

          {livekitError ? <p className="mt-3 max-w-md text-center text-xs text-rose-300">{livekitError}</p> : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setSummaryOpen((v) => !v)}
            className={`rounded-full border px-4 py-2 text-xs ${
              summaryOpen ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-200"
            }`}
          >
            Summary
          </button>
        </div>

        <div className="mt-4">
          {livekitState === "connected" ? (
            <button
              type="button"
              onClick={() => void endCall()}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-400/30 bg-rose-600/25 py-4 text-sm font-semibold uppercase tracking-wide text-rose-100"
            >
              End session
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startCall()}
                disabled={isStarting}
                className={`w-full rounded-full py-4 text-base font-semibold transition ${
                  isStarting ? "cursor-not-allowed bg-cyan-500/10 text-cyan-200/60" : "bg-cyan-500/25 text-cyan-50 hover:bg-cyan-500/35"
                }`}
              >
                {isStarting ? "Starting…" : hasEverConnected ? "Reconnect" : "Start voice session"}
              </button>
              {requiresManualStart ? (
                <p className="mt-2 text-center text-[11px] text-aura-on-variant">iOS: tap Start to connect the microphone.</p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg px-4 pb-4 transition-all duration-300 ${
          summaryOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div
          className={`rounded-2xl border border-cyan-500/25 bg-[#0b1220]/95 p-4 shadow-2xl backdrop-blur-xl ${
            summaryOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-200">Summary</p>
            <button
              type="button"
              onClick={() => setSummaryOpen(false)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-cyan-50">
            {liveCaptionText || "Waiting for the agent…"}
          </div>
        </div>
      </div>
    </main>
  );
}
