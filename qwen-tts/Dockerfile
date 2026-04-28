FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 git sox \
    && rm -rf /var/lib/apt/lists/*

RUN pip install -U pip
RUN pip install -U fastapi uvicorn qwen-tts soundfile numpy

COPY scripts/qwen3_tts_server.py /app/scripts/qwen3_tts_server.py
COPY voices /app/voices

EXPOSE 8000

CMD ["uvicorn", "scripts.qwen3_tts_server:app", "--host", "0.0.0.0", "--port", "8000"]