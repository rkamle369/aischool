import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import auraVideo from "../aura-entry.mp4";
import auraExitVideo from "../aura-exit.mp4";
import sessionBackdrop from "../ai_feedback_session/screen.png";
import avatarImg from "../image.png/screen.png";

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE_URL = runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const LIVEKIT_URL = runtimeConfig.VITE_LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL || "";
const LIVEKIT_AGENT_MODE = (runtimeConfig.VITE_LIVEKIT_AGENT_MODE || import.meta.env.VITE_LIVEKIT_AGENT_MODE) !== "false";
const AURA_FEEDBACK_SECONDS = Number(
  runtimeConfig.VITE_AURA_FEEDBACK_SECONDS || import.meta.env.VITE_AURA_FEEDBACK_SECONDS || 300
);

/** Must match `livekit-agent/agent_prompts.json` → `feedback` and room prefix in `agent.py`. */
const FEEDBACK_AGENT = {
  id: "feedback",
  roomPrefix: "agent-feedback"
};

const INVALID_CLOSE_PHRASE = "your response is not correct. we are closing this session now.";
const CONNECT_TIMEOUT_MS = 15000;
const TOKEN_TIMEOUT_MS = 10000;
const AUDIO_UNLOCK_TIMEOUT_MS = 3000;
const EXIT_REDIRECT_MS = 10000;
const ENTRY_REPEAT_DELAY_MS = 10000;

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

