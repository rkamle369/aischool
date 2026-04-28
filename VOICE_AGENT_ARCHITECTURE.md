# Voice AI Agent Architecture

This document explains the current voice-agent architecture in this repository, including where LiveKit is used and where OpenAI STT/TTS are used.

## High-Level Components

- `frontend` (`frontend/src/App.jsx`)
  - Connects browser to LiveKit room.
  - Publishes microphone audio.
  - Subscribes to remote audio from the agent.
  - Receives LiveKit transcription events for UI summary/captions.
- `backend` (`backend/src/routes/livekitRoutes.js`)
  - Issues LiveKit access tokens.
  - Triggers explicit agent dispatch (`AgentDispatchClient.createDispatch`) so the agent joins the room.
- `livekit-agent` (`livekit-agent/agent.py`)
  - LiveKit Agents worker that runs the AI tutor session.
  - Uses OpenAI STT (`gpt-4o-mini-transcribe`), LLM (`gpt-4o-mini` by env default), and TTS (`gpt-4o-mini-tts`).
- `LiveKit server` (external/self-hosted endpoint in `LIVEKIT_URL`)
  - Real-time media transport (WebRTC signaling/audio tracks).
  - Agent dispatch orchestration.

## End-to-End Runtime Flow

1. User starts session in frontend.
2. Frontend builds a unique room name like:
   - `chapter-<chapterId>-<randomSuffix>`
3. Frontend calls:
   - `POST /livekit/token` on backend with `roomName`, `participantName`, and `tutorContext`.
4. Backend:
   - Converts `LIVEKIT_URL` to HTTP(S) for API client.
   - Calls `AgentDispatchClient.createDispatch(roomName, agentName, { metadata })`.
   - Creates and returns LiveKit JWT token.
5. Frontend connects `Room` to LiveKit with the token.
6. Frontend enables local microphone publishing (`setMicrophoneEnabled(true, constraints)`).
7. LiveKit server accepts browser participant and agent dispatch.
8. Agent worker receives job request and joins the same room.
9. Agent creates `AgentSession` with:
   - VAD: Silero
   - STT: OpenAI transcribe model
   - LLM: OpenAI chat model
   - TTS: OpenAI mini-tts
10. Agent sends initial greeting (`generate_reply(...)`).
11. Audio loop during session:
   - Student speech -> browser mic track -> LiveKit room -> agent STT.
   - Agent response text -> agent TTS -> LiveKit remote audio track -> browser playback.
12. UI transcript/summary:
   - Frontend listens to `RoomEvent.TranscriptionReceived`.
   - Updates local summary text in right panel.

## Where LiveKit vs OpenAI Are Used

### LiveKit responsibilities

- Realtime audio transport between browser and agent.
- Participant/room lifecycle and WebRTC track subscription.
- Agent dispatch API (`createDispatch`) to start room agent jobs.
- Optional transcription stream events consumed by frontend UI.

### OpenAI responsibilities (inside agent worker)

- Speech-to-text: converts incoming speech to text.
- LLM reasoning and reply generation.
- Text-to-speech: converts replies back to spoken audio.

In short:
- LiveKit is the realtime communication/control plane.
- OpenAI is the intelligence + speech processing layer.

## Current Mode Behavior

When `VITE_LIVEKIT_AGENT_MODE=true`:

- Frontend does not use browser `SpeechRecognition` pipeline.
- Frontend does not use backend `/chat` response path for tutor turns.
- Voice interaction is expected to happen via LiveKit + agent worker only.

## Important Current Limitation

There is currently a metadata key mismatch:

- Backend dispatch metadata sends `chapterSummary`.
- Agent currently reads `chapterContent` in `_build_agent_instructions`.

Effect:
- Agent still works, but may ignore chapter context payload and fall back to generic tutoring instructions.

## Failure Modes You Have Seen

- `twirp error unknown: no response from servers` during dispatch/list calls:
  - This is a LiveKit AgentDispatch availability issue on server side.
  - When dispatch fails, frontend can connect to room but agent may not join, resulting in "no voice/no discussion".

## Quick Validation Checklist

1. `GET /livekit/health` returns `authVerified: true`.
2. Backend `/livekit/token` returns `200` with token.
3. Agent logs show:
   - `registered worker`
   - `received job request` for target room.
4. Browser:
   - LiveKit state is `connected`
   - Mic publishing enabled
   - Remote audio track subscribed and audible.

