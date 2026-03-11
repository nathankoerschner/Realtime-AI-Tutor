# Latency and Evaluation Notes

## Latency goal

The goal of this project is a tutoring interaction that feels conversational rather than chatbot-like. For that reason, the main latency lens used here is **student-perceived response speed**, not just backend timing.

## Important architectural note

This application uses **OpenAI Realtime** as a collapsed pipeline for:

- speech-to-text
- language generation
- text-to-speech

Because those stages are combined inside the realtime service, the application cannot directly expose authoritative internal timings for each stage in the same way that a fully composable pipeline could.

## Measurement philosophy

Rather than overclaiming internal observability, this project documents the measurements it can directly observe from the application boundary.

### Primary observable checkpoints

- session creation start
- session creation success
- connection attempt
- connection success
- user speech start
- user speech end
- tutor response start
- first audio / first avatar-speaking frame
- tutor response end
- session end

These checkpoints are collected because they reflect the actual moments the student experiences.

## Primary proxy metric

### Time to first avatar-speaking frame

The main latency proxy for this architecture is:

**user speech end → first avatar-speaking frame**

This is the most meaningful user-facing checkpoint because it captures the first visible and audible sign that the tutor has begun responding. In a collapsed realtime pipeline, this boundary is more useful than claiming synthetic internal stage timings that the application does not truly own.

## What the current evaluation stack measures

The repository includes instrumentation for:

- connection timing
- first audio frame timing
- user speech duration
- tutor response latency
- response completion timing
- connection success rate
- UI responsiveness events
- error events

Relevant files:

- `frontend/src/lib/evals.ts`
- `backend/app/routes/evals.py`
- `evals/analyzers/performance_analyzer.py`

## Example reported metrics

The current README includes example analysis output:

- **Avg Time to First Frame:** 420ms
- **Avg Response Latency:** 1200ms

These numbers should be interpreted as example observed run metrics from the current evaluation setup, not as a universal guarantee across all deployments and network conditions.

## Why the docs do not claim full per-stage STT / LLM / TTS timings

This is intentional.

Because OpenAI Realtime collapses those stages, the app can only measure them indirectly from the outside. Documenting a false precision here would be misleading. Instead, the project emphasizes:

- user-perceived responsiveness
- clear boundary timing
- reproducible event logging
- comparison across runs using the same measurement method

## Benchmarking position

This project uses a practical prototype benchmarking stance:

- measure what the product can actually observe
- optimize for the first user-visible response moment
- compare runs consistently
- avoid pretending the system has internal stage visibility that it does not

## Current strengths in responsiveness

Based on the implementation, the project improves perceived latency by:

- keeping the backend out of the media path
- using browser-native WebRTC transport to the realtime provider
- collapsing speech + generation + speech synthesis into one managed realtime service
- keeping avatar rendering lightweight on the client
- supporting interruption handling to preserve natural turn-taking

## Current measurement limitations

The current evaluation setup does **not** yet provide:

- authoritative internal STT timing
- authoritative LLM time-to-first-token timing from inside the managed pipeline
- authoritative TTS first-byte timing from inside the managed pipeline
- formal lip-sync offset measurement

Those are known limitations of the present documentation and instrumentation strategy.

## How to read the latency section as a reviewer

This project should be evaluated as a user-facing latency prototype, not a full white-box inference benchmark.

The strongest claim supported by the current implementation is:

- the system is instrumented around user-visible checkpoints
- the architecture is intentionally designed to minimize avoidable latency
- responsiveness is treated as a first-class product concern

## Recommended future documentation additions

If stronger benchmarking evidence is needed, the next documentation pass should add:

- a run table summarizing recent eval outputs
- p50 / p95 response latency across repeated scenarios
- methodology notes for the environment used during measurement
- a comparison between the earlier local MVP and the current OpenAI Realtime build
- a dedicated note on interruption responsiveness
