import { Router } from "express";
import { generateChatReply } from "../services/openaiService.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { messages, chapterContent } = req.body;

    if (!chapterContent || typeof chapterContent !== "string") {
      return res.status(400).json({ error: "chapterContent is required." });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array." });
    }

    const sanitizedMessages = messages
      .filter((msg) => msg && typeof msg.content === "string" && typeof msg.role === "string")
      .map((msg) => ({ role: msg.role, content: msg.content }));

    const reply = await generateChatReply({
      chapterContent,
      messages: sanitizedMessages
    });

    return res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response."
    });
  }
});

router.post("/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required." });
    }

    const ttsProvider = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
    let ttsResponse;

    if (ttsProvider === "elevenlabs") {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "ELEVENLABS_API_KEY is missing in backend/.env" });
      }

      const baseUrl = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";
      const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
      const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
      ttsResponse = await fetch(`${baseUrl}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          output_format: "mp3_44100_128",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true
          }
        })
      });
    } else if (ttsProvider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY is missing in backend/.env" });
      }

      const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
      const voice = process.env.OPENAI_TTS_VOICE || "alloy";
      const responseFormat = (process.env.OPENAI_TTS_FORMAT || "mp3").toLowerCase();
      const supportedFormats = ["mp3", "wav", "opus", "aac", "flac", "pcm"];
      const format = supportedFormats.includes(responseFormat) ? responseFormat : "mp3";

      ttsResponse = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: format
        })
      });
    } else if (ttsProvider === "groq") {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GROQ_API_KEY is missing in backend/.env" });
      }
      const baseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
      const model = process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english";
      const voice = process.env.GROQ_TTS_VOICE || "diana";

      ttsResponse = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: "wav"
        })
      });
    } else if (ttsProvider === "qwen3") {
      const qwen3TtsUrl = process.env.QWEN3_TTS_URL || "http://localhost:8000";
      const targetUrl = `${qwen3TtsUrl.replace(/\/+$/, "")}/voice-clone`;
      const refAudio = process.env.QWEN3_TTS_REF_AUDIO || "";
      const refText = process.env.QWEN3_TTS_REF_TEXT || "";
      const language = process.env.QWEN3_TTS_LANGUAGE || "English";
      const model = process.env.QWEN3_TTS_MODEL || "Qwen/Qwen3-TTS-12Hz-0.6B-Base";
      const payload = { text, language, model };
      if (refAudio.trim()) {
        payload.ref_audio = refAudio.trim();
      }
      if (refText.trim()) {
        payload.ref_text = refText.trim();
      }

      ttsResponse = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      const piperUrl = process.env.PIPER_URL || "http://localhost:5001";
      const targetUrl = `${piperUrl.replace(/\/+$/, "")}/?text=${encodeURIComponent(text)}`;
      ttsResponse = await fetch(targetUrl);
    }

    if (!ttsResponse.ok) {
      const details = await ttsResponse.text();
      return res.status(ttsResponse.status).json({ error: `TTS failed (${ttsProvider}): ${details}` });
    }

    const contentType = ttsResponse.headers.get("content-type") || "audio/wav";
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    const fallbackTypeByProvider =
      ttsProvider === "openai" || ttsProvider === "elevenlabs" ? "audio/mpeg" : "audio/wav";
    res.setHeader(
      "Content-Type",
      contentType.includes("audio/") ? contentType : fallbackTypeByProvider
    );
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (error) {
    console.error("TTS error:", error);
    return res.status(500).json({ error: "Failed to synthesize speech." });
  }
});

export default router;
