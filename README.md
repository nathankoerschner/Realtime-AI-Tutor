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

## Railway deployment with GitHub Actions

### Files added

- `Dockerfile` — builds the React frontend and runs the FastAPI app
- `railway.json` — tells Railway to use the Dockerfile and health check `/api/health`
- `.github/workflows/railway-deploy.yml` — builds the app on every push to `main` and deploys with the Railway CLI
- `backend/requirements.txt` — lightweight backend dependency list for CI and Docker

### One-time Railway setup

1. Create a new Railway project and service from this repo.
2. In Railway, set the service variable `OPENAI_API_KEY`.
3. Copy the service ID from Railway.
4. In GitHub, add these repository secrets:
   - `RAILWAY_TOKEN` — Railway project token for this service/environment
   - `RAILWAY_SERVICE_ID` — target Railway service ID
5. Push to `main` or run the workflow manually from the Actions tab.

### Local container test

```bash
docker build -t live-ai-video-tutor .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY=your_key_here live-ai-video-tutor
```

Then open `http://localhost:8000`.

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
