# Live AI Video Tutor Spec

## Purpose
Build a low-latency AI video avatar tutor that teaches 1-3 concepts at a 6th-12th grade level using the Socratic method.

## Required Deliverables
- 1-5 minute demo video of the AI video tutor teaching 1-3 concepts at a 6th-12th grade level using the Socratic method
- Low-latency AI video avatar tutor prototype (working system)
- Latency benchmarking framework with per-stage results
- Educational interaction quality assessment: annotated session transcript (detailed rubric deferred to later)

## Core Product Requirements

### 1. Tutor Experience
- The app must provide a video-based AI tutor interaction.
- Video interaction is a core requirement.
- The tutor must support voice input, text input, and voice output.
- The tutor must provide a video avatar or real-time visual feedback.
- Modality switching: student can speak or type at any time; tutor always responds with voice + avatar.
- The interaction must feel like a natural conversation.

### 2. Educational Requirements
- The tutor must teach 1-3 clearly defined concepts per session.
- The concepts must be appropriate for students in grades 6-12.
- The tutor handles any topic dynamically — no pre-selected topic list.
- The Socratic method must be the primary teaching approach.
- The tutor must ask guiding questions rather than lecture or simply provide answers.
- The tutor must adapt its questioning based on student responses.
- When the student is wrong, the tutor must follow up rather than just correct.
- When the student is right, the tutor must advance or deepen understanding.
- Subject matter content must be accurate.
- The tutoring must include appropriate scaffolding for 6th-12th grade comprehension levels.
- Frustration detection and tiered scaffolding are deferred — not required for initial implementation.

### 3. Tutor Personality
- Warm and encouraging tone — "favorite teacher" energy.
- Patient, uses positive reinforcement, celebrates when students get things right.
- Approachable and never condescending.
- Voice: OpenAI Realtime `alloy` voice.

### 4. Latency Requirements
- End-to-end response latency, measured from when the student finishes speaking to when the avatar begins responding, must be less than 1 second.
- Ideal end-to-end response latency target is less than 500ms.
- Time to first audio byte for streamed avatar speech must be less than 500ms.
- Lip-sync alignment between avatar mouth movement and audio must remain within ±80ms.
- Full response completion for a typical tutoring exchange must be less than 3 seconds.
- Responses must be streamed through the full pipeline: LLM → TTS → avatar.
- The system must measure and track end-to-end latency and per-stage latency.
- The inference pipeline must be optimized with per-component latency budgets.

### 5. Per-Stage Latency Budgets
| Pipeline stage | Target | Max acceptable |
|---|---:|---:|
| Speech-to-text (STT) | <150ms | <300ms |
| LLM time-to-first-token | <200ms | <400ms |
| Text-to-speech (TTS) first byte | <150ms | <300ms |
| Avatar rendering / lip-sync | <100ms | <200ms |
| Network + overhead | <50ms | <100ms |
| Total end-to-end | <500ms | <1000ms |

### 6. Latency Measurement Strategy
- Since the OpenAI Realtime API collapses STT+LLM+TTS into a single pipeline, per-stage latency cannot be measured directly.
- Use OpenAI Realtime API event timestamps to infer approximate stage boundaries (e.g., `input_audio_buffer.speech_stopped`, `response.audio.delta`, `response.text.delta`).
- No separate synthetic benchmarking harness required.

### 7. System Requirements
- The system must support inputs of text, voice, and contextual session data.
- Input context must include subject area, student level, and conversation history.
- The system must output streamed text responses.
- The system must output synthesized speech responses.
- The system must output video/avatar responses.
- The system must output latency measurements and quality scores.
- No LLM tool use / function calling — pure voice+text conversation only.

### 8. Architecture Requirements
- The system must be designed for real-time AI interactions.
- The system architecture must include efficient model serving infrastructure.
- The system architecture must consider caching and pre-computation strategies.
- The system architecture must consider edge deployment.
- The system documentation must include cost-performance tradeoff analysis.

## Avatar Specification

### Visual Style
- Minimal illustrated 2D face, gender-neutral and racially abstract.
- Deliberately stylized to avoid representation concerns and uncanny valley.
- Clean, simple aesthetic (think Notion-style avatar).

### Viseme System
- 10-12 viseme states using the Preston Blair phoneme set (A/I, O, U, E, L, F/V, M/B/P, etc.).
- SVG mouth shape assets that swap between states.
- Smooth transitions between viseme states.

### Expressions
- Mouth animation driven by visemes (primary).
- Periodic random eye blinks on a timer.
- Subtle idle animation: gentle head movement or breathing loop.
- No full expression/sentiment mapping — deferred.

### Viseme Extraction
- Client-side phoneme detection model running in the browser.
- Research needed: find a suitable model (WASM/ONNX) that can run in-browser with <30ms latency per audio chunk.
- No fallback to FFT — trust that modern browsers with ONNX Runtime or WASM can handle this.

## Technical Architecture

### Stack
- **Frontend:** React + Canvas/SVG for avatar rendering
- **Backend:** Python + FastAPI (using `uv` for project management)
- **Real-time:** OpenAI Realtime API (WebSocket)
- **Deployment:** Single VPS on Fly.io or Railway (FastAPI serves both API and static React build)

### Server Role
- The FastAPI server issues ephemeral OpenAI Realtime API tokens with session configuration (system prompt, voice, etc.).
- The client connects directly to the OpenAI Realtime API after receiving the token.
- The server is NOT in the hot audio path — zero added latency to the real-time interaction.
- Server responsibilities: token generation, session config, static file serving.

