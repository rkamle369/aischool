import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import ChatWindow from "./components/ChatWindow";
import LandingPage from "./components/LandingPage";
import SessionSummaryPage from "./components/SessionSummaryPage";
import Sidebar from "./components/Sidebar";
import TutorProfilePage from "./components/TutorProfilePage";

const runtimeConfig = window.__APP_CONFIG__ || {};
const API_BASE_URL = runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const LIVEKIT_URL = runtimeConfig.VITE_LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL || "";
const LIVEKIT_SELF_HOSTED =
  (runtimeConfig.VITE_LIVEKIT_SELF_HOSTED || import.meta.env.VITE_LIVEKIT_SELF_HOSTED) === "true";
const LIVEKIT_AGENT_MODE =
  (runtimeConfig.VITE_LIVEKIT_AGENT_MODE || import.meta.env.VITE_LIVEKIT_AGENT_MODE) === "true";
const BROWSER_TTS_FALLBACK_ENABLED =
  (runtimeConfig.VITE_DISABLE_BROWSER_TTS_FALLBACK || import.meta.env.VITE_DISABLE_BROWSER_TTS_FALLBACK) !== "true";
const AUTO_SEND_SILENCE_MS = Number(
  runtimeConfig.VITE_AUTO_SEND_SILENCE_MS || import.meta.env.VITE_AUTO_SEND_SILENCE_MS || 1800
);
const TTS_PLAYBACK_RATE = Number(runtimeConfig.VITE_TTS_PLAYBACK_RATE || import.meta.env.VITE_TTS_PLAYBACK_RATE || 1.05);

const normalizeLiveKitUrl = (rawUrl) => {
  const value = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!value) {
    return "";
  }
  if (value.startsWith("wss://") || value.startsWith("ws://")) {
    return value;
  }
  if (value.startsWith("https://")) {
    return value.replace("https://", "wss://");
  }
  if (value.startsWith("http://")) {
    return value.replace("http://", "ws://");
  }
  return `wss://${value}`;
};

const makeMessage = (role, content) => ({
  id: crypto.randomUUID(),
  role,
  content
});

const normalizeTextForSpeech = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[_~>#]/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/(^|\s)[*-]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildInstantCourseIntro = (course, chapter) => {
  const courseTitle = course?.title || "this course";
  const chapterTitle = chapter?.title || "the first chapter";
  const chapterNames = (course?.subjects || [])
    .flatMap((subject) => subject.chapters || [])
    .slice(0, 4)
    .map((item) => item.title)
    .filter(Boolean);

  const chapterPreview =
    chapterNames.length > 0
      ? `We will cover topics like ${chapterNames.join(", ")}.`
      : "We will break concepts down step by step with practical examples.";

  return `Welcome to ${courseTitle}. ${chapterPreview} We will begin with ${chapterTitle}. Tell me what you are most interested to learn first, and I will teach it clearly in small steps.`;
};

