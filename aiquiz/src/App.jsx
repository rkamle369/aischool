import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { QUIZ_COURSES } from "./quizData";

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE_URL = runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const LIVEKIT_URL = runtimeConfig.VITE_LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL || "";
const PASS_PERCENT = Number(runtimeConfig.VITE_QUIZ_PASS_PERCENT || import.meta.env.VITE_QUIZ_PASS_PERCENT || 90);

function normalizeLiveKitUrl(rawUrl) {
  const value = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("wss://") || value.startsWith("ws://")) return value;
  if (value.startsWith("https://")) return value.replace("https://", "wss://");
  if (value.startsWith("http://")) return value.replace("http://", "ws://");
  return `wss://${value}`;
}

function parseVoiceAnswer(rawText, question) {
  const text = String(rawText || "").toLowerCase().trim();
  if (!text) return null;

  const normalized = text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const checks = [
    { idx: 0, patterns: ["option a", " a ", "answer a", "ay", "first", "one", "1"] },
    { idx: 1, patterns: ["option b", " b ", "answer b", "bee", "second", "two", "2"] },
    { idx: 2, patterns: ["option c", " c ", "answer c", "see", "third", "three", "3"] },
    { idx: 3, patterns: ["option d", " d ", "answer d", "dee", "fourth", "four", "4"] }
  ];
  for (const entry of checks) {
    if (entry.patterns.some((p) => (` ${normalized} `).includes(` ${p} `))) {
      return entry.idx;
    }
  }

  // Fallback: map spoken answer to option text itself.
  if (question?.options?.length === 4) {
    const optionTexts = question.options.map((opt) =>
      String(opt || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
    const matchedIndex = optionTexts.findIndex((opt) => opt && normalized.includes(opt));
    if (matchedIndex >= 0) return matchedIndex;
  }

  return null;
}

function getProgressMap() {
  try {
    return JSON.parse(localStorage.getItem("aiquiz-progress") || "{}");
  } catch {
    return {};
  }
}

function setProgressMap(value) {
  localStorage.setItem("aiquiz-progress", JSON.stringify(value));
}

export default function App() {
  const [selectedCourseId, setSelectedCourseId] = useState(QUIZ_COURSES[0].id);
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [screen, setScreen] = useState("topics");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [quizPhase, setQuizPhase] = useState("idle");
  const [livekitState, setLivekitState] = useState("disconnected");
  const [isStartingLevel, setIsStartingLevel] = useState(false);
  const [error, setError] = useState("");
  const [progressMap, setProgress] = useState(getProgressMap());

  const roomRef = useRef(null);
  const recognitionRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const listenKickoffTimerRef = useRef(null);
  const micPermissionRef = useRef(false);
  const answeringRef = useRef(false);

  const selectedCourse = useMemo(
    () => QUIZ_COURSES.find((course) => course.id === selectedCourseId) || QUIZ_COURSES[0],
    [selectedCourseId]
  );
  const selectedLevel = useMemo(
    () => selectedCourse.levels.find((level) => level.id === selectedLevelId) || null,
    [selectedCourse, selectedLevelId]
  );
  const activeQuestion = selectedLevel?.questions[questionIndex] || null;
  const answeredCount = questionIndex;
  const percentage = selectedLevel ? Math.round((score / selectedLevel.questions.length) * 100) : 0;

  const courseProgress = progressMap[selectedCourse.id] || {};

  const connectLiveKit = async (courseId, levelId) => {
    await disconnectLiveKit();
    if (!LIVEKIT_URL) return;
    const normalized = normalizeLiveKitUrl(LIVEKIT_URL);
    const roomName = `quiz-${courseId}-${levelId}-${crypto.randomUUID().slice(0, 6)}`;
    const participantName = `quiz-user-${crypto.randomUUID().slice(0, 6)}`;

    const tokenResponse = await fetch(`${API_BASE_URL}/livekit/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName,
        participantName,
        tutorContext: { agentType: "quiz", courseId, levelId }
      })
    });
    if (!tokenResponse.ok) {
      throw new Error("Unable to fetch LiveKit token from backend.");
    }
    const { token } = await tokenResponse.json();
    const room = new Room();
    roomRef.current = room;
    room.on(RoomEvent.Reconnecting, () => setLivekitState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => setLivekitState("connected"));
    room.on(RoomEvent.Disconnected, () => setLivekitState("disconnected"));
    await room.connect(normalized, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    setLivekitState("connected");
  };

  const disconnectLiveKit = async () => {
    try {
      await roomRef.current?.disconnect();
    } finally {
      roomRef.current = null;
      setLivekitState("disconnected");
    }
  };

  const stopVoiceCapture = useCallback(() => {
    if (listenKickoffTimerRef.current) {
      clearTimeout(listenKickoffTimerRef.current);
      listenKickoffTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    } finally {
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, []);

  const speakQuestion = useCallback((question, onEnd) => {
    if (!question) {
      onEnd?.();
      return;
    }
    if (!window.speechSynthesis) {
      onEnd?.();
      return;
    }
    try {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        onEnd?.();
      };
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `${question.question}. Option A: ${question.options[0]}. Option B: ${question.options[1]}. Option C: ${question.options[2]}. Option D: ${question.options[3]}.`
      );
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        finish();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        finish();
      };
      // Improve probability of finding an English voice across browsers.
      const voices = window.speechSynthesis.getVoices?.() || [];
      const preferred = voices.find((v) => /^en(-|_)/i.test(v.lang || ""));
      if (preferred) {
        utterance.voice = preferred;
        utterance.lang = preferred.lang || "en-US";
      }
      window.speechSynthesis.speak(utterance);
      // Failsafe: if browser blocks speech callbacks, continue quiz flow.
      setTimeout(() => {
        finish();
      }, 2600);
    } catch {
      onEnd?.();
    }
  }, []);

  const speakFeedback = useCallback((text, onEnd) => {
    if (!text) {
      onEnd?.();
      return;
    }
    if (!window.speechSynthesis) {
      onEnd?.();
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.96;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        onEnd?.();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        onEnd?.();
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      onEnd?.();
    }
  }, []);

  const submitAnswer = useCallback((optionIndex) => {
    if (!activeQuestion || optionIndex == null) return;
    if (answeringRef.current) return;
    answeringRef.current = true;
    stopVoiceCapture();
    setQuizPhase("evaluating");
    const isCorrect = optionIndex === activeQuestion.correct;
    const nextScore = isCorrect ? score + 1 : score;
    setScore(nextScore);
    const feedbackText = `${isCorrect ? "Correct." : "Not correct."} ${activeQuestion.explanation}`;
    setFeedback(feedbackText);
    setQuizPhase("feedback");
    speakFeedback(feedbackText);

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      const nextIndex = questionIndex + 1;
      if (!selectedLevel) return;
      if (nextIndex >= selectedLevel.questions.length) {
        const finalPercent = Math.round((nextScore / selectedLevel.questions.length) * 100);
        const passed = finalPercent >= PASS_PERCENT;
        const updated = {
          ...progressMap,
          [selectedCourse.id]: {
            ...(progressMap[selectedCourse.id] || {}),
            [selectedLevel.id]: { score: finalPercent, passed }
          }
        };
        setProgress(updated);
        setProgressMap(updated);
        setScreen("result");
        setQuizPhase("idle");
        answeringRef.current = false;
        return;
      }
      setQuestionIndex(nextIndex);
      setFeedback("");
      setQuizPhase("reading");
      answeringRef.current = false;
    }, 1800);
  }, [activeQuestion, questionIndex, score, selectedCourse, selectedLevel, progressMap, speakFeedback, stopVoiceCapture]);

  const startVoiceCapture = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported in this browser. Use touch options.");
      return;
    }
    if (isListening) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const text = result?.[0]?.transcript || "";
        setVoiceTranscript(text);
        const option = parseVoiceAnswer(text, activeQuestion);
        if (option != null) {
          submitAnswer(option);
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      const code = String(event?.error || "").trim();
      if (code === "aborted") {
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Microphone permission blocked. Please allow mic access, then use touch or retry voice.");
      } else if (code === "no-speech") {
        setError("I did not hear you. Please say option A, B, C, or D.");
      } else {
        setError("Voice capture failed. Please try again.");
      }
      // Keep UI stable; do not bounce phases on transient speech errors.
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Keep open-listening mode while quiz is active, but avoid rapid restart thrash.
      if (!answeringRef.current && screen === "quiz" && !isSpeaking) {
        setTimeout(() => {
          startVoiceCapture();
        }, 650);
      }
    };
    try {
      recognition.start();
    } catch {
      setError("Voice capture could not start. Please tap Answer by Voice again.");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [activeQuestion, isListening, isSpeaking, screen, submitAnswer]);

  const startLevel = async (levelId) => {
    if (isStartingLevel) return;
    setIsStartingLevel(true);
    setError("");
    setSelectedLevelId(levelId);
    setQuestionIndex(0);
    setScore(0);
    setFeedback("");
    setVoiceTranscript("");
    setScreen("quiz");
    try {
      if (!micPermissionRef.current && navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        micPermissionRef.current = true;
      }
      setLivekitState("connecting");
      await connectLiveKit(selectedCourse.id, levelId);
    } catch (e) {
      setError(String(e?.message || e));
      setLivekitState("disconnected");
    } finally {
      setIsStartingLevel(false);
    }
  };

  const restartLevel = () => {
    if (!selectedLevel) return;
    void startLevel(selectedLevel.id);
  };

  const closeLevel = async () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    stopVoiceCapture();
    window.speechSynthesis?.cancel?.();
    setIsListening(false);
    setQuizPhase("idle");
    await disconnectLiveKit();
    setScreen("levels");
    speakFeedback("Goodbye. Level closed.");
  };

  useEffect(() => {
    if (screen !== "quiz" || !activeQuestion) return;
    // Calm flow: start speech first, then listening shortly after.
    stopVoiceCapture();
    speakQuestion(activeQuestion);
    if (listenKickoffTimerRef.current) clearTimeout(listenKickoffTimerRef.current);
    listenKickoffTimerRef.current = setTimeout(() => {
      if (!answeringRef.current && screen === "quiz") {
        startVoiceCapture();
      }
      listenKickoffTimerRef.current = null;
    }, 900);
    return () => {
      if (listenKickoffTimerRef.current) {
        clearTimeout(listenKickoffTimerRef.current);
        listenKickoffTimerRef.current = null;
      }
    }
  }, [screen, activeQuestion?.id, speakQuestion, startVoiceCapture, stopVoiceCapture]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (listenKickoffTimerRef.current) clearTimeout(listenKickoffTimerRef.current);
      window.speechSynthesis?.cancel?.();
      void disconnectLiveKit();
      stopVoiceCapture();
    };
  }, [stopVoiceCapture]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] px-4 pb-8 pt-5 text-slate-100">
      <header className="rounded-3xl border border-white/10 bg-[#1d1a24]/50 p-4 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/90">AI Quiz</p>
        <h1 className="mt-1 text-xl font-semibold">Voice-first quiz app</h1>
        <p className="mt-1 text-xs text-slate-300">LiveKit: {livekitState} | Pass threshold: {PASS_PERCENT}%</p>
      </header>

      {screen === "topics" ? (
        <section className="page-transition mt-4 space-y-3">
          {QUIZ_COURSES.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => {
                setSelectedCourseId(course.id);
                setScreen("levels");
              }}
              className={`w-full rounded-2xl border px-4 py-4 text-left ${
                selectedCourseId === course.id ? "border-cyan-300/50 bg-cyan-500/10" : "border-white/10 bg-[#1d1a24]/40"
              }`}
            >
              <p className="text-sm font-semibold">{course.title}</p>
              <p className="text-xs text-slate-300">{course.subtitle}</p>
            </button>
          ))}
        </section>
      ) : null}

      {screen === "levels" ? (
        <section className="page-transition mt-4 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-[#1d1a24]/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{selectedCourse.title} Levels</p>
              <button
                type="button"
                onClick={() => setScreen("topics")}
                className="rounded-lg border border-white/20 px-3 py-1 text-xs"
              >
                Back
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {selectedCourse.levels.map((level, idx) => {
                const previousLevel = selectedCourse.levels[idx - 1];
                const previousPassed = previousLevel ? Boolean(courseProgress[previousLevel.id]?.passed) : true;
                const locked = idx > 0 && !previousPassed;
                return (
                  <button
                    key={level.id}
                    type="button"
                    disabled={locked || isStartingLevel}
                    onClick={() => void startLevel(level.id)}
                    className={`rounded-xl px-3 py-3 text-sm ${
                      locked || isStartingLevel
                        ? "cursor-not-allowed border border-slate-700 bg-slate-900/40 text-slate-500"
                        : "border border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                    }`}
                  >
                    {level.name} {courseProgress[level.id]?.passed ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {screen === "quiz" && activeQuestion ? (
        <section className="page-transition mt-4 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-[#1d1a24]/50 p-4">
            <p className="text-xs text-slate-300">
              Question {questionIndex + 1} / {selectedLevel.questions.length} | Score: {score} | Answered: {answeredCount}
            </p>
            <p className="mt-2 text-base font-semibold">{activeQuestion.question}</p>
            <p className="mt-2 text-xs text-cyan-200">
              {quizPhase === "feedback"
                ? "Explaining answer..."
                : isSpeaking
                  ? "Question is being read..."
                  : isListening
                    ? "Listening for your answer..."
                    : "Conversation mode ready"}
            </p>
          </div>

          <div className="grid gap-2">
            {activeQuestion.options.map((opt, idx) => (
              <button
                key={opt}
                type="button"
                onClick={() => submitAnswer(idx)}
                className="rounded-xl border border-white/10 bg-[#1d1a24]/40 px-4 py-3 text-left text-sm hover:border-cyan-300/40"
              >
                {String.fromCharCode(65 + idx)}. {opt}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  stopVoiceCapture();
                } else {
                  startVoiceCapture();
                }
              }}
              className="rounded-xl bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-100"
            >
              {isListening ? "Voice On (Tap to pause)" : "Voice Off (Tap to resume)"}
            </button>
            <button
              type="button"
              onClick={() => {
                recognitionRef.current?.stop?.();
                speakQuestion(activeQuestion, () => startVoiceCapture());
              }}
              className="rounded-xl border border-white/20 px-4 py-3 text-sm"
            >
              Read Question
            </button>
          </div>

          {voiceTranscript ? <p className="text-xs text-cyan-200">Heard: {voiceTranscript}</p> : null}
          {feedback ? <p className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">{feedback}</p> : null}
          {isSpeaking ? <p className="text-xs text-slate-300">Agent speaking...</p> : null}
          <button type="button" onClick={closeLevel} className="w-full rounded-xl border border-white/20 px-4 py-3 text-sm">
            Close Level
          </button>
        </section>
      ) : null}

      {screen === "result" ? (
        <section className="page-transition mt-4 rounded-2xl border border-white/10 bg-[#1d1a24]/50 p-5">
          <p className="text-sm text-slate-300">Level Completed</p>
          <p className="mt-1 text-2xl font-semibold">{percentage}%</p>
          <p className="mt-2 text-sm text-slate-200">
            {percentage >= PASS_PERCENT
              ? "Great work. You unlocked the next level."
              : `You need ${PASS_PERCENT}% to unlock next level. This level will restart.`}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={restartLevel} className="rounded-xl bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-100">
              Restart Level
            </button>
            <button type="button" onClick={() => setScreen("levels")} className="rounded-xl border border-white/20 px-4 py-3 text-sm">
              Back to Levels
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
    </main>
  );
}

