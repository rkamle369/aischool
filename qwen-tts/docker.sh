#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

docker rm -f qwen3-tts >/dev/null 2>&1 || true

docker run -d \
  --name qwen3-tts \
  -p 8000:8000 \
  --shm-size=2g \
  --ipc=host \
  -e QWEN3_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-Base \
  -e QWEN3_TTS_REF_AUDIO=/app/voices/rohit_ref_16k.wav \
  -e QWEN3_TTS_REF_TEXT_FILE=/app/voices/rohit_ref_16k.txt \
  -e QWEN3_TTS_DTYPE=float32 \
  -e QWEN3_TTS_DEVICE=cpu \
  -e QWEN3_TTS_X_VECTOR_ONLY_MODE=true \
  -e QWEN3_TTS_MAX_NEW_TOKENS=512 \
  -e OMP_NUM_THREADS=2 \
  -e MKL_NUM_THREADS=2 \
  qwen3-tts-local:3

echo "Waiting for qwen3-tts health..."
READY=0
for i in {1..60}; do
  if curl -fsS "http://localhost:8000/health" >/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "qwen3-tts did not become healthy in time. Recent container logs:"
  docker logs --tail 200 qwen3-tts || true
  exit 1
fi

set +e
time curl --max-time 180 -fsS -X POST "http://localhost:8000/voice-clone" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello. Rohit",
    "language": "English"
  }' \
  --output cloned3.wav
STATUS=$?
set -e

if [ "$STATUS" -ne 0 ]; then
  echo "Voice clone request failed. Recent container logs:"
  docker logs --tail 200 qwen3-tts || true
  exit 1
fi

echo "Generated cloned1.wav successfully."