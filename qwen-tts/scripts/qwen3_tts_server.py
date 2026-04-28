from __future__ import annotations

import base64
import io
import os
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from qwen_tts import Qwen3TTSModel


MODEL_ID = os.getenv("QWEN3_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
DEVICE = os.getenv("QWEN3_TTS_DEVICE", "auto")
DTYPE = os.getenv("QWEN3_TTS_DTYPE", "auto")
DEFAULT_REF_AUDIO = os.getenv("QWEN3_TTS_REF_AUDIO", "/app/voices/rohitkamlevoice.wav")
DEFAULT_REF_TEXT = os.getenv("QWEN3_TTS_REF_TEXT", "")
DEFAULT_REF_TEXT_FILE = os.getenv("QWEN3_TTS_REF_TEXT_FILE", "/app/voices/rohitkamlevoice.txt")
X_VECTOR_ONLY_MODE = os.getenv("QWEN3_TTS_X_VECTOR_ONLY_MODE", "true").lower() == "true"
MAX_NEW_TOKENS = int(os.getenv("QWEN3_TTS_MAX_NEW_TOKENS", "512"))

app = FastAPI(title="Qwen3 TTS Voice Clone Bridge")
model = Qwen3TTSModel.from_pretrained(MODEL_ID, device_map=DEVICE, dtype=DTYPE)


class VoiceCloneRequest(BaseModel):
    text: str
    language: str = "English"
    ref_audio: Optional[str] = None
    ref_text: Optional[str] = None


def decode_audio_if_base64(value: str):
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://") or os.path.exists(value):
        return value
    try:
        raw = base64.b64decode(value, validate=True)
        audio, sr = sf.read(io.BytesIO(raw))
        return (audio, sr)
    except Exception:
        return value


def resolve_reference_text(explicit_text: Optional[str]) -> Optional[str]:
    if explicit_text and explicit_text.strip():
        return explicit_text.strip()
    if DEFAULT_REF_TEXT.strip():
        return DEFAULT_REF_TEXT.strip()
    if DEFAULT_REF_TEXT_FILE and os.path.exists(DEFAULT_REF_TEXT_FILE):
        try:
            return open(DEFAULT_REF_TEXT_FILE, "r", encoding="utf-8").read().strip() or None
        except Exception:
            return None
    return None


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_ID,
        "default_ref_audio": DEFAULT_REF_AUDIO,
        "default_ref_text_file": DEFAULT_REF_TEXT_FILE,
        "x_vector_only_mode": X_VECTOR_ONLY_MODE,
        "max_new_tokens": MAX_NEW_TOKENS,
    }


@app.post("/voice-clone")
def voice_clone(payload: VoiceCloneRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    ref_audio_input = payload.ref_audio or DEFAULT_REF_AUDIO
    if not ref_audio_input:
        raise HTTPException(
            status_code=400,
            detail="ref_audio is required (or set QWEN3_TTS_REF_AUDIO in container env)",
        )

    try:
        ref_audio = decode_audio_if_base64(ref_audio_input)
        ref_text = resolve_reference_text(payload.ref_text)
        wavs, sr = model.generate_voice_clone(
            text=payload.text.strip(),
            language=payload.language,
            ref_audio=ref_audio,
            ref_text=ref_text,
            x_vector_only_mode=X_VECTOR_ONLY_MODE,
            max_new_tokens=MAX_NEW_TOKENS,
        )

        wav = np.asarray(wavs[0], dtype=np.float32)
        stream = io.BytesIO()
        sf.write(stream, wav, sr, format="WAV")
        return Response(content=stream.getvalue(), media_type="audio/wav")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