function AuraLogoMark({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="aura-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#aura-grad)" strokeWidth="4" />
      <path
        d="M10 35c5 0 6-12 12-12s7 12 13 12 7-12 13-12 7 12 12 12"
        fill="none"
        stroke="url(#aura-grad)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path d="M24 44l8-11 8 11" fill="none" stroke="url(#aura-grad)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [phase, setPhase] = useState("welcome");
  const [welcomeVideoKey, setWelcomeVideoKey] = useState(0);

  const [livekitState, setLivekitState] = useState("disconnected");
  const [livekitError, setLivekitError] = useState("");

  const [aiSpeaking, setAiSpeaking] = useState(false);
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
  const welcomeVideoRef = useRef(null);
  const welcomeReplayTimerRef = useRef(null);
  const exitVideoRef = useRef(null);
  /** User just tapped “End session”; browser may allow unmuted video.play() in the same flow. */
  const exitPlayWithSoundRef = useRef(false);

  const unlockAudioPlayback = useCallback(async () => {
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

  const clearWelcomeReplayTimer = useCallback(() => {
    if (welcomeReplayTimerRef.current) {
      clearTimeout(welcomeReplayTimerRef.current);
      welcomeReplayTimerRef.current = null;
    }
  }, []);

  const disconnectLiveKit = useCallback(async () => {
    clearSessionTimers();
    if (assistantSpeakingTimeoutRef.current) {
      clearTimeout(assistantSpeakingTimeoutRef.current);
      assistantSpeakingTimeoutRef.current = null;
    }
    setAiSpeaking(false);
    assistantSegmentsRef.current.clear();

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

  const goToExitVideo = useCallback(async ({ playSound = false } = {}) => {
    exitPlayWithSoundRef.current = playSound;
    /** Show exit UI before awaiting disconnect so `video.play()` can run in the same gesture window as End. */
    setPhase("exit");
    setIsStarting(false);
    endingSessionRef.current = false;
    try {
      await disconnectLiveKit();
    } catch {
      // ignore teardown errors
    }
  }, [disconnectLiveKit]);

  const resetToWelcome = useCallback(async () => {
    await disconnectLiveKit();
    clearWelcomeReplayTimer();
    setPhase("welcome");
    setLivekitError("");
    setRemainingSeconds(AURA_FEEDBACK_SECONDS);
    setIsStarting(false);
    setHasEverConnected(false);
    setRequiresManualStart(false);
    setAiSpeaking(false);
    setWelcomeVideoKey((v) => v + 1);
    endingSessionRef.current = false;
  }, [clearWelcomeReplayTimer, disconnectLiveKit]);

  const connectLiveKit = useCallback(async () => {
    setLivekitError("");
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
        const normalizedTranscript = transcript.toLowerCase();
        if (normalizedTranscript.includes(INVALID_CLOSE_PHRASE) && !endingSessionRef.current) {
          endingSessionRef.current = true;
          setLivekitError("Session closed: validation did not pass.");
          setTimeout(() => {
            void goToExitVideo({ playSound: false });
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
        void goToExitVideo({ playSound: false });
      }, limit * 1000);
    }
  }, [disconnectLiveKit, goToExitVideo]);

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

  const endCall = useCallback(() => {
    void unlockAudioPlayback();
    void goToExitVideo({ playSound: true });
  }, [goToExitVideo, unlockAudioPlayback]);

  useEffect(() => {
    return () => {
      clearWelcomeReplayTimer();
      void disconnectLiveKit();
    };
  }, [clearWelcomeReplayTimer, disconnectLiveKit]);

  const handleWelcomeVideoEnded = useCallback(() => {
    const el = welcomeVideoRef.current;
    if (!el) return;
    clearWelcomeReplayTimer();
    welcomeReplayTimerRef.current = setTimeout(() => {
      const target = welcomeVideoRef.current;
      if (!target) return;
      target.currentTime = 0;
      void target.play().catch(() => {
        // Ignore autoplay restrictions; next user interaction can resume.
      });
      welcomeReplayTimerRef.current = null;
    }, ENTRY_REPEAT_DELAY_MS);
  }, [clearWelcomeReplayTimer]);

  useEffect(() => {
    if (phase !== "exit") return;
    const el = exitVideoRef.current;
    if (!el) return;
    el.currentTime = 0;
    const allowSound = exitPlayWithSoundRef.current;
    el.muted = !allowSound;
    const fallbackTimer = setTimeout(() => {
      void resetToWelcome();
    }, EXIT_REDIRECT_MS);
    const run = async () => {
      try {
        await el.play();
      } catch {
        if (allowSound) {
          try {
            el.muted = true;
            await el.play();
          } catch {
            // Keep exit screen visible; fallback timer handles redirect.
          }
        }
      }
    };
    void run();
    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [phase, resetToWelcome]);

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

  const topBrandBar = (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="flex items-center justify-center gap-3 border-b border-white/15 bg-black/50 px-3 py-2.5 backdrop-blur-md">
        <AuraLogoMark className="h-10 w-10" />
        <p className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-3xl font-black leading-none tracking-[0.06em] text-transparent">
          AURA
        </p>
      </div>
    </header>
  );

  if (phase === "welcome") {
    return (
      <main className="relative isolate mx-auto min-h-[100dvh] w-full max-w-lg overflow-hidden bg-black">
        <video
          key={welcomeVideoKey}
          ref={welcomeVideoRef}
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
          autoPlay
          playsInline
          preload="auto"
          onEnded={handleWelcomeVideoEnded}
          aria-hidden
        >
          <source src={auraVideo} type="video/mp4" />
        </video>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
        {topBrandBar}
        {/* Bottom readability strip for the CTA only */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-48 bg-gradient-to-t from-[#051424]/95 via-[#051424]/55 to-transparent"
          aria-hidden
        />

        <div className="relative z-10 flex min-h-[100dvh] flex-col justify-end px-4 pb-[max(12rem,calc(env(safe-area-inset-bottom)+6rem))] pt-16">
          <button
            type="button"
            onClick={beginFeedback}
            className="flex w-full items-center justify-center rounded-full border border-slate-700 bg-gradient-to-r from-[#171322] via-[#141a27] to-[#122633] px-6 py-5 text-2xl font-semibold text-white shadow-[0_16px_42px_rgba(0,0,0,0.62)] ring-1 ring-slate-500/40 transition hover:brightness-110 active:scale-[0.99]"
          >
            <span className="cta-zoom-content flex items-center gap-4">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-9 w-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
              Start feedback
            </span>
          </button>
        </div>
      </main>
    );
  }

  if (phase === "exit") {
    return (
      <main className="relative isolate mx-auto min-h-[100dvh] w-full max-w-lg overflow-hidden bg-black">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
        {topBrandBar}
        <video
          ref={exitVideoRef}
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
          autoPlay
          playsInline
          preload="auto"
          onEnded={() => void resetToWelcome()}
          onError={() => void resetToWelcome()}
          aria-label="Thank you"
        >
          <source src={auraExitVideo} type="video/mp4" />
        </video>
      </main>
    );
  }

  return (
    <main
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col bg-aura-bg"
      style={{
        backgroundImage: `linear-gradient(rgba(5,20,36,0.92), rgba(5,20,36,0.95)), url(${sessionBackdrop})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#12141d]/85 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <AuraLogoMark className="h-8 w-8" />
          <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-2xl font-black tracking-[0.06em] text-transparent">
            AURA
          </span>
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

      <section className="flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-stretch justify-center py-2">
            <div
              className={`relative w-full max-h-[min(72dvh,640px)] min-h-[min(52dvh,420px)] flex-1 overflow-hidden rounded-[1.75rem] border border-white/10 bg-aura-surface/40 shadow-2xl backdrop-blur-md sm:rounded-[2.25rem] ${
                orbState === "speaking"
                  ? "ai-orb-glow-speaking"
                  : orbState === "listening"
                    ? "ai-orb-glow-listening"
                    : ""
              }`}
            >
              <img
                alt="Aura voice guide"
                className="h-full w-full object-cover object-[center_15%]"
                src={avatarImg}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#051424]/88 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-1/2 flex w-[88%] max-w-sm -translate-x-1/2 items-end justify-center gap-1 rounded-full border border-cyan-400/20 bg-black/35 px-3 py-2.5 backdrop-blur">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                  <span
                    key={bar}
                    className={`ai-wave-bar ai-wave-bar-${waveState}`}
                    style={{ animationDelay: `${bar * 0.07}s` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-2 pt-1">
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-aura-tertiary/30 bg-black/55 px-4 py-2 backdrop-blur">
                <span className="text-sm text-aura-tertiary" aria-hidden>
                  🎤
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-aura-tertiary">
                  {livekitState === "connected" ? (aiSpeaking ? "Aura is speaking…" : "Listening…") : "Connecting…"}
                </span>
              </div>
            </div>

            {livekitError ? <p className="max-w-md px-1 text-center text-xs text-rose-300">{livekitError}</p> : null}

            <p className="text-center text-[11px] text-aura-on-variant">
              LiveKit: <span className="text-aura-tertiary">{livekitState}</span>
            </p>

            {livekitState === "connected" ? (
              <button
                type="button"
                onClick={() => void endCall()}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-400/30 bg-rose-600/25 py-3.5 text-sm font-semibold uppercase tracking-wide text-rose-100"
              >
                End session
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void startCall()}
                  disabled={isStarting}
                  className={`w-full rounded-full py-3.5 text-base font-semibold transition ${
                    isStarting ? "cursor-not-allowed bg-cyan-500/10 text-cyan-200/60" : "bg-cyan-500/25 text-cyan-50 hover:bg-cyan-500/35"
                  }`}
                >
                  {isStarting ? "Starting…" : hasEverConnected ? "Reconnect" : "Start voice session"}
                </button>
                {requiresManualStart ? (
                  <p className="text-center text-[11px] text-aura-on-variant">iOS: tap Start to connect the microphone.</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
