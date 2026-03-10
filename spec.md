# AI Tutor Current Spec

This document describes the **current implemented architecture and behavior** of the app in this repository.

## Product summary

The app is a voice-first tutoring prototype with:

- microphone input from the student
- spoken tutor responses
- optional typed student input
- a stylized animated SVG avatar
- a developer overlay for latency metrics

The tutor is configured to use a warm, encouraging, Socratic teaching style for grades 6-12.

## Current user experience

1. The user opens the app.
2. The user starts a session.
3. The browser requests an ephemeral Realtime session from the FastAPI backend.
4. The frontend opens a **WebRTC** connection directly to OpenAI Realtime.
5. The student can speak through the mic.
6. The tutor responds with streamed audio.
7. The SVG avatar animates from remote audio activity.
8. The user can optionally open the text input and send typed messages.
9. The developer overlay can be toggled to inspect latency metrics and export JSON.

## Actual architecture

### Frontend

- **Framework:** React + TypeScript + Vite
- **Realtime transport:** browser **WebRTC** connection to OpenAI Realtime
- **Avatar rendering:** SVG
- **Avatar animation:** blink + idle styling + lightweight audio-reactive mouth-state mapping
- **Metrics:** client-side timestamps derived from Realtime events and local avatar timing

### Backend

- **Framework:** FastAPI
- **Purpose:** create OpenAI Realtime sessions and serve the built frontend
- **Hot path:** the backend is **not** in the live audio path

### Deployment

- single container deployment
- included support for Railway via `Dockerfile` and `railway.json`

## Session creation behavior

The backend endpoint is:

- `POST /api/realtime/session`

It creates a Realtime session with:

- `voice: alloy`
- `modalities: ["text", "audio"]`
- `turn_detection.type: server_vad`
- concise Socratic tutor instructions

Optional UI-provided context can include:

- `topic_hint`
- `student_level`

## Tutor behavior requirements

The current prompt aims for the following behavior:

- warm and encouraging tone
- English by default unless the student requests another language
- grades 6-12 friendly language
- teach one to three concepts in a short session
- ask guiding questions before explaining
- avoid long lectures and answer dumps
- deepen understanding when the student is correct
- give hints or follow-up questions when the student is incorrect

## Avatar behavior

The current avatar is intentionally simple.

Implemented:

- stylized SVG face/orb presentation
- blink animation
- active/inactive speaking state
- multiple mouth shapes
- mouth-state selection from a lightweight audio analyzer

Not implemented:

- phoneme classification
- production-quality lip sync
- expression/sentiment mapping
- video generation or photoreal avatars

## Metrics captured today

The developer overlay derives metrics from these markers:

- speech stopped
- first text delta
- first audio delta
- first avatar frame
- response complete

Displayed metrics:

- STT approximation
- TTS first byte approximation
- avatar render delay
- end-to-end first frame
- full response time
- estimated lip-sync offset

## What this app is not

To avoid ambiguity, this repository does **not** currently include:

- HeyGen integration
- Visme integration
- a phoneme or viseme ML model
- backend audio proxying
- persistent transcripts or saved tutoring sessions
- reconnect and session recovery flows
- a production analytics backend

## API surface

### `POST /api/realtime/session`
Creates and returns an OpenAI Realtime session payload.

### `GET /api/health`
Returns a simple health response with environment and selected Realtime model.

## Source of truth

For the actual implementation, these files are the best reference:

- `backend/app/main.py`
- `backend/app/routes/realtime.py`
- `backend/app/services/openai_sessions.py`
- `frontend/src/App.tsx`
- `frontend/src/lib/realtime.ts`
- `frontend/src/lib/audio.ts`
- `frontend/src/lib/metrics.ts`