### Client Architecture
- React app with Web Audio API for microphone capture and audio playback.
- Direct WebSocket connection to OpenAI Realtime API.
- Canvas/SVG renderer for the 2D avatar with viseme-driven mouth animation.
- Client-side phoneme model for viseme extraction from audio stream.
- Text input field for typed messages (sent as text to Realtime API).

### Session Flow
1. Student opens the app. Avatar appears in idle state.
2. Student presses "Start Session" or "Press to talk" to begin.
3. Student speaks (or types) first to set the topic.
4. Tutor identifies the subject dynamically and begins Socratic interaction.
5. Conversation continues with voice or text input from student, voice+avatar output from tutor.

### Context Management
- Rely on the OpenAI Realtime API's built-in conversation context.
- No custom summarization, truncation, or concept tracking.
- Sessions are expected to be short enough (1-5 min demo) that context overflow is not a concern.

## UI Design

### Layout
- Avatar-dominant: large avatar takes 60-70% of screen.
- Small text input bar at bottom.
- Minimal chrome — focus is on the face-to-face tutoring feel.
- No conversation transcript panel by default.

### Benchmarking Display
- Toggleable developer overlay showing real-time per-stage latency metrics (like a game FPS counter).
- JSON export button for downloading the latency report as a submission artifact.

## Benchmarking and Measurement Requirements
- The app must include a latency benchmarking framework.
- Benchmarking must report per-stage latency inferred from Realtime API event timestamps for:
  - STT (speech end → first text delta)
  - LLM time to first token (approximated from event timing)
  - TTS time to first audio byte (first text delta → first audio delta)
  - Avatar rendering (first audio delta → first viseme rendered)
  - End-to-end latency (speech end → avatar begins responding)
- The app must measure lip-sync alignment.
- Latency data is surfaced via a toggleable developer overlay with JSON export.

## Demo and Submission Requirements
- A recorded demo video is required, captured via OBS or QuickTime (screen record + mic).
- The demo video must be 1-5 minutes long.
- The demo must show a complete tutoring interaction.
- The demo must demonstrate the Socratic method clearly.
- The demo must show the tutor teaching 1-3 concepts suitable for grades 6-12.
- The tutor must include a functional video avatar with lip-sync.
- The code must run with one command or clear minimal setup.
- README must explain setup and usage.
- Optimization strategies must be documented per pipeline stage.
- A decision log documenting major choices is required.
- Limitations must be explicitly stated.

## Success Criteria

### Latency
- End-to-end response latency: <1s required, <500ms ideal
- Time to first audio byte: <500ms
- Lip-sync alignment: within ±80ms
- Full response completion: <3s for a typical query

### Quality and Pedagogy
- Response accuracy: 90%+
- Educational helpfulness rating: 4/5+
- Socratic method usage: tutor asks guiding questions and does not lecture
- Grade-level appropriateness: content and language appropriate for grades 6-12

### UX and Reliability
- Conversation naturalness: user preference over chatbot
- No perceptible stilted or disconnected feel: >80% of testers agree
- Reliability: basic error handling, app should not crash during demo (production-grade availability deferred)

## Evaluation Areas
- Latency performance
- Video integration
- Educational quality
- Technical innovation
- Implementation quality
- Documentation

## Product Decisions
- Modality priority: voice-first, with text input supported.
- Latency targets are strict and should be prioritized.
- OpenAI Realtime speech-to-speech will be used for the voice interaction path.
- There is no cost constraint at this time.
- No LLM tools/function calling — pure conversation.
- Tutor personality: warm and encouraging, alloy voice.
- Avatar: minimal illustrated 2D, gender-neutral, 10-12 Preston Blair visemes, eye blinks + idle animation.
- Server: ephemeral token issuer only, not in the audio path.
- Deployment: single VPS (Fly.io/Railway).

## Implementation

### Primary Approach
- Use the OpenAI Realtime API as the primary real-time interaction layer.
- Use OpenAI Realtime speech-to-speech for the core voice tutoring path.
- Prefer a collapsed real-time pipeline through OpenAI Realtime for lowest possible latency.
- Keep the overall system streaming end-to-end so the tutor begins responding as quickly as possible.

### Implementation Priorities
1. Build a voice-first tutoring flow with text input support.
2. Use OpenAI Realtime speech-to-speech for low-latency real-time interaction.
3. Build the 2D viseme-driven avatar with Preston Blair mouth shapes, eye blinks, and idle animation.
4. Research and integrate a client-side phoneme detection model for viseme extraction.
5. Instrument the pipeline using Realtime API event timestamps for per-stage latency measurement.
6. Build the developer overlay for real-time latency display + JSON export.
7. Optimize to the strict latency targets in this spec.

### Required Implementation Outcomes
- The implementation must support real-time student voice input and text input.
- The implementation must support real-time speech-to-speech tutor responses via OpenAI Realtime.
- The implementation must drive a 2D viseme-driven avatar with lip-sync, eye blinks, and idle animation.
- The implementation must maintain the Socratic tutoring behavior with warm, encouraging personality.
- The implementation must expose timing data via a developer overlay and JSON export.

### Deferred Items
- Frustration detection and adaptive scaffolding tiers.
- Full expression/sentiment mapping for avatar.
- Detailed educational quality rubric (beyond transcript export).
- Production-grade reliability (auto-reconnect, health checks, session persistence).
- Separate synthetic per-stage benchmarking harness.

### Notes
- OpenAI Realtime speech-to-speech is the default implementation path for tutor voice interaction.
- The video avatar layer must consume or synchronize with the streamed speech output while preserving lip-sync requirements.
- Any parts not covered by OpenAI Realtime must still satisfy the latency, video, and measurement requirements already defined in this spec.
- Client-side phoneme model selection is a research task — needs to be identified before avatar implementation begins.
