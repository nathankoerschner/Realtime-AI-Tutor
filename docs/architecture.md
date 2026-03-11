# Architecture

## Overview

This project uses a thin-backend, browser-first architecture for realtime tutoring.

### Core design goals

- keep the live media path as short as possible
- avoid avoidable network hops
- preserve conversational responsiveness
- keep the implementation simple enough to scale as a product feature
- provide a tutor that feels present without requiring a heavyweight avatar stack

## High-level system design

```text
Browser UI
  ├─ microphone input
  ├─ WebRTC connection to OpenAI Realtime
  ├─ transcript + chat rendering
  ├─ avatar animation
  └─ eval event collection
         │
         ├──────────────▶ OpenAI Realtime API
         │                 ├─ speech recognition
         │                 ├─ language generation
         │                 └─ speech synthesis
         │
         └──────────────▶ FastAPI backend
                           ├─ ephemeral session creation
                           ├─ static asset serving
                           └─ eval log ingestion
```

## Why this architecture

### OpenAI Realtime

The project originally explored more local, self-managed approaches. The final system moved to OpenAI Realtime because it collapses the speech-to-text, LLM, and text-to-speech path into a single realtime service and exposes browser-friendly WebRTC connectivity.

This reduced integration complexity and helped keep the system responsive enough for conversational use.

### In-browser WebRTC

WebRTC was chosen because the application is fundamentally live media. For this use case, it is a better transport fit than introducing additional proxying layers or treating audio as ordinary request/response traffic.

### Thin FastAPI backend

The backend exists to:

- create ephemeral sessions
- serve the built frontend in production
- ingest evaluation events

The backend is intentionally **not** in the live audio path. That choice keeps custom infrastructure from becoming a bottleneck in the conversational loop.

## Main components

## Frontend

Key responsibilities:

- session start/stop
- direct connection to OpenAI Realtime
- microphone control
- transcript and chat UI
- interruption handling
- avatar rendering
- latency/eval event collection

Relevant files:

- `frontend/src/App.tsx`
- `frontend/src/lib/realtime.ts`
- `frontend/src/lib/audio.ts`
- `frontend/src/lib/evals.ts`
- `frontend/src/components/Avatar/Avatar.tsx`

### Frontend interaction model

The frontend is designed around a conversational loop:

1. user speaks or types
2. tutor turn is created
3. transcript/audio stream in
4. avatar reflects speaking state
5. user can interrupt
6. UI keeps transcript ordering stable

A significant amount of frontend work went into preserving the feeling that the tutor is alive and interruptible rather than behaving like a delayed chatbot.

## Backend

Key responsibilities:

- provide `POST /api/realtime/session`
- create OpenAI Realtime sessions with tutoring instructions
- log evaluation events
- serve frontend assets when built

Relevant files:

- `backend/app/routes/realtime.py`
- `backend/app/services/openai_sessions.py`
- `backend/app/routes/evals.py`
- `backend/app/main.py`

## Avatar design

The project intentionally uses a custom 2D avatar instead of either a 3D avatar or a third-party managed avatar service.

### Why not third-party avatar services

Rejected because they would:

- add ongoing cost
- weaken scaling economics
- add external dependencies to the rendering path
- potentially introduce more latency or integration complexity

### Why not 3D

Rejected because of the risk that a low-to-medium fidelity 3D tutor would feel uncanny rather than helpful.

### Why 2D

The 2D avatar was chosen to maximize:

- presence
- responsiveness
- simplicity
- rendering efficiency
- device compatibility

The avatar is not trying to mimic a human face perfectly. It is trying to feel expressive and attentive enough to support a live tutoring interaction.

## Realtime tutoring strategy

The tutor instructions enforce a Socratic posture:

- do not simply give the answer
- ask guiding questions
- keep turns short
- redirect mistakes supportively
- adapt to what the student already knows

This matches the intended use case: short interventions that help a student get unstuck without turning into long lecture responses.

## Architecture tradeoffs

## Benefits

- minimal custom backend complexity
- no backend media relay
- direct browser-to-realtime transport
- simpler deployment story
- lower operational overhead than self-hosting a full STT/LLM/TTS stack
- scalable avatar rendering on the client

## Tradeoffs

- less direct visibility into internal STT/LLM/TTS stage timings
- dependence on a managed vendor pipeline
- no custom control over lower-level speech or synthesis internals
- avatar expressiveness is intentionally lightweight, not photorealistic

## Scaling considerations

This architecture is best understood as a feature architecture for a larger tutoring product.

### What scales well

- thin backend session bootstrap
- browser-side avatar rendering
- no media relay through application servers
- short-session support use cases

### Likely first bottlenecks

- vendor rate limits / concurrent realtime sessions
- API usage cost
- log volume if evaluation logging remains enabled at full detail

### Likely next production steps

- reduce or sample eval logging in production
- harden session lifecycle monitoring
- request higher provider rate limits as concurrency needs become clearer
- investigate a queuing strategy for connection initialization during traffic bursts
- improve operational visibility around session failures and latency regressions

## Alternatives considered

### Self-hosted local/open-source pipeline

Considered and prototyped in an earlier MVP. Rejected for the current build in favor of a simpler, more reliable realtime stack with fewer moving parts.

### Backend-mediated media flow

Rejected because routing live media through the backend would introduce extra latency and more operational surface area.

### Heavier avatar stacks

Rejected because the product goal was not maximum realism; it was fast, scalable tutor presence.
