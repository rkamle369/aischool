import json
import os
import ssl
from pathlib import Path

import certifi
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero

# Keep runtime-provided env (Kubernetes ConfigMap/Secret) as source of truth.
load_dotenv(override=False)

# Ensure Python uses a reliable CA bundle for TLS (helps on macOS venv setups).
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# Fallback for environments where Python/OpenSSL trust store is broken.
# Use only when needed; this disables TLS certificate validation.
if os.getenv("LIVEKIT_INSECURE_SKIP_VERIFY", "false").lower() == "true":
    os.environ["PYTHONHTTPSVERIFY"] = "0"
    ssl._create_default_https_context = ssl._create_unverified_context

PROMPTS_PATH = Path(__file__).with_name("agent_prompts.json")


def _load_prompt_config() -> dict:
    try:
        return json.loads(PROMPTS_PATH.read_text(encoding="utf-8"))
    except Exception:
        # Safe fallback if file is missing/malformed.
        return {
            "default_agent_type": "tutor",
            "agents": {
                "tutor": {
                    "system": (
                        "You are a voice-based AI Tutor. Keep responses short and conversational. "
                        "Ask what topic the learner wants, explain step-by-step in simple language, "
                        "give one practical example, and ask one quick check question."
                    ),
                    "greeting": (
                        "Say exactly this in a friendly tone: "
                        "\"Hello, I am Riya, your AI tutor. What topic would you like to learn today?\" "
                        "Do not add extra lines."
                    ),
                }
            },
        }


PROMPT_CONFIG = _load_prompt_config()


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


def _agent_type_from_room_name(room_name: str) -> str:
    name = (room_name or "").lower()
    if name.startswith("agent-feedback"):
        return "feedback"
    if name.startswith("agent-interview"):
        return "interview"
    if name.startswith("agent-health"):
        return "health"
    if name.startswith("agent-tutor"):
        return "tutor"
    return str(PROMPT_CONFIG.get("default_agent_type") or "tutor")


def _build_agent_instructions(agent_type: str) -> str:
    agents = PROMPT_CONFIG.get("agents") or {}
    fallback_type = str(PROMPT_CONFIG.get("default_agent_type") or "tutor")
    profile = agents.get(agent_type) or agents.get(fallback_type) or {}
    return str(profile.get("system") or "").strip()


def _greeting_reply_instructions(agent_type: str) -> str:
    agents = PROMPT_CONFIG.get("agents") or {}
    fallback_type = str(PROMPT_CONFIG.get("default_agent_type") or "tutor")
    profile = agents.get(agent_type) or agents.get(fallback_type) or {}
    greeting = str(profile.get("greeting") or "").strip()
    return greeting or (
        "Say this in a friendly tone: "
        "\"Hello, I am Riya, your AI tutor. What topic would you like to learn today?\" "
        "Do not add extra lines."
    )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    meta = _parse_job_metadata(ctx)
    agent_type = (meta.get("agentType") or "").strip().lower() or _agent_type_from_room_name(getattr(ctx.room, "name", ""))
    agent = AITutor(instructions=_build_agent_instructions(agent_type))

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
    await session.generate_reply(instructions=_greeting_reply_instructions(agent_type))


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "ai-tutor"),
        )
    )
