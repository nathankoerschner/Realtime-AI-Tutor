# Decision Log

## 1. Backend stays out of the audio path

The FastAPI server only creates OpenAI Realtime sessions and serves the frontend bundle. Keeping media out of the backend reduces complexity and avoids introducing extra latency.

## 2. WebRTC is the browser transport

The current implementation uses **WebRTC** to connect the browser directly to OpenAI Realtime.

Why:

- easier microphone capture and remote audio playback in the browser
- lower implementation risk than building custom browser media streaming over a lower-level transport
- good fit for a real-time voice demo

## 3. React + Vite on the frontend

The frontend is a small SPA with realtime state, audio handling, and an animated avatar. React + Vite keeps iteration fast without adding much complexity.

## 4. SVG avatar instead of video or 3D

The app uses a simple animated SVG avatar.

Why:

- much lower implementation complexity
- visually clear enough for a tutor presence
- easy to theme and adjust
- avoids dependencies on external avatar platforms

## 5. Audio-reactive mouth states instead of a phoneme model

The current avatar animation is driven by a lightweight streaming audio analyzer and mouth-state mapper.

Why:

- easy to run entirely in the browser
- no extra model-loading cost
- good enough for a prototype

Tradeoff:

- this is not phoneme-accurate lip sync

## 6. Client-side inferred latency tracking

Latency metrics are computed in the frontend from Realtime events plus local avatar timing.

Why:

- the browser has direct visibility into user interaction timing, Realtime data-channel events, and avatar render timing
- avoids building a separate instrumentation backend

Tradeoff:

- the metrics are approximate and event-shape dependent

## 7. FastAPI serves the production frontend build

In production, FastAPI serves `frontend/dist` when it exists.

Why:

- keeps deployment as a single service
- simple container story
- works well for Railway deployment
