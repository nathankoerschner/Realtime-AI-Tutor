# Implementation Plan and Status

This document tracks the current state of the app and the most useful next improvements.

## Current status

### Done

- FastAPI backend created
- `POST /api/realtime/session` implemented
- OpenAI Realtime session creation implemented server-side
- React + Vite frontend created
- Browser **WebRTC** connection to OpenAI Realtime implemented
- Microphone capture implemented
- Remote tutor audio playback implemented
- Typed input over the Realtime data channel implemented
- Animated SVG avatar implemented
- Lightweight audio-reactive mouth-state engine implemented
- Client-side latency tracking implemented
- Developer overlay with JSON export implemented
- FastAPI static serving for the built frontend implemented
- Dockerfile and Railway config added

### Partially done

- Socratic tutoring behavior depends on prompt quality and still needs real session testing/tuning
- Latency metrics are useful but inferred, not ground-truth per-stage measurements
- Lip sync is functional in a lightweight sense, but not phoneme-accurate

### Not done

- persistent transcript capture
- reconnect flow and session recovery
- stronger error-state UX
- transcript annotation workflow inside the app
- production observability
- automated latency benchmarking across runs
- richer tutor controls or topic/session setup UI

## Current architecture plan

### Backend responsibilities

Keep the backend small:

- load environment configuration
- create OpenAI Realtime sessions
- return session payloads to the client
- serve the built frontend
- expose a health endpoint

### Frontend responsibilities

Keep the live session in the browser:

- request a Realtime session from FastAPI
- open the WebRTC connection to OpenAI
- capture microphone audio
- play remote audio
- send typed messages over the data channel
- animate the avatar from remote audio analysis
- compute and display latency metrics

## Recommended next steps

### 1. Tighten docs and naming

- keep docs aligned with the real implementation
- remove references to unused technologies
- keep setup instructions minimal and correct

### 2. Improve runtime resilience

- clearer failure states for mic permission issues
- clearer failure states for Realtime connection failures
- better handling when autoplay is blocked
- reset metrics cleanly across repeated sessions

### 3. Improve tutor quality

- run structured conversation tests across subjects and grade levels
- tune prompt wording for shorter, more clearly Socratic turns
- verify the tutor consistently narrows broad topics to 1-3 concepts

### 4. Improve avatar quality

- smooth mouth-state transitions further
- calibrate audio thresholds across browsers
- optionally replace the lightweight analyzer with a better viseme engine later

### 5. Improve measurement quality

- log more event details for debugging
- separate typed-turn metrics from voice-turn metrics in exports
- add summaries such as averages and percentiles to the overlay/export

## Practical priorities

If only a small amount of time is available, prioritize work in this order:

1. docs accuracy
2. error handling and connection resilience
3. prompt quality
4. avatar polish
5. richer analytics

## Definition of a solid next version

A good next revision of this app would:

- keep the current WebRTC + FastAPI architecture
- have accurate docs throughout the repo
- handle common session failures gracefully
- produce consistently short Socratic tutor turns
- provide more reliable exported latency summaries
