import { useEffect, useMemo, useRef } from "react";
import tutorImage from "../assets/screen.png";

const ChatWindow = ({
  selectedChapter,
  input,
  liveCaptionText,
  liveListeningText,
  startupHint,
  isLoading,
  isListening,
  aiSpeaking,
  voiceSupported,
  livekitState,
  livekitError,
  audioUnlocked,
  onUnlockAudio,
  onEndSession
}) => {
  const orbState = !selectedChapter
    ? "idle"
    : aiSpeaking
      ? "speaking"
      : isLoading
        ? "thinking"
        : isListening
          ? "listening"
          : "idle";

  const aiBulletPoints = useMemo(() => {
    const text = String(liveCaptionText || "").trim();
    if (!text) {
      return [];
    }
    return text
      .split(/[.!?]\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8);
  }, [liveCaptionText]);

  const aiSummary = useMemo(
    () =>
      String(liveCaptionText || "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    [liveCaptionText]
  );
  const summaryScrollRef = useRef(null);

  const formattedSummary = useMemo(() => {
    if (!aiSummary) {
      return "";
    }
    return aiSummary
      .replace(/\s+([0-9]+\.)\s+/g, "\n$1 ")
      .replace(/([.?!])\s+(?=[A-Z])/g, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, [aiSummary]);

  useEffect(() => {
    const container = summaryScrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [formattedSummary]);

  return (
    <section className="relative flex h-screen flex-1 flex-col overflow-hidden bg-[#15121b] p-4 lg:p-5">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-violet-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-[120px]" />

      <header className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-[#1d1a24]/60 px-4 py-3 backdrop-blur-xl">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/90">Realtime Voice Tutor</p>
          <h2 className="mt-1 text-xl font-semibold text-[#e8dfee]">
            {selectedChapter ? selectedChapter.title : "Choose a topic to start"}
          </h2>
        </div>
        <div className="text-right text-xs text-[#ccc3d8]">
          <p>
            LiveKit:{" "}
            <span
              className={
                livekitState === "connected"
                  ? "text-cyan-300"
                  : livekitState === "reconnecting"
                    ? "text-amber-300"
                    : livekitState === "connecting"
                      ? "text-blue-300"
                      : "text-[#958da1]"
              }
            >
              {livekitState[0].toUpperCase() + livekitState.slice(1)}
            </span>
          </p>
          <p>
            Voice:{" "}
            <span className={!voiceSupported ? "text-amber-300" : "text-emerald-300"}>
              {!voiceSupported ? "Unsupported browser" : "Hands-free"}
            </span>
          </p>
        </div>
      </header>

      <div className="mb-3 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="relative flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#1d1a24]/45 p-4 backdrop-blur-xl">
          <div className="flex flex-col items-center">
            <div
              className={`relative w-56 overflow-hidden rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_80px_rgba(124,58,237,0.25)] md:h-[360px] md:w-[360px] ${
                orbState === "speaking" ? "ai-tutor-glow-speaking" : orbState === "listening" ? "ai-tutor-glow-listening" : ""
              }`}
            >
              <img
                alt="AI Tutor"
                className="h-56 w-full object-cover md:h-[360px]"
                src={tutorImage}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#15121b] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-1/2 flex w-[85%] -translate-x-1/2 items-end justify-center gap-1 rounded-full border border-cyan-300/20 bg-black/25 px-4 py-3 backdrop-blur">
                {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                  <span
                    key={bar}
                    className={`ai-wave-bar ai-wave-bar-${orbState}`}
                    style={{ animationDelay: `${bar * 0.08}s` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-xl font-semibold text-cyan-100">Dr. Anya Sharma</p>
              <p className="mt-1 text-base font-medium text-cyan-200">AI Tutor</p>
            </div>
            {!audioUnlocked ? (
              <button
                className="mt-3 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/20"
                onClick={onUnlockAudio}
                type="button"
              >
                Enable Audio
              </button>
            ) : null}
            {livekitError ? <p className="mt-2 text-xs text-rose-300">{livekitError}</p> : null}
          </div>
        </div>

        <div className="flex min-h-[360px] flex-col rounded-3xl border border-white/10 bg-[#1d1a24]/45 p-4 backdrop-blur-xl">
          <div className="flex h-full min-h-[360px] flex-col rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200">Quick Summary</p>
            <div
              ref={summaryScrollRef}
              className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-cyan-400/20 bg-black/10 p-3"
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-cyan-100">
                {formattedSummary ||
                  startupHint ||
                  "The latest AI explanation summary will appear here."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100 backdrop-blur">
        <button
          type="button"
          onClick={onEndSession}
          className="rounded-full border border-rose-300/30 bg-rose-500/20 px-3 py-1 text-[11px] text-rose-100 hover:bg-rose-500/30"
        >
          End Session
        </button>
        {selectedChapter
          ? `Listening transcript: ${liveListeningText || input || "Waiting for your speech..."}`
          : "Select a topic from the left to instantly start the voice agent."}
      </div>
    </section>
  );
};

export default ChatWindow;
