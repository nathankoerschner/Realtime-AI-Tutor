# AI Tutor

A lightweight realtime tutoring prototype built with FastAPI, React, and the OpenAI Realtime API.

## Start here for reviewers

If you are reviewing this project against the realtime tutor brief, start with:

1. [`docs/submission.md`](docs/submission.md) for the intended claim, scope, and reviewer framing
2. [`docs/architecture.md`](docs/architecture.md) for system design and tradeoffs
3. [`docs/latency.md`](docs/latency.md) for latency methodology and measurement boundaries
4. [`docs/limitations.md`](docs/limitations.md) for known gaps and future work
5. [`docs/decisions.md`](docs/decisions.md) for a concise decision log

Then refer to:

- [`README.md`](README.md) for setup and repo structure
- [`evals/README.md`](evals/README.md) and [`evals/USAGE.md`](evals/USAGE.md) for evaluation tooling

## Overview

- Browser connects directly to OpenAI Realtime over **WebRTC**
- FastAPI backend creates ephemeral sessions and serves the app
- Supports microphone input, streamed tutor audio, and optional typed input
- Includes an expressive lightweight 2D avatar optimized for conversational presence

## Project docs

For submission-oriented documentation and design rationale, see:

- [`docs/submission.md`](docs/submission.md) — project thesis, scope, and reviewer framing
- [`docs/architecture.md`](docs/architecture.md) — architecture decisions and system design
- [`docs/latency.md`](docs/latency.md) — latency methodology, observable checkpoints, and evaluation framing
- [`docs/limitations.md`](docs/limitations.md) — current limitations and future work
- [`docs/decisions.md`](docs/decisions.md) — concise decision log and tradeoffs

## Tech

- **Backend:** FastAPI
- **Frontend:** React + Vite + TypeScript
- **Deploy:** Docker / Railway

## Project structure

- `backend/` — API and production static hosting
- `frontend/` — web app
- `Dockerfile` — container build
- `railway.json` — Railway config

## Setup

### Environment

Copy `.env.example` to `.env` and set:

- `OPENAI_API_KEY`
- optional: `OPENAI_REALTIME_MODEL`, `APP_ENV`, `PORT`

### Run locally

Backend:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` to the backend in development.

### Run tests

Frontend (with coverage):

```bash
cd frontend
npm install
npm run test:run
```

Backend (with coverage):

```bash
cd backend
uv sync --extra dev
PYTHONPATH=. uv run pytest
```

Both test suites enforce **100% coverage** with **26 total tests**:
- **Frontend**: 16 tests (Component tests, App integration tests, library unit tests)
- **Backend**: 10 tests (API endpoint tests, service layer tests, static file serving tests)

Run all tests:
```bash
./scripts/test-summary.sh
```

## Evaluation Framework

The project includes an evaluation system for measuring responsiveness, tutoring behavior, and conversation quality:

### Quick Start
```bash
# Run all evaluation scenarios
python scripts/run-evals.py run

# Run specific scenarios
python scripts/run-evals.py run --scenarios photosynthesis_discovery algebra_wrong_answer

# Generate performance analysis
python scripts/run-evals.py analyze --hours 24
```

### Key Metrics
- **Performance**: time to first frame, response latency, connection reliability
- **Socratic Method**: answer-giving detection, question quality, guidance effectiveness
- **Conversation Quality**: context retention, adaptability, educational progression

### Example Results
```bash
📊 EVALUATION SUMMARY
   Scenarios: 3/4 passed
   Success Rate: 75.0%
   
🎭 SOCRATIC METHOD SCORES  
   Overall: 0.82/1.0
   Question Quality: 0.87/1.0
   Answer Giving: 0.15/1.0 (lower is better)
   
⚡ PERFORMANCE
   Avg Time to First Frame: 420ms (B)
   Avg Response Latency: 1200ms (B)
```

See [`evals/README.md`](evals/README.md) and [`evals/USAGE.md`](evals/USAGE.md) for evaluation details, and the `docs/` directory for submission-oriented project documentation.

## Production

```bash
cd frontend && npm install && npm run build
cd ../backend && uv sync && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

If `frontend/dist` exists, FastAPI serves the built app.

## Docker

```bash
docker build -t ai-tutor .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY=your_key_here ai-tutor
```

Open `http://localhost:8000`.

## API

### `POST /api/realtime/session`

Example request:

```json
{
  "topic_hint": "photosynthesis",
  "student_level": "grade 8"
}
```

Returns an OpenAI Realtime session payload plus `session_config`.

### `GET /api/health`

Returns a simple health response.

## Notes

- The backend is **not** in the live audio path.
- The app uses **WebRTC**, not raw WebSockets, for browser realtime media.
- The avatar is intentionally lightweight and presence-focused rather than phoneme-accurate.
- There is no persistent transcript or session history.
