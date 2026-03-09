# Live AI Video Tutor

Prototype implementation of the plan in `plan.md`: a low-latency AI tutor with voice/text input, voice output, avatar feedback, and client-side latency instrumentation.

## Repo layout

- `backend/` — FastAPI token service and static frontend hosting
- `frontend/` — Vite + React + TypeScript app
- `docs/` — decision log, latency notes, limitations, transcript template

## Features implemented

- FastAPI endpoint: `POST /api/realtime/session`
- Direct browser connection to OpenAI Realtime using an ephemeral session
- Voice-first tutoring flow via WebRTC mic + remote audio
- Text input path over the Realtime data channel
- Warm Socratic tutor prompt using `alloy`
- Large SVG avatar with speaking states, idle motion, and metrics-driven response timing
- Developer overlay with inferred per-turn latency and JSON export

## Current caveat

The avatar pipeline is structured around pluggable viseme extraction, but the included browser implementation is currently a lightweight streaming analyzer rather than a production phoneme model. See `docs/limitations.md`.

## Setup

### 1. Environment

Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

### 2. Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the FastAPI server.

## Production build

```bash
cd frontend && npm install && npm run build
cd ../backend && uv sync && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

FastAPI serves `frontend/dist` when it exists.

## API

### `POST /api/realtime/session`

Request body:

```json
{
  "topic_hint": "photosynthesis",
  "student_level": "grade 8"
}
```

Response: proxied OpenAI Realtime session payload plus the server's `session_config`.

## Notes

- Keep the FastAPI server out of the hot audio path.
- The tutor relies on OpenAI Realtime conversation state; no custom summarization is added.
- Latency metrics are inferred from event timings, matching the spec.