function App() {
  const [courses, setCourses] = useState([]);
  const [view, setView] = useState("landing");
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeListening, setActiveListening] = useState(false);
  const [liveCaptionText, setLiveCaptionText] = useState("");
  const [liveListeningText, setLiveListeningText] = useState("");
  const [startupHint, setStartupHint] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [livekitConnected, setLivekitConnected] = useState(false);
  const [livekitState, setLivekitState] = useState("disconnected");
  const [livekitError, setLivekitError] = useState("");
  const recognitionRef = useRef(null);
  const roomRef = useRef(null);
  const messagesRef = useRef([]);
  const isListeningRef = useRef(false);
  const activeListeningRef = useRef(false);
  const isLoadingRef = useRef(false);
  const shouldAutoSendRef = useRef(false);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const silenceTimerRef = useRef(null);
  const selectedChapterRef = useRef(null);
  const selectedCourseRef = useRef(null);
  const speechQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const connectAttemptRef = useRef(0);
  const assistantRevealTimerRef = useRef(null);
  const preferredVoiceRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const hasUserInteractedRef = useRef(false);
  const shouldDelayGreetingRef = useRef(false);
  const sessionRunIdRef = useRef(0);
  const chatAbortRef = useRef(null);
  const ttsAbortRef = useRef(null);
  const remoteAudioElementsRef = useRef(new Map());
  const transcriptionStateRef = useRef({
    assistant: new Map(),
    user: new Map()
  });
  const assistantSpeakingTimeoutRef = useRef(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const loadCourses = async () => {
      const response = await fetch(`${API_BASE_URL}/courses`);
      const data = await response.json();
      setCourses(data.courses || []);
    };

    loadCourses().catch((error) => {
      console.error("Failed to load courses", error);
    });
  }, []);

  const backendMessages = useMemo(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages]
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (liveCaptionText.trim()) {
      setStartupHint("");
    }
  }, [liveCaptionText]);

  useEffect(() => {
    selectedChapterRef.current = selectedChapter;
  }, [selectedChapter]);

  useEffect(() => {
    selectedCourseRef.current = selectedCourse;
  }, [selectedCourse]);

  const startRecognitionSafely = () => {
    const recognition = recognitionRef.current;
    if (!recognition || isListeningRef.current) {
      return;
    }

    try {
      recognition.start();
      setIsListening(true);
      isListeningRef.current = true;
      setLivekitError("");
    } catch (error) {
      if (error?.name === "InvalidStateError") {
        // Browser is already listening; ignore noisy duplicate starts.
        return;
      }
      throw error;
    }
  };

  const pickBestVoice = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return null;
    }
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      return null;
    }

    const preferredNames = [
      "Samantha",
      "Google UK English Female",
      "Google US English",
      "Victoria",
      "Ava",
      "Karen"
    ];

    for (const name of preferredNames) {
      const match = voices.find((voice) => voice.name === name);
      if (match) {
        return match;
      }
    }

    return voices.find((voice) => voice.lang?.startsWith("en")) || voices[0];
  };

  const ensureMicrophonePermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setLivekitError("Microphone permission denied. Please allow mic access in browser settings.");
      throw error;
    }
  };

  const finishSpeaking = () => {
    isSpeakingRef.current = false;
    setAiSpeaking(false);
    void roomRef.current?.localParticipant
      ?.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true
      })
      .catch(() => {});
    if (activeListeningRef.current && recognitionRef.current && !isLoadingRef.current) {
      startRecognitionSafely();
    }
  };

  const unlockAudioPlayback = async () => {
    hasUserInteractedRef.current = true;
    try {
      const primer = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      );
      primer.muted = true;
      await primer.play();
      primer.pause();
    } catch {
      // Some browsers block even muted primer playback; the user gesture still helps.
    }
    setAudioUnlocked(true);
    setLivekitError("");
  };

  const fetchServerTtsAudio = async (text) => {
    if (!hasUserInteractedRef.current) {
      throw new Error("Audio blocked until user interaction. Click anywhere in the app once.");
    }

    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
    }
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    const response = await fetch(`${API_BASE_URL}/chat/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Server TTS playback failed: ${details}`);
    }

    return response.blob();
  };

  const playAudioBlob = async (audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.playbackRate = Number.isFinite(TTS_PLAYBACK_RATE) ? TTS_PLAYBACK_RATE : 0.9;
    ttsAudioRef.current = audio;

    audio.onplay = () => {
      setAiSpeaking(true);
      isSpeakingRef.current = true;
      setLivekitError("");
    };
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      ttsAudioRef.current = null;
      finishSpeaking();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      ttsAudioRef.current = null;
      finishSpeaking();
    };

    try {
      await audio.play();
    } catch (error) {
      URL.revokeObjectURL(audioUrl);
      ttsAudioRef.current = null;
      throw error;
    }
  };

  const playServerTts = async (text, preloadedAudioBlob = null) => {
    const audioBlob = preloadedAudioBlob || (await fetchServerTtsAudio(text));
    await playAudioBlob(audioBlob);
  };

  const speakNextChunk = () => {
    if (!speechQueueRef.current.length) {
      finishSpeaking();
      return;
    }

    const chunk = speechQueueRef.current.shift();
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = 0.84;
    utterance.pitch = 1.02;
    if (!preferredVoiceRef.current) {
      preferredVoiceRef.current = pickBestVoice();
    }
    if (preferredVoiceRef.current) {
      utterance.voice = preferredVoiceRef.current;
      utterance.lang = preferredVoiceRef.current.lang;
    }
    utterance.onstart = () => {
      setAiSpeaking(true);
      if (!LIVEKIT_AGENT_MODE) {
        void roomRef.current?.localParticipant?.setMicrophoneEnabled(false).catch(() => {});
      }
    };
    utterance.onend = () => {
      speakNextChunk();
    };
    utterance.onerror = () => {
      speakNextChunk();
    };
    window.speechSynthesis.speak(utterance);
  };

  const speakText = async (text) => {
    if (!autoSpeak || typeof window === "undefined") {
      return;
    }

    const normalizedText = normalizeTextForSpeech(text);
    if (!normalizedText) {
      return;
    }

    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }
    if (!LIVEKIT_AGENT_MODE) {
      void roomRef.current?.localParticipant?.setMicrophoneEnabled(false).catch(() => {});
    }

    // Prefer backend TTS provider (local Piper/Groq), then browser fallback.
    try {
      await playServerTts(normalizedText);
      return;
    } catch (error) {
      const message = String(error?.message || error || "unknown error");
      const deniedByBrowser =
        error?.name === "NotAllowedError" ||
        message.toLowerCase().includes("not allowed by the user agent");
      if (deniedByBrowser) {
        setLivekitError(
          "Browser blocked audio autoplay. Click once anywhere in the app, then ask again."
        );
      } else {
        setLivekitError(`Server TTS unavailable: ${message}`);
      }
      console.warn("Server TTS unavailable, using browser voice fallback.", error);
      if (!BROWSER_TTS_FALLBACK_ENABLED) {
        finishSpeaking();
        return;
      }
    }

    if (!window.speechSynthesis) {
      return;
    }

    // Break long output into small chunks so pace sounds natural.
    const chunks = normalizedText
      .split(/(?<=[.!?])\s+/)
      .flatMap((part) => {
        const value = part.trim();
        if (value.length <= 260) {
          return value ? [value] : [];
        }
        const subChunks = [];
        for (let i = 0; i < value.length; i += 260) {
          subChunks.push(value.slice(i, i + 260));
        }
        return subChunks;
      })
      .filter(Boolean);

    if (!chunks.length) {
      return;
    }

    window.speechSynthesis.cancel();
    speechQueueRef.current = chunks;
    isSpeakingRef.current = true;
    speakNextChunk();
  };

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const clearAssistantReveal = () => {
    if (assistantRevealTimerRef.current) {
      clearInterval(assistantRevealTimerRef.current);
      assistantRevealTimerRef.current = null;
    }
  };

  const appendAssistantMessageSlowly = (fullText) => {
    const value = (fullText || "").trim();
    if (!value) {
      return;
    }
    clearAssistantReveal();
    const messageId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: messageId, role: "assistant", content: "" }]);
    let index = 0;
    assistantRevealTimerRef.current = setInterval(() => {
      index += 2;
      const nextText = value.slice(0, index);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, content: nextText } : message
        )
      );
      if (index >= value.length) {
        clearAssistantReveal();
      }
    }, 18);
  };

  const submitUserText = async (text) => {
    const finalText = text.trim();
    if (!finalText || finalText.length < 4 || !selectedChapterRef.current || isLoadingRef.current) {
      return;
    }

    const previousMessage = messagesRef.current[messagesRef.current.length - 1];
    if (previousMessage?.role === "user" && previousMessage.content.trim() === finalText) {
      return;
    }

    const userMessage = makeMessage("user", finalText);
    const nextChat = [...messagesRef.current, userMessage];
    setMessages(nextChat);
    setInput(finalText);
    transcriptRef.current = "";
    interimTranscriptRef.current = "";

    const nextBackendChat = nextChat.map(({ role, content }) => ({ role, content }));
    await requestAssistantReply(nextBackendChat);
    setInput("");
  };

  const disconnectLiveKit = async (roomToClose = roomRef.current) => {
    if (!roomToClose) {
      setLivekitConnected(false);
      setLivekitState("disconnected");
      transcriptionStateRef.current.assistant.clear();
      transcriptionStateRef.current.user.clear();
      setLiveCaptionText("");
      setLiveListeningText("");
      return;
    }

    try {
      await roomToClose.disconnect();
    } finally {
      remoteAudioElementsRef.current.forEach((element) => {
        try {
          element.pause?.();
          element.remove();
        } catch {
          // Best effort cleanup.
        }
      });
      remoteAudioElementsRef.current.clear();

      // Only clear global room state if this is still the active room.
      if (roomRef.current === roomToClose) {
        roomRef.current = null;
        setLivekitConnected(false);
        setLivekitState("disconnected");
        transcriptionStateRef.current.assistant.clear();
        transcriptionStateRef.current.user.clear();
        setLiveCaptionText("");
        setLiveListeningText("");
      }
    }
  };

  const connectLiveKit = async (runId = null) => {
    const attemptId = Date.now();
    connectAttemptRef.current = attemptId;
    if (runId !== null && runId !== sessionRunIdRef.current) {
      return;
    }

    if (roomRef.current) {
      await disconnectLiveKit();
    }

    const normalizedLivekitUrl = normalizeLiveKitUrl(LIVEKIT_URL);
    if (!normalizedLivekitUrl) {
      throw new Error("Missing VITE_LIVEKIT_URL in frontend/.env");
    }
    if (LIVEKIT_SELF_HOSTED && normalizedLivekitUrl.includes(".livekit.cloud")) {
      throw new Error(
        "VITE_LIVEKIT_SELF_HOSTED is true, but VITE_LIVEKIT_URL points to LiveKit Cloud."
      );
    }

    const chapterKey = selectedChapter?.id || "ai-tutor";
    const roomName = `chapter-${chapterKey}-${crypto.randomUUID().slice(0, 8)}`;
    const participantName = `student-${crypto.randomUUID().slice(0, 8)}`;

    const tokenBody = { roomName, participantName };
    if (LIVEKIT_AGENT_MODE && selectedChapterRef.current) {
      const summarySource =
        typeof selectedChapterRef.current.content === "string" ? selectedChapterRef.current.content : "";
      tokenBody.tutorContext = {
        courseTitle: selectedCourseRef.current?.title || "",
        chapterId: selectedChapterRef.current?.id || "",
        chapterTitle: selectedChapterRef.current?.title || "",
        chapterSummary: summarySource.replace(/\s+/g, " ").slice(0, 1000)
      };
    }

    if (runId !== null && runId !== sessionRunIdRef.current) {
      return;
    }
    const tokenResponse = await fetch(`${API_BASE_URL}/livekit/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody)
    });

    if (!tokenResponse.ok) {
      let details = "";
      try {
        const errorPayload = await tokenResponse.json();
        details = String(errorPayload?.error || "").trim();
      } catch {
        try {
          details = (await tokenResponse.text()).trim();
        } catch {
          details = "";
        }
      }
      throw new Error(details || "Unable to fetch LiveKit token from backend.");
    }

    const { token } = await tokenResponse.json();

    const room = new Room();
    setLivekitState("connecting");
    room.on(RoomEvent.Reconnecting, () => {
      if (connectAttemptRef.current !== attemptId) {
        return;
      }
      setLivekitState("reconnecting");
      setLivekitConnected(false);
    });
    room.on(RoomEvent.Reconnected, () => {
      if (connectAttemptRef.current !== attemptId) {
        return;
      }
      setLivekitState("connected");
      setLivekitConnected(true);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (connectAttemptRef.current !== attemptId) {
        return;
      }
      setLivekitConnected(false);
      setLivekitState("disconnected");
    });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== "audio") {
        return;
      }
      const mediaElement = track.attach();
      mediaElement.autoplay = true;
      mediaElement.playsInline = true;
      mediaElement.muted = false;
      mediaElement.style.display = "none";
      document.body.appendChild(mediaElement);
      remoteAudioElementsRef.current.set(track.sid, mediaElement);
      mediaElement.play().catch(() => {
        setLivekitError(
          "Connected to LiveKit, but remote audio playback is blocked. Click once on the page to unlock audio."
        );
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      const mediaElement = remoteAudioElementsRef.current.get(track.sid);
      if (mediaElement) {
        mediaElement.pause?.();
        mediaElement.remove();
        remoteAudioElementsRef.current.delete(track.sid);
      }
      track.detach?.();
    });
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      if (!LIVEKIT_AGENT_MODE || !Array.isArray(segments) || !segments.length) {
        return;
      }

      const channel = participant?.isLocal ? "user" : "assistant";
      const bucket = transcriptionStateRef.current[channel];

      for (const segment of segments) {
        if (!segment?.id) {
          continue;
        }
        const text = String(segment.text || "").trim();
        if (!text) {
          continue;
        }
        bucket.set(segment.id, {
          text,
          firstReceivedTime: Number(segment.firstReceivedTime || Date.now())
        });
      }

      const transcript = [...bucket.values()]
        .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (channel === "assistant") {
        // Speaking animation should represent *active speech*, not a persistent audio stream.
        setAiSpeaking(true);
        isSpeakingRef.current = true;
        if (assistantSpeakingTimeoutRef.current) {
          clearTimeout(assistantSpeakingTimeoutRef.current);
        }
        assistantSpeakingTimeoutRef.current = setTimeout(() => {
          setAiSpeaking(false);
          isSpeakingRef.current = false;
          assistantSpeakingTimeoutRef.current = null;
        }, 1100);
        setLiveCaptionText(transcript);
      } else {
        setLiveListeningText(transcript);
        setInput(transcript);
      }
    });
    await room.connect(normalizedLivekitUrl, token);

    roomRef.current = room;
    setLivekitConnected(true);
    setLivekitState("connected");
    setLivekitError("");

    try {
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true
      });
    } catch (error) {
      const message = String(error?.message || error || "");
      if (message.toLowerCase().includes("requested device not found")) {
        setLivekitError(
          "Connected to LiveKit, but selected microphone device was not found. Re-select your input device and reload."
        );
      } else {
        setLivekitError(
          "Connected to LiveKit, but microphone could not start. Check browser mic permissions and input device."
        );
      }
    }
  };

  const requestAssistantReply = async (nextMessages) => {
    if (!selectedChapterRef.current) {
      return;
    }

    if (LIVEKIT_AGENT_MODE) {
      return;
    }

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const runId = sessionRunIdRef.current;

    setIsLoading(true);
    isLoadingRef.current = true;
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterContent: selectedChapterRef.current.content,
          messages: nextMessages
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response.");
      }

      const data = await response.json();
      if (runId !== sessionRunIdRef.current || view !== "session") {
        return;
      }

      appendAssistantMessageSlowly(data.reply);
      void speakText(data.reply);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      setMessages((prev) => [
        ...prev,
        makeMessage("assistant", "I hit a server issue. Please try again in a moment.")
      ]);
      console.error(error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleStartChapter = async () => {
    if (!selectedChapterRef.current) {
      return;
    }

    if (LIVEKIT_AGENT_MODE) {
      return;
    }

    const isCourseIntro = String(selectedChapterRef.current.id || "").startsWith("course-");
    setMessages([]);
    await requestAssistantReply([
      {
        role: "user",
        content: `${isCourseIntro ? "Start with a quick introduction of this selected course." : "Start as a friendly AI tutor for this selected topic."}
First give a short beginner-friendly summary in 4-6 bullet points.
Then ask: "What specific part do you want to go deeper into?"
After each student question:
1) explain clearly step by step,
2) give one practical example,
3) end with a quick check question.
Keep answers concise, conversational, and voice-friendly.`
      }
    ]);
  };

  const enableHandsFreeSession = async (delayBeforeGreetingMs = 0, useInstantIntro = false, runId = null) => {
    if (!selectedChapterRef.current) {
      return;
    }

    setActiveListening(true);
    activeListeningRef.current = true;

    try {
      if (delayBeforeGreetingMs > 0) {
        setStartupHint("Warming up your tutor… first response is about to start.");
      } else {
        setStartupHint("Connecting to voice tutor…");
      }
      if (runId !== null && runId !== sessionRunIdRef.current) {
        return;
      }
      await connectLiveKit(runId);
      if (runId !== null && runId !== sessionRunIdRef.current) {
        return;
      }
      await ensureMicrophonePermission();
      if (!LIVEKIT_AGENT_MODE) {
        startRecognitionSafely();
      }

      if (useInstantIntro) {
        const introText = buildInstantCourseIntro(selectedCourseRef.current, selectedChapterRef.current);
        if (!LIVEKIT_AGENT_MODE) {
          const introAssistantMessage = makeMessage("assistant", introText);
          setMessages([introAssistantMessage]);
        } else {
          setMessages([]);
        }
        setInput("");
        transcriptRef.current = "";
        interimTranscriptRef.current = "";

        if (delayBeforeGreetingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayBeforeGreetingMs));
        }
        if (runId !== null && runId !== sessionRunIdRef.current) {
          return;
        }

        if (LIVEKIT_AGENT_MODE) {
          setStartupHint("Listening… ask your first question any time.");
          return;
        }

        const normalizedIntro = normalizeTextForSpeech(introText);
        const introAudioPromise = normalizedIntro
          ? fetchServerTtsAudio(normalizedIntro).catch(() => null)
          : Promise.resolve(null);

        const introAudioBlob = await introAudioPromise;
        if (runId !== null && runId !== sessionRunIdRef.current) {
          return;
        }
        if (introAudioBlob) {
          await playServerTts(normalizedIntro, introAudioBlob);
        } else {
          await speakText(introText);
        }
      } else {
        if (delayBeforeGreetingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayBeforeGreetingMs));
        }
        if (runId !== null && runId !== sessionRunIdRef.current) {
          return;
        }
        if (!LIVEKIT_AGENT_MODE) {
          await handleStartChapter();
        } else {
          setStartupHint("Listening… ask your first question any time.");
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      setStartupHint("");
      const baseMessage = String(error?.message || "Failed to start hands-free session.");
      if (baseMessage.toLowerCase().includes("requested device not found")) {
        setLivekitError(
          "Microphone device not found. Switch macOS/browser input device and refresh this tab."
        );
      } else {
        const protocolHint = window.location.protocol === "https:" ? "Use wss:// for HTTPS pages." : "";
        setLivekitError(
          `${baseMessage} Check VITE_LIVEKIT_URL and LiveKit server reachability. ${protocolHint}`.trim()
        );
      }
      setActiveListening(false);
      activeListeningRef.current = false;
      setLivekitState("disconnected");
    }
  };

  const handleSelectChapter = (chapter) => {
    // Chapter selection is a user gesture; use it to unlock audio playback.
    void unlockAudioPlayback();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSelectedChapter(chapter);
    setMessages([]);
    setLiveCaptionText("");
    setLiveListeningText("");
    transcriptionStateRef.current.assistant.clear();
    transcriptionStateRef.current.user.clear();
    setInput("");
    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    shouldAutoSendRef.current = false;
    if (isListeningRef.current && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
    }
    disconnectLiveKit().catch(() => {});
  };

  const handleStartCourse = (courseIntroChapter) => {
    const course = courses.find((item) => `course-${item.id}` === courseIntroChapter.id);
    setSelectedCourse(course || null);
    setSelectedChapter(null);
    setMessages([]);
    setInput("");
    setView("profile");
  };

  const handleBeginTutorSession = () => {
    if (!selectedCourse) {
      return;
    }
    const firstChapter = selectedCourse.subjects?.[0]?.chapters?.[0] || null;
    setSelectedChapter(firstChapter);
    shouldDelayGreetingRef.current = true;
    setView("session");
  };

  const handleBackToCourses = () => {
    sessionRunIdRef.current += 1;
    setView("landing");
    setSelectedChapter(null);
    setSelectedCourse(null);
    setMessages([]);
    setLiveCaptionText("");
    setLiveListeningText("");
    transcriptionStateRef.current.assistant.clear();
    transcriptionStateRef.current.user.clear();
    setInput("");
    setActiveListening(false);
    activeListeningRef.current = false;
    shouldAutoSendRef.current = false;
    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    disconnectLiveKit().catch(() => {});
  };

  const handleEndSession = () => {
    sessionRunIdRef.current += 1;
    setActiveListening(false);
    activeListeningRef.current = false;
    shouldAutoSendRef.current = false;
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setLiveCaptionText("");
    setLiveListeningText("");
    transcriptionStateRef.current.assistant.clear();
    transcriptionStateRef.current.user.clear();
    disconnectLiveKit().catch(() => {});
    setView("summary");
  };

  useEffect(() => {
    if (view !== "session" || !selectedChapter) {
      return;
    }

    sessionRunIdRef.current += 1;
    const runId = sessionRunIdRef.current;
    const shouldUseInstantIntro = shouldDelayGreetingRef.current;
    const delayMs = shouldUseInstantIntro ? 5000 : 0;
    shouldDelayGreetingRef.current = false;
    enableHandsFreeSession(delayMs, shouldUseInstantIntro, runId).catch(() => {});
  }, [selectedChapter?.id, view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const markUserInteraction = () => {
      hasUserInteractedRef.current = true;
      setAudioUnlocked(true);
    };
    window.addEventListener("pointerdown", markUserInteraction, { once: true });
    window.addEventListener("keydown", markUserInteraction, { once: true });

    if (window.speechSynthesis) {
      const updateVoices = () => {
        preferredVoiceRef.current = pickBestVoice();
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (LIVEKIT_AGENT_MODE || !SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (isSpeakingRef.current) {
        return;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      let finalChunk = "";
      let interimChunk = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chunk = result[0]?.transcript?.trim() || "";
        if (!chunk) {
          continue;
        }
        if (result.isFinal) {
          finalChunk += ` ${chunk}`;
        } else {
          interimChunk += ` ${chunk}`;
        }
      }

      if (finalChunk.trim()) {
        transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim();
        shouldAutoSendRef.current = true;
      }

      interimTranscriptRef.current = interimChunk.trim();
      const liveText = `${transcriptRef.current} ${interimChunk}`.trim();
      setInput(liveText);

      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current && isListeningRef.current) {
          recognitionRef.current.stop();
        }
      }, AUTO_SEND_SILENCE_MS);
    };

    recognition.onend = async () => {
      clearSilenceTimer();
      setIsListening(false);
      isListeningRef.current = false;

      if (shouldAutoSendRef.current && transcriptRef.current.trim()) {
        shouldAutoSendRef.current = false;
        const pending = transcriptRef.current.trim();
        await submitUserText(pending);
      }
      interimTranscriptRef.current = "";

      if (activeListeningRef.current && !isLoadingRef.current && !isSpeakingRef.current) {
        startRecognitionSafely();
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setLivekitError("");
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      isListeningRef.current = false;

      const code = event?.error || "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setLivekitError("Microphone permission blocked. Allow mic access and refresh.");
        return;
      }

      if (code === "no-speech") {
        // Common and non-fatal, auto-retry.
        if (activeListeningRef.current && !isLoadingRef.current && !isSpeakingRef.current) {
          setTimeout(() => startRecognitionSafely(), 300);
        }
        return;
      }

      setLivekitError(`Voice recognition issue: ${code}. Retrying...`);
      if (activeListeningRef.current && !isLoadingRef.current && !isSpeakingRef.current) {
        setTimeout(() => startRecognitionSafely(), 500);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      window.removeEventListener("pointerdown", markUserInteraction);
      window.removeEventListener("keydown", markUserInteraction);
      clearSilenceTimer();
      clearAssistantReveal();
      recognition.stop();
      disconnectLiveKit().catch(() => {});
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (view === "landing") {
    return <LandingPage courses={courses} onStartCourse={handleStartCourse} />;
  }

  if (view === "profile") {
    return (
      <TutorProfilePage
        course={selectedCourse}
        onBack={handleBackToCourses}
        onStartSession={handleBeginTutorSession}
      />
    );
  }

  if (view === "summary") {
    return (
      <SessionSummaryPage
        selectedChapter={selectedChapter}
        messages={messages}
        onRestart={() => setView("session")}
        onBackToExplore={handleBackToCourses}
      />
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        course={selectedCourse}
        selectedChapterId={selectedChapter?.id}
        onSelectChapter={handleSelectChapter}
        onBackToCourses={handleBackToCourses}
      />
      <ChatWindow
        selectedChapter={selectedChapter}
        input={input}
        liveCaptionText={liveCaptionText}
        liveListeningText={liveListeningText}
        startupHint={startupHint}
        isLoading={isLoading}
        isListening={isListening}
        activeListening={activeListening}
        aiSpeaking={aiSpeaking}
        autoSpeak={autoSpeak}
        voiceSupported={LIVEKIT_AGENT_MODE || Boolean(recognitionRef.current)}
        livekitConnected={livekitConnected}
        livekitState={livekitState}
        livekitError={livekitError}
        audioUnlocked={audioUnlocked}
        onUnlockAudio={unlockAudioPlayback}
        onEndSession={handleEndSession}
      />
    </main>
  );
}

export default App;
