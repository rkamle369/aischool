import json
import os
import ssl

import certifi
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero

load_dotenv()

# Ensure Python uses a reliable CA bundle for TLS (helps on macOS venv setups).
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# Fallback for environments where Python/OpenSSL trust store is broken.
# Use only when needed; this disables TLS certificate validation.
if os.getenv("LIVEKIT_INSECURE_SKIP_VERIFY", "false").lower() == "true":
    os.environ["PYTHONHTTPSVERIFY"] = "0"
    ssl._create_default_https_context = ssl._create_unverified_context


def _parse_job_metadata(ctx: JobContext) -> dict:
    raw = ""
    try:
        raw = (getattr(ctx.job, "metadata", None) or "").strip()
    except Exception:
        return {}
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


class AITutor(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


def _build_agent_instructions(meta: dict) -> str:
    base = (
        "You are an expert AI tutor for beginner learners. "
        "Keep replies short, practical, and conversational. "
        "Explain in simple steps, give one example, then ask one follow-up question. "
        "The student is speaking over LiveKit voice: listen for their questions and respond in audio."
    )
    course = (meta.get("courseTitle") or "").strip() or "this course"
    chapter = (meta.get("chapterTitle") or "").strip() or "this topic"
    content = (meta.get("chapterContent") or "").strip()
    if not content:
        return f"{base}\n\nThe learner selected: {course} — {chapter}."
    excerpt = content[:18000]
    return (
        f"{base}\n\nThe learner is in session for «{course}», chapter «{chapter}». "
        "Use the following material as ground truth when it helps answer their questions:\n"
        f"{excerpt}"
    )


def _greeting_reply_instructions(meta: dict) -> str:
    course = (meta.get("courseTitle") or "").strip() or "this course"
    chapter = (meta.get("chapterTitle") or "").strip() or "this topic"
    return (
        f"Give a brief spoken greeting (under 25 seconds). Mention you are on voice with them for "
        f"«{course}» / «{chapter}». Invite their first question. Do not read long bullet lists aloud."
    )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    meta = _parse_job_metadata(ctx)
    agent = AITutor(instructions=_build_agent_instructions(meta))

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=openai.STT(model="gpt-4o-mini-transcribe"),
        llm=openai.LLM(model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")),
        tts=openai.TTS(
            model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
            voice=os.getenv("OPENAI_TTS_VOICE", "alloy"),
        ),
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(instructions=_greeting_reply_instructions(meta))


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "ai-tutor"),
        )
    )
