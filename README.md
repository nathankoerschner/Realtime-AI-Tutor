# AI Tutor

A voice-first tutoring prototype built with FastAPI, React, and the OpenAI Realtime API.

## What this app is

This project is a lightweight conversational tutor:

- **Backend:** FastAPI service that creates ephemeral OpenAI Realtime sessions and serves the built frontend
- **Frontend:** Vite + React + TypeScript single-page app
- **Realtime transport:** browser **WebRTC** connection to OpenAI Realtime
- **Tutor UI:** a stylized animated SVG avatar with blink, idle, and audio-reactive mouth states
- **Metrics:** client-side latency tracking shown in an optional developer overlay

## What is implemented today

- `POST /api/realtime/session` to create an ephemeral Realtime session
- Direct browser connection to OpenAI Realtime using **WebRTC**
- Voice input from the microphone
- Voice output from the tutor
- Optional typed input during a live session
- Warm Socratic tutor instructions using the `alloy` voice
- Animated SVG avatar driven by a lightweight streaming audio analyzer
- Developer overlay with recent latency metrics and JSON export
- FastAPI static hosting for `frontend/dist`
- Railway-ready Docker deployment

## Current architecture

### Backend

The backend is intentionally small and stays out of the media path.

Responsibilities:

- read environment config
- create OpenAI Realtime sessions
- return the session payload to the browser
- serve `/api/health`
- serve the built frontend in production

Key files:

- `backend/app/main.py`
- `backend/app/routes/realtime.py`
- `backend/app/services/openai_sessions.py`
- `backend/app/config.py`

### Frontend

The frontend owns the live tutoring experience.

Responsibilities:

- request a Realtime session from the backend
- open a **WebRTC** connection to OpenAI
- capture microphone audio
- play the remote tutor audio track
- send text messages over the Realtime data channel
- animate the SVG avatar from remote audio energy
- collect timing markers for the developer overlay

Key files:

- `frontend/src/App.tsx`
- `frontend/src/lib/realtime.ts`
- `frontend/src/lib/audio.ts`
- `frontend/src/lib/metrics.ts`
- `frontend/src/components/Avatar/Avatar.tsx`

## Important implementation notes

- The app uses **WebRTC**, not a raw WebSocket connection, for browser realtime media.
- The avatar is **not** driven by a phoneme model. It currently uses a lightweight audio-level analyzer and mouth-state mapper.
- The backend does **not** proxy audio.
- There is no persistent transcript store or session history.
- Latency metrics are inferred from Realtime events and local render timing.

## Repo layout

- `backend/` — FastAPI app
- `frontend/` — Vite React app
- `docs/` — architecture notes, decisions, limitations, and transcript template
- `Dockerfile` — container build for Railway or local Docker runs
- `railway.json` — Railway deploy config

## Setup

### 1. Environment

Copy `.env.example` to `.env` and set:

- `OPENAI_API_KEY`
- optionally `OPENAI_REALTIME_MODEL`
- optionally `APP_ENV`
- optionally `PORT`

### 2. Run the backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the FastAPI backend.

## Production build

```bash
cd frontend && npm install && npm run build
cd ../backend && uv sync && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI serves the SPA.

## Docker

```bash
docker build -t ai-tutor .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY=your_key_here ai-tutor
```

Then open `http://localhost:8000`.

## Railway deployment

This repo includes:

- `Dockerfile`
- `railway.json`
- `.github/workflows/railway-deploy.yml` if you add or keep the workflow in your repo

Minimum Railway setup:

1. Create a Railway service from this repo.
2. Set `OPENAI_API_KEY` in Railway.
3. Deploy.

The service health check is `/api/health`.

## API

### `POST /api/realtime/session`

Request body:

```json
{
  "topic_hint": "photosynthesis",
  "student_level": "grade 8"
}
```

Response:

- OpenAI Realtime session payload
- appended `session_config` object showing the server-side session settings

## Documentation map

- `docs/decisions.md` — why the current architecture looks the way it does
- `docs/latency-optimization.md` — how latency is minimized and measured
- `docs/limitations.md` — current constraints and known gaps
- `docs/transcript-template.md` — manual template for evaluating a demo session
- `plan.md` — implementation status and next steps
- `spec.md` — current product and architecture snapshot
