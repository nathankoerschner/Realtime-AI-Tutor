# Limitations and Future Work

## Current limitations

This project is a prototype and should be read that way. Its strengths are simplicity, responsiveness, and architectural clarity, but there are important limitations.

### Avatar realism and lip sync

- The avatar is a lightweight 2D SVG avatar, not a photorealistic tutor.
- Mouth motion is audio-reactive / viseme-driven, not phoneme-accurate lip sync.
- The project does not currently publish a formal measured lip-sync offset.

### Latency observability

- The current architecture uses a collapsed OpenAI Realtime pipeline.
- Because of that, internal STT, LLM, and TTS timings are not directly exposed by the application.
- Current documentation therefore focuses on boundary and user-perceived latency rather than white-box per-stage timing.

### Educational scope

- The current prototype is intentionally narrow in concept scope.
- It is best positioned for short interventions on topics like linear equations and molecular structure rather than full-course tutoring.
- There is no persistent learner profile or durable personalization across sessions.

### Product depth

- There are no visual teaching aids or diagrams yet.
- There is no persistent transcript or session history across sessions.
- The tutor is designed for support and redirection, not long-term mastery tracking.

### Scalability and operations

- The backend shape is simple, but production scale would still depend heavily on vendor concurrency and rate limits.
- Evaluation logging is useful for development but would likely need to be reduced or sampled in production.
- Cost is dominated by managed realtime API usage.

## Why these limitations were accepted

These tradeoffs were accepted because the project prioritized:

- low friction
- realtime responsiveness
- a thin operational footprint
- a scalable client-side avatar strategy
- a practical proof-of-concept implementation over maximum realism

## Future work

### Measurement and evaluation

- add stronger published latency tables
- add repeated-run p95 summaries
- add clearer demo-specific evaluation summaries
- add formal lip-sync measurement if needed

### Educational depth

- add concept-specific tutoring flows per grade band
- add stronger success rubrics for each concept
- add visual teaching aids for selected lessons
- add limited learner memory across a session or across short session windows

### Production hardening

- reduce or sample eval logging in production
- harden connection and failure monitoring
- request higher provider rate limits as usage grows
- investigate a queuing strategy for connection initialization during spikes
- add more explicit fallbacks for degraded network conditions

### Broader reach

- add multilingual support where product geography requires it
- tune concept coverage for narrower grade bands
- test more deeply on longer conversations and classroom-scale usage patterns
