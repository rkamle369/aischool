# AI School MVP (Local Proof of Concept)

A local full-stack MVP for an AI-powered online learning platform.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- AI: Ollama local (`qwen2.5:7b-instruct`) or Groq Chat Completions
- Realtime Voice Session: LiveKit
- Optional Realtime Voice Pipeline: LiveKit Agent (self-hosted worker)
- Data: Local JSON (`backend/src/data/courses.json`)

## Features

- Course hierarchy: Courses -> Subjects -> Chapters
- Sidebar chapter navigation
- Chat-based AI teacher
- "Start Voice Exam" flow for oral question/answer practice
- Mic input (speech-to-text) for student responses
- AI voice output (text-to-speech) via local Piper (default), Groq, or Qwen3-TTS voice clone
- Conversation history preserved in session
- Loading indicator while AI responds
- Minimal modern UI with styled chat bubbles

## Project Structure

```text
.
├── backend
│   ├── .env.example
│   ├── package.json
│   └── src
│       ├── data
│       │   └── courses.json
│       ├── routes
│       │   ├── chatRoutes.js
│       │   ├── coursesRoutes.js
│       │   └── livekitRoutes.js
│       ├── services
│       │   └── openaiService.js
│       └── server.js
├── frontend
│   ├── .env.example
│   ├── package.json
│   ├── index.html
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│       └── components
│           ├── ChatWindow.jsx
│           └── Sidebar.jsx
└── README.md
```

## Local Setup

### 1) Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Set your backend values in `backend/.env`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:1.7b
TTS_PROVIDER=qwen3
PIPER_URL=http://localhost:5001
QWEN3_TTS_URL=http://localhost:8000
QWEN3_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-Base
QWEN3_TTS_LANGUAGE=English
QWEN3_TTS_REF_AUDIO=/absolute/path/to/your-reference-voice.wav
QWEN3_TTS_REF_TEXT=Exact transcript of your reference clip
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
GROQ_TTS_VOICE=diana
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your_livekit_api_key_here
LIVEKIT_API_SECRET=your_livekit_api_secret_here
```

Run backend:

```bash
npm run dev
```

Backend runs at `http://localhost:4000`.

### 2) Frontend setup

```bash
cd ../frontend
npm install
cp .env.example .env
```

Set your LiveKit websocket URL in `frontend/.env`:

```env
VITE_LIVEKIT_URL=ws://localhost:7880
VITE_LIVEKIT_SELF_HOSTED=true
VITE_LIVEKIT_AGENT_MODE=false
VITE_DISABLE_BROWSER_TTS_FALLBACK=false
```

Run frontend:

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Docker Deployment

You can run frontend + backend using Docker Compose.

### Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- `backend/.env` configured with your keys

### 1) Configure backend env

`backend/.env` needs at least:

```env
PORT=4000
FRONTEND_URL=http://localhost:5173
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:1.7b
TTS_PROVIDER=qwen3
PIPER_URL=http://localhost:5001
QWEN3_TTS_URL=http://localhost:8000
QWEN3_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-Base
QWEN3_TTS_LANGUAGE=English
QWEN3_TTS_REF_AUDIO=/absolute/path/to/your-reference-voice.wav
QWEN3_TTS_REF_TEXT=Exact transcript of your reference clip
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your_livekit_api_key_here
LIVEKIT_API_SECRET=your_livekit_api_secret_here
```

### 2) (Optional) Override frontend build-time env

Create a root `.env` file (same folder as `docker-compose.yml`) if you want custom frontend values:

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_LIVEKIT_URL=ws://localhost:7880
VITE_LIVEKIT_SELF_HOSTED=true
```

### 3) Build and run

```bash
docker compose up --build
```

### 4) Open app

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/health`
- LiveKit health: `http://localhost:4000/livekit/health`

### 5) Stop

```bash
docker compose down
```

## API Endpoints

- `GET /courses` -> returns course/subject/chapter structure
- `POST /chat` -> body:
- `POST /chat/tts` -> body: `{ "text": "Hello student" }`, returns WAV audio
- `POST /livekit/token` -> returns LiveKit room access token
- `GET /livekit/health` -> validates LiveKit URL reachability and token generation

```json
{
  "chapterContent": "Chapter text",
  "messages": [
    { "role": "user", "content": "Teach me this chapter" }
  ]
}
```

Response:

```json
{
  "reply": "AI teacher response"
}
```

LiveKit health check example:

```bash
curl http://localhost:4000/livekit/health
```

## Notes

- To add more curriculum, edit `backend/src/data/courses.json`.
- Set `AI_PROVIDER=ollama` (local) or `AI_PROVIDER=groq` (hosted).
- Recommended local LLM model: `qwen2.5:7b-instruct` via Ollama.
- Recommended local TTS voice: Piper `en_US-lessac-medium` (good quality and speed).
- For Docker, Ollama and Piper run as local services in `docker-compose.yml`.
- Recommended Groq model for fallback/cloud mode: `llama-3.1-8b-instant`.
- For Groq TTS models such as `canopylabs/orpheus-v1-english`, your org admin must accept model terms once in the Groq console.
- LiveKit is used for low-latency voice room connection and microphone publishing.
- Set `VITE_LIVEKIT_AGENT_MODE=true` to use a LiveKit Agent pipeline instead of browser STT + `/chat/tts`.
- For self-hosted LiveKit, use your own WS/WSS endpoint (for example `ws://localhost:7880`), not a `.livekit.cloud` URL.
- Firebase integration can be added later by replacing JSON/file reads with Firestore queries.
- Voice input uses the browser SpeechRecognition API (best support in Chrome/Edge).

## Qwen3-TTS Voice Clone (Optional)

Run a local bridge service:

```bash
cd backend
python3 -m venv .venv-qwen3tts
source .venv-qwen3tts/bin/activate
pip install -U fastapi uvicorn qwen-tts soundfile numpy
uvicorn scripts.qwen3_tts_server:app --host 0.0.0.0 --port 8000
```

Then set these in `backend/.env`:

```env
TTS_PROVIDER=qwen3
QWEN3_TTS_URL=http://localhost:8000
QWEN3_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-Base
QWEN3_TTS_LANGUAGE=English
QWEN3_TTS_REF_AUDIO=/absolute/path/to/your-reference-voice.wav
QWEN3_TTS_REF_TEXT=Exact transcript of your reference clip
```

## LiveKit Agent Pipeline (Recommended for lower turn latency)

This mode removes request/response speech loops and uses a realtime room agent.

1) Configure and run the worker:

```bash
cd livekit-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python agent.py start
```

2) Enable frontend agent mode:

```env
# frontend/.env
VITE_LIVEKIT_AGENT_MODE=true
```

3) Keep backend LiveKit token endpoint enabled (already in this repo), then restart frontend/backend.
