import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import mentorImage from "./assets/mentor.png";
import { AGENTS, getAgentById } from "./agents";

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE_URL = runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const LIVEKIT_URL = runtimeConfig.VITE_LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL || "";
const LIVEKIT_AGENT_MODE = (runtimeConfig.VITE_LIVEKIT_AGENT_MODE || import.meta.env.VITE_LIVEKIT_AGENT_MODE) !== "false";
const FEEDBACK_CALL_SECONDS = Number(
  runtimeConfig.VITE_FEEDBACK_CALL_SECONDS || import.meta.env.VITE_FEEDBACK_CALL_SECONDS || 120
);
const HEALTH_CALL_SECONDS = Number(
  runtimeConfig.VITE_HEALTH_CALL_SECONDS || import.meta.env.VITE_HEALTH_CALL_SECONDS || 300
);
const INTERVIEW_CALL_SECONDS = Number(
  runtimeConfig.VITE_INTERVIEW_CALL_SECONDS || import.meta.env.VITE_INTERVIEW_CALL_SECONDS || 600
);
const TUTOR_CALL_SECONDS = Number(runtimeConfig.VITE_TUTOR_CALL_SECONDS || import.meta.env.VITE_TUTOR_CALL_SECONDS || 900);
const HINDI_CALL_SECONDS = Number(
  runtimeConfig.VITE_HINDI_CALL_SECONDS || import.meta.env.VITE_HINDI_CALL_SECONDS || 300
);
const AGENT_TTS_PROVIDER = (
  runtimeConfig.VITE_AGENT_TTS_PROVIDER ||
  import.meta.env.VITE_AGENT_TTS_PROVIDER ||
  "openai"
).toLowerCase();
const INVALID_CLOSE_PHRASE = "your response is not correct. we are closing this session now.";

function normalizeLiveKitUrl(rawUrl) {
  const value = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("wss://") || value.startsWith("ws://")) return value;
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  return `wss://${value}`;
}

function buildRoomName(agent, suffix) {
  return `${agent.roomPrefix}-${suffix}`;
}

function getAgentCallLimitSeconds(agentId) {
  if (agentId === "feedback") return FEEDBACK_CALL_SECONDS;
  if (agentId === "health") return HEALTH_CALL_SECONDS;
  if (agentId === "interview") return INTERVIEW_CALL_SECONDS;
  if (agentId === "tutor") return TUTOR_CALL_SECONDS;
  if (agentId === "hindi-companion") return HINDI_CALL_SECONDS;
  return 300;
}

