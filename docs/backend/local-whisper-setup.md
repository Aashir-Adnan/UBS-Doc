# Local Whisper Server Setup

This guide covers setting up a self-hosted Whisper transcription server for the Meeting Workflow. This removes the dependency on OpenAI's paid API while keeping the same interface.

## Overview

The meeting workflow's transcription step supports three providers, toggled via the `TRANSCRIPTION_PROVIDER` environment variable:

| Value | Description | Cost |
|-------|-------------|------|
| `mock` | Returns fake transcript (default) | Free |
| `openai` | OpenAI Whisper API | ~$0.006/min of audio |
| `local` | Self-hosted Whisper server | Free (your hardware) |

The local provider sends audio to an HTTP endpoint that you run on your own machine or server. Two popular options are covered below.

---

## Option A: faster-whisper-server (Recommended)

[faster-whisper-server](https://github.com/fedirz/faster-whisper-server) wraps [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (a CTranslate2-based Whisper implementation) behind an OpenAI-compatible HTTP API. It's 4x faster than vanilla Whisper and uses less memory.

### Requirements

- Docker installed
- ~1-2 GB RAM for the `small` model (CPU mode)
- ~4 GB RAM for the `medium` model
- NVIDIA GPU + nvidia-docker for GPU acceleration (optional but much faster)

### Run with Docker (CPU)

```bash
docker run -d \
  --name whisper-server \
  -p 9000:8000 \
  fedirz/faster-whisper-server:latest
```

The server starts on port 9000 and loads the `small` model by default.

### Run with Docker (GPU — NVIDIA)

```bash
docker run -d \
  --name whisper-server \
  --gpus all \
  -p 9000:8000 \
  fedirz/faster-whisper-server:latest-cuda
```

### Verify it's running

```bash
curl -X POST http://localhost:9000/v1/audio/transcriptions \
  -F "file=@sample.wav" \
  -F "model=small"
```

You should get a JSON response with a `text` field containing the transcript.

### Configure the server

```env
TRANSCRIPTION_PROVIDER=local
TRANSCRIPTION_LOCAL_URL=http://localhost:9000/v1/audio/transcriptions
TRANSCRIPTION_LOCAL_MODEL=small
```

### Available models

| Model | Size | RAM (CPU) | Speed | Accuracy |
|-------|------|-----------|-------|----------|
| `tiny` | 75 MB | ~400 MB | Fastest | Low |
| `base` | 142 MB | ~500 MB | Fast | Fair |
| `small` | 466 MB | ~1 GB | Moderate | Good |
| `medium` | 1.5 GB | ~3 GB | Slow | Very good |
| `large-v3` | 3 GB | ~6 GB | Slowest | Best |

For development, `small` is the best trade-off. For production with real meetings, `medium` or `large-v3` with a GPU is recommended.

---

## Option B: whisper.cpp HTTP Server

[whisper.cpp](https://github.com/ggerganov/whisper.cpp) is a C++ port of Whisper. Very lightweight, runs well on CPU, and includes a built-in HTTP server.

### Requirements

- Git, CMake, a C++ compiler
- ~1-2 GB RAM for the `small` model

### Build from source

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Download a model
bash models/download-ggml-model.sh small

# Build
cmake -B build
cmake --build build --config Release
```

### Start the HTTP server

```bash
./build/bin/whisper-server \
  --model models/ggml-small.bin \
  --host 0.0.0.0 \
  --port 9000
```

### Configure the server

```env
TRANSCRIPTION_PROVIDER=local
TRANSCRIPTION_LOCAL_URL=http://localhost:9000/inference
TRANSCRIPTION_LOCAL_MODEL=small
```

> Note: whisper.cpp's HTTP server uses `/inference` as its endpoint. Adjust `TRANSCRIPTION_LOCAL_URL` accordingly.

---

## Environment Variables Reference

Add these to your `Server/.env`:

```env
# Provider selection: "mock" | "openai" | "local"
TRANSCRIPTION_PROVIDER=local

# Local provider settings
TRANSCRIPTION_LOCAL_URL=http://localhost:9000/v1/audio/transcriptions
TRANSCRIPTION_LOCAL_MODEL=small

# OpenAI provider settings (only needed if TRANSCRIPTION_PROVIDER=openai)
OPENAI_API_KEY=sk-...
MW_OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

## Hardware Recommendations

| Scenario | Model | Hardware | Transcription speed |
|----------|-------|----------|-------------------|
| Development / testing | `small` | Any modern CPU, 4 GB RAM | ~2-4x realtime |
| Production (CPU) | `medium` | 8+ core CPU, 8 GB RAM | ~0.5-1x realtime |
| Production (GPU) | `large-v3` | NVIDIA GPU (8 GB+ VRAM) | ~10-30x realtime |

"2x realtime" means a 10-minute recording takes ~5 minutes to transcribe.

## Troubleshooting

**Server won't start / out of memory**
Use a smaller model. `tiny` or `base` work on machines with 2 GB RAM.

**Transcription is very slow**
CPU transcription on `medium`/`large` models is expected to be slow. Use a GPU or drop to `small`.

**Connection refused from the Node server**
Confirm the Whisper server is running and the port in `TRANSCRIPTION_LOCAL_URL` matches. If running Docker on WSL2 and the Node server is on Windows, use `host.docker.internal` or `localhost` depending on your network setup.

**Garbled or empty output**
Ensure the audio file is a supported format (WAV, MP3, M4A, FLAC, OGG). Whisper handles most common formats natively.
