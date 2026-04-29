import json
import logging
import os
import ssl
from pathlib import Path

import certifi
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import openai, silero

# Keep runtime-provided env (Kubernetes ConfigMap/Secret) as source of truth.
load_dotenv(override=False)

logger = logging.getLogger("livekit-agent")

# Ensure Python uses a reliable CA bundle for TLS (helps on macOS venv setups).
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# Fallback for environments where Python/OpenSSL trust store is broken.
# Use only when needed; this disables TLS certificate verification.
if os.getenv("LIVEKIT_INSECURE_SKIP_VERIFY", "false").lower() == "true":
    os.environ["PYTHONHTTPSVERIFY"] = "0"
    ssl._create_default_https_context = ssl._create_unverified_context

PROMPTS_PATH = Path(__file__).with_name("agent_prompts.json")

GLOBAL_VOICE_RULES = (
    "GLOBAL RULES (always follow):\n"
    "- Speak only clear English. Never switch to another language.\n"
    "- Stay strictly within your agent role described below. Refuse off-topic requests briefly and redirect.\n"
    "- Prefer very short replies (usually 1–3 sentences) unless the user explicitly asks for more detail.\n"
    "- If the user's speech was unclear, drowned out by background noise, or you are unsure what they said, "
    "say in one short sentence that you did not catch it and ask them to repeat slowly. Do not guess.\n"
    "- If they ask you to continue after uncertainty, acknowledge and repeat your last question or move forward politely.\n"
)


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
    role = str(profile.get("system") or "").strip()
    if not role:
        return GLOBAL_VOICE_RULES.strip()
    return f"{GLOBAL_VOICE_RULES}\n\n{role}".strip()


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


def _load_vad():
    activation = float(os.getenv("VAD_ACTIVATION_THRESHOLD", "0.65"))
    min_silence = float(os.getenv("VAD_MIN_SILENCE_DURATION", "0.85"))
    min_speech = float(os.getenv("VAD_MIN_SPEECH_DURATION", "0.12"))
    return silero.VAD.load(
        activation_threshold=activation,
        min_silence_duration=min_silence,
        min_speech_duration=min_speech,
    )


def _build_stt():
    model = os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")
    kwargs: dict = {
        "model": model,
        "language": "en",
        "detect_language": False,
    }
    nr_raw = (os.getenv("OPENAI_STT_NOISE_REDUCTION") or "").strip().lower()
    if nr_raw in ("far_field", "near_field"):
        kwargs["noise_reduction_type"] = nr_raw
    try:
        return openai.STT(**kwargs)
    except TypeError:
        kwargs.pop("noise_reduction_type", None)
        return openai.STT(**kwargs)


def _build_llm():
    model = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
    temp_raw = os.getenv("OPENAI_LLM_TEMPERATURE", "0.35")
    try:
        temp = float(temp_raw)
    except ValueError:
        temp = 0.35
    try:
        return openai.LLM(model=model, temperature=temp)
    except TypeError:
        return openai.LLM(model=model)


def _build_tts():
    provider = (os.getenv("AGENT_TTS_PROVIDER") or os.getenv("TTS_PROVIDER") or "openai").strip().lower()
    if provider == "elevenlabs":
        api_key = (os.getenv("ELEVENLABS_API_KEY") or "").strip()
        if not api_key:
            logger.warning("AGENT_TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing; using OpenAI TTS")
        else:
            try:
                from livekit.plugins import elevenlabs

                voice_id = (os.getenv("ELEVENLABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM").strip()
                model = (os.getenv("ELEVENLABS_MODEL_ID") or "eleven_turbo_v2_5").strip()
                logger.info("Using ElevenLabs TTS provider", extra={"provider": "elevenlabs", "voice_id": voice_id, "model": model})
                return elevenlabs.TTS(voice_id=voice_id, model=model, api_key=api_key)
            except ImportError:
                logger.warning(
                    "ElevenLabs TTS selected but livekit-plugins-elevenlabs is not installed; "
                    "install it or set AGENT_TTS_PROVIDER=openai. Using OpenAI TTS."
                )
    logger.info("Using OpenAI TTS provider", extra={"provider": "openai"})
    return openai.TTS(
        model=os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        voice=os.getenv("OPENAI_TTS_VOICE", "alloy"),
    )


async def _start_session(session: AgentSession, agent: Agent, room) -> None:
    use_nc = os.getenv("ENABLE_AGENT_NOISE_CANCELLATION", "true").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if not use_nc:
        await session.start(agent=agent, room=room)
        return
    try:
        from livekit.agents import room_io
        from livekit.plugins import noise_cancellation

        await session.start(
            agent=agent,
            room=room,
            room_options=room_io.RoomOptions(
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=noise_cancellation.BVC(),
                ),
            ),
        )
    except ImportError:
        logger.info("Noise cancellation or room_io not available; starting session without BVC")
        await session.start(agent=agent, room=room)
    except (TypeError, AttributeError) as exc:
        logger.warning("Could not attach noise cancellation / room_options (%s); starting plain session", exc)
        await session.start(agent=agent, room=room)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    meta = _parse_job_metadata(ctx)
    agent_type = (meta.get("agentType") or "").strip().lower() or _agent_type_from_room_name(
        getattr(ctx.room, "name", "")
    )
    agent = AITutor(instructions=_build_agent_instructions(agent_type))

    session = AgentSession(
        vad=_load_vad(),
        stt=_build_stt(),
        llm=_build_llm(),
        tts=_build_tts(),
    )

    await _start_session(session, agent, ctx.room)
    await session.generate_reply(instructions=_greeting_reply_instructions(agent_type))


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("AGENT_NAME", "ai-tutor"),
        )
    )