export default function App() {
  const [screen, setScreen] = useState("picker"); // picker | call
  const [selectedAgentId, setSelectedAgentId] = useState("tutor");
  const selectedAgent = useMemo(() => getAgentById(selectedAgentId) || AGENTS[0], [selectedAgentId]);
  const [search, setSearch] = useState("");

  const [livekitState, setLivekitState] = useState("disconnected");
  const [livekitError, setLivekitError] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [liveCaptionText, setLiveCaptionText] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [shouldAutoStartCall, setShouldAutoStartCall] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);

  const roomRef = useRef(null);
  const remoteAudioElementsRef = useRef(new Map());
  const assistantSpeakingTimeoutRef = useRef(null);
  const timerRef = useRef(null);
  const assistantSegmentsRef = useRef(new Map());
  const endingSessionRef = useRef(false);

  const unlockAudioPlayback = useCallback(async () => {
    setAudioUnlocked(true);
    try {
      const primer = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      );
      primer.muted = true;
      await primer.play();
      primer.pause();
    } catch {
      // best-effort
    }
  }, []);

  const disconnectLiveKit = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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
  }, []);

  const closeSessionToPicker = useCallback(async () => {
    try {
      await disconnectLiveKit();
    } finally {
      setScreen("picker");
      setIsStarting(false);
      setShouldAutoStartCall(false);
      endingSessionRef.current = false;
    }
  }, [disconnectLiveKit]);

  const connectLiveKit = useCallback(async () => {
    setLivekitError("");
    setLiveCaptionText("");
    setAiSpeaking(false);
    assistantSegmentsRef.current.clear();

    await disconnectLiveKit();

    const normalizedLivekitUrl = normalizeLiveKitUrl(LIVEKIT_URL);
    if (!normalizedLivekitUrl) {
      throw new Error("Missing VITE_LIVEKIT_URL in aiagents-frontend/.env");
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const roomName = buildRoomName(selectedAgent, suffix);
    const participantName = `mobile-${crypto.randomUUID().slice(0, 8)}`;

    const tokenResponse = await fetch(`${API_BASE_URL}/livekit/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName,
        participantName,
        // Backend will forward this as dispatch metadata; the agent uses it to pick correct prompts.
        tutorContext: {
          agentType: selectedAgent.id
        }
      })
    });

    if (!tokenResponse.ok) {
      let details = "";
      try {
        const payload = await tokenResponse.json();
        details = String(payload?.error || "").trim();
      } catch {
        details = "";
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
        setLivekitError("Remote audio playback blocked. Tap once on screen, then try again.");
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

      // De-dupe segments by id to avoid repeated "Hey hey hey" style captions.
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
          setLivekitError("Session closed: response validation failed.");
          setTimeout(() => {
            void closeSessionToPicker();
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

    await room.connect(normalizedLivekitUrl, token);
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
      // iOS Safari can reject advanced constraints (e.g. voiceIsolation).
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    const maxCallSeconds = getAgentCallLimitSeconds(selectedAgent.id);
    if (Number.isFinite(maxCallSeconds) && maxCallSeconds > 0) {
      timerRef.current = setTimeout(() => {
        if (endingSessionRef.current) return;
        endingSessionRef.current = true;
        setLivekitError("Session ended: time limit reached.");
        void closeSessionToPicker();
      }, maxCallSeconds * 1000);
    }
  }, [selectedAgent, closeSessionToPicker]);

  const startCall = useCallback(async () => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setLivekitError("");
    setLivekitState("connecting");
    await unlockAudioPlayback();
    try {
      setScreen("call");
      await connectLiveKit();
    } catch (error) {
      setLivekitError(String(error?.message || error || "Failed to start call."));
      setScreen("call");
      setLivekitState("disconnected");
    } finally {
      setIsStarting(false);
    }
  }, [connectLiveKit, unlockAudioPlayback, isStarting]);

  const endCall = useCallback(async ({ speakGoodbye = true } = {}) => {
    // Optional goodbye via browser TTS (frontend-only).
    try {
      if (speakGoodbye && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(
          selectedAgent.id === "feedback"
            ? "Thank you for your feedback. Goodbye."
            : "Thanks for chatting. Goodbye."
        );
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch {
      // ignore
    }
    try {
      await closeSessionToPicker();
    } finally {
      // no-op; closeSessionToPicker handles teardown and state reset.
    }
  }, [closeSessionToPicker, selectedAgent.id]);

  useEffect(() => {
    if (screen !== "call" || !shouldAutoStartCall || isStarting) {
      return;
    }
    void startCall();
    setShouldAutoStartCall(false);
  }, [screen, shouldAutoStartCall, isStarting, startCall]);

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

  // Only animate wave bars while the AI is actively speaking.
  const waveState = aiSpeaking ? "speaking" : "static";

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return AGENTS;
    return AGENTS.filter(
      (a) => a.name.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q) || a.id.includes(q)
    );
  }, [search]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-4 pb-6 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/90">Personal AI Agents</p>
          <p className="mt-1 text-sm text-slate-300/80">Mobile-first voice agents</p>
        </div>
        {!audioUnlocked ? (
          <button
            type="button"
            onClick={unlockAudioPlayback}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100"
          >
            Enable Audio
          </button>
        ) : null}
      </header>

      {screen === "picker" ? (
        <section className="mt-6 flex flex-1 flex-col gap-4">
          <div className="rounded-3xl border border-white/10 bg-[#1d1a24]/45 p-4 backdrop-blur-xl">
            <p className="text-sm font-semibold text-slate-100">Agents</p>
            <div className="mt-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredAgents.map((agent) => {
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setScreen("call");
                    setShouldAutoStartCall(true);
                  }}
                  className="rounded-2xl border border-white/10 bg-[#1d1a24]/40 px-4 py-4 text-left backdrop-blur-xl transition hover:border-white/20"
                >
                  <p className="text-sm font-semibold text-slate-50">{agent.name}</p>
                  <p className="mt-1 text-xs text-slate-300/80">{agent.subtitle}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-6 flex flex-1 flex-col">
          <div className="rounded-3xl border border-white/10 bg-[#1d1a24]/45 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">{selectedAgent.name}</p>
                <p className="mt-1 text-xs text-slate-300/80">
                  LiveKit: <span className="text-cyan-200">{livekitState}</span>
                </p>
                <p className="mt-1 text-xs text-slate-300/80">
                  Voice Provider: <span className="text-emerald-300">{AGENT_TTS_PROVIDER}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSummaryOpen((v) => !v)}
                  className={`rounded-full border px-3 py-2 text-xs ${
                    summaryOpen
                      ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-black/20 text-slate-200"
                  }`}
                  title="Toggle summary"
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={endCall}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200"
                  title="End call"
                >
                  End
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#1d1a24]/45 p-4 backdrop-blur-xl">
            <div
              className={`relative w-60 overflow-hidden rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_80px_rgba(124,58,237,0.25)] ${
                orbState === "speaking" ? "ai-tutor-glow-speaking" : orbState === "listening" ? "ai-tutor-glow-listening" : ""
              }`}
            >
              <img alt="AI Mentor" className="h-60 w-full object-cover" src={mentorImage} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#15121b] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-1/2 flex w-[85%] -translate-x-1/2 items-end justify-center gap-1 rounded-full border border-cyan-300/20 bg-black/25 px-4 py-3 backdrop-blur">
                {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                  <span
                    key={bar}
                    className={`ai-wave-bar ai-wave-bar-${waveState}`}
                    style={{ animationDelay: `${bar * 0.08}s` }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xl font-semibold text-cyan-100">Lumina Mentor</p>
              <p className="mt-1 text-base font-medium text-cyan-200">{selectedAgent.name}</p>
            </div>

            {livekitError ? <p className="mt-3 text-xs text-rose-300">{livekitError}</p> : null}
          </div>

          {/* Bottom controls */}
          <div className="mt-4">
            {livekitState === "connected" ? (
              <button
                type="button"
                onClick={endCall}
                className="w-full rounded-full border border-rose-300/30 bg-rose-500/20 px-4 py-4 text-base font-semibold text-rose-100"
              >
                End
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startCall}
                  disabled={isStarting}
                  className={`w-full rounded-full px-4 py-4 text-base font-semibold text-cyan-100 transition ${
                    isStarting
                      ? "cursor-not-allowed bg-cyan-400/10 opacity-70"
                      : "bg-cyan-400/20 hover:bg-cyan-400/25"
                  }`}
                >
                  {isStarting ? "Starting..." : livekitState === "disconnected" && hasEverConnected ? "Reconnect" : "Start"}
                </button>
                <p className="mt-2 text-center text-[11px] text-slate-300/80">
                  iPhone tip: tap <span className="font-semibold text-cyan-200">Start</span> to unlock audio.
                </p>
              </>
            )}
          </div>

          {/* Summary bottom-sheet (default off) */}
          <div
            className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px] px-4 pb-4 transition-all duration-300 ${
              summaryOpen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
          >
            <div
              className={`rounded-3xl border border-cyan-500/20 bg-[#0b1220]/90 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
                summaryOpen ? "pointer-events-auto" : "pointer-events-none"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200">Quick Summary</p>
                <button
                  type="button"
                  onClick={() => setSummaryOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 max-h-44 overflow-y-auto rounded-2xl border border-cyan-400/20 bg-black/20 p-3">
                <p className="whitespace-pre-line text-sm leading-relaxed text-cyan-100">
                  {liveCaptionText || "Waiting for the first voice response..."}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
