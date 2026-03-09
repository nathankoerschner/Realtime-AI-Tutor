# Implementation Plan: Live AI Video Tutor

## 1. Goal
Build a low-latency AI video avatar tutor prototype that:
- supports voice input, text input, and voice output
- renders a live 2D avatar with viseme-based lip-sync
- teaches 1-3 student-defined concepts using the Socratic method
- measures inferred per-stage latency from OpenAI Realtime events
- is demo-ready for a 1-5 minute recorded tutoring session

## 2. Recommended Delivery Strategy
Prioritize the shortest path to a working demo while protecting the hard requirements:
1. Realtime tutoring loop first
2. Avatar rendering second
3. Latency instrumentation third
4. Prompt/pedagogy tuning fourth
5. Polish, docs, and demo assets last

This sequence reduces risk because the core challenge is not CRUD or static UI; it is low-latency streaming interaction.

---

## 3. Proposed Architecture

### Frontend
- **React** app
- **Web Audio API** for mic capture and streamed playback
- **Canvas or SVG avatar renderer**
- **Realtime WebSocket client** connecting directly to OpenAI Realtime API
- **Client-side latency tracker** using Realtime event timestamps + local render timestamps
- **Developer overlay** for metrics + JSON export

### Backend
- **Python + FastAPI** managed with `uv`
- Endpoints for:
  - ephemeral OpenAI Realtime session token issuance
  - static frontend serving
  - optional health/version endpoint
- Backend stays **out of the hot audio path**

### Deployment
- Single service deployment on **Fly.io or Railway**
- FastAPI serves API + built frontend

---

## 4. System Breakdown by Component

### A. FastAPI token service
**Purpose:** issue ephemeral tokens with the correct session configuration.

**Tasks**
- Create FastAPI app scaffold
- Add environment variable handling for OpenAI API key
- Add `POST /api/realtime/session` endpoint
- Configure session defaults:
  - voice: `alloy`
  - tutoring system prompt
  - response style: warm, encouraging, Socratic
  - input modalities: voice + text
- Add static file serving for React build
- Add basic error responses and logging

**Acceptance criteria**
- Client can fetch a valid ephemeral session token
- Token endpoint returns config required to connect directly to OpenAI Realtime
- Server can serve production frontend bundle

### B. Realtime tutoring client
**Purpose:** establish the core conversation loop.

**Tasks**
- Create React app shell
- Add session start flow
- Connect client directly to OpenAI Realtime API using ephemeral token
- Stream microphone audio input
- Support typed student input at any time
- Handle streamed tutor output events:
  - text deltas
  - audio deltas
  - response lifecycle events
- Ensure tutor always responds with voice output

**Acceptance criteria**
- Student can start a session and speak first
- Student can also type messages during session
- Tutor responds naturally with speech and streamed text events
- Interaction works continuously for a 1-5 minute session

### C. Tutor behavior / prompting
**Purpose:** satisfy pedagogy requirements.

**Tasks**
- Write a strong system prompt enforcing:
  - Socratic method as default
  - warm “favorite teacher” tone
  - grade 6-12 language adaptation
  - teach only 1-3 concepts per session
  - ask guiding follow-up questions when student is wrong
  - deepen understanding when student is right
  - avoid long lectures and answer-dumps
- Add lightweight session instructions for:
  - dynamic topic discovery from student’s opening question
  - concise responses suitable for low latency
  - frequent checkpointing of understanding
- Test prompt with multiple subjects:
  - math
  - science
  - history
  - literature

**Acceptance criteria**
- Tutor usually leads with questions instead of exposition
- Tutor adapts based on student responses
- Tone remains warm and non-condescending
- Topic is not limited to a preconfigured list

### D. Avatar rendering
**Purpose:** satisfy video/avatar requirement with minimal implementation risk.

**Tasks**
- Build a minimal illustrated 2D face component
- Create 10-12 Preston Blair-inspired viseme mouth SVG assets
- Add eye blink timer
- Add subtle idle motion (head drift or breathing)
- Build viseme state machine for smooth transitions
- Show avatar in large dominant layout

**Acceptance criteria**
- Avatar is always visible during session
- Mouth shapes visibly animate during tutor audio playback
- Blink and idle animation make avatar feel alive even when not speaking
- Visual style stays simple, stylized, and non-uncanny

### E. Viseme extraction / lip-sync
**Purpose:** convert streamed tutor audio into mouth animation in the browser.

**Tasks**
- Research an in-browser phoneme/viseme-capable model with WASM/ONNX support
- Evaluate candidates for:
  - browser compatibility
  - chunk latency under 30ms
  - integration complexity
  - output quality for live streaming audio
- Build audio analysis pipeline from streamed tutor audio playback buffer
- Map model output to 10-12 viseme states
- Measure first viseme render time and ongoing lip-sync offset
- Add smoothing/debouncing so mouth animation feels stable

**Acceptance criteria**
- First viseme render occurs quickly after first audio chunk
- Lip-sync generally remains within ±80ms target
- Animation looks stable and understandable in the demo

**Risk note**
This is the highest technical uncertainty in the spec. If model selection becomes a blocker, the plan should explicitly timebox research and pick the simplest credible option early.

### F. Latency instrumentation
**Purpose:** produce benchmark data required by the spec.

**Tasks**
- Define a client-side event timeline model
- Capture timestamps for:
  - speech stop
  - first text delta
  - first audio delta
  - first viseme rendered
  - response completion
- Infer metrics required by spec:
  - STT: speech end → first text delta
  - approximate LLM TTFT from event sequence
  - TTS first byte: first text delta → first audio delta
  - avatar render: first audio delta → first viseme rendered
  - end-to-end: speech end → avatar begins responding
  - full response completion time
  - lip-sync alignment estimate
- Store per-turn metrics in memory
- Add JSON export

**Acceptance criteria**
- Each tutor turn produces structured latency data
- Overlay displays current and recent metrics
- User can export report as JSON for submission artifact

### G. Developer overlay
**Purpose:** make latency/debug state visible during testing and demo capture.

**Tasks**
- Add toggleable overlay panel
- Show:
  - current connection/session state
  - per-stage latency for latest turn
  - rolling averages / recent history
  - lip-sync offset
- Add download button for JSON export

**Acceptance criteria**
- Overlay can be shown/hidden without disrupting session
- Metrics are legible during live testing
- Export produces valid JSON report

### H. Documentation and submission assets
**Purpose:** satisfy deliverables beyond code.

**Tasks**
- Write README with setup, env vars, run commands, architecture summary
- Write decision log documenting major technical choices and tradeoffs
- Document optimization strategy by pipeline stage
- Document known limitations and deferred items
- Prepare annotated session transcript from a demo run
- Record 1-5 minute demo video

**Acceptance criteria**
- A new evaluator can run the project with minimal setup
- Docs explain why the architecture meets low-latency goals
- Submission artifacts are complete

---

## 5. Suggested Implementation Phases

### Phase 0 — Project bootstrap
- Initialize FastAPI backend with `uv`
- Initialize React frontend
- Decide monorepo layout, e.g.:
  - `backend/`
  - `frontend/`
  - `docs/`
- Add shared `.env.example`
- Add basic README skeleton

**Deliverable:** app boots locally, frontend served, token endpoint stub exists.

### Phase 1 — Core realtime conversation
- Implement ephemeral token issuance
- Implement direct client connection to OpenAI Realtime
- Add mic capture + voice output playback
- Add text input path
- Validate the full tutoring loop

**Deliverable:** student and tutor can have a working real-time conversation.

### Phase 2 — Pedagogy tuning
- Implement system prompt and session configuration
- Test against multiple subjects and age levels
- Reduce tutor verbosity to preserve latency and conversational feel

**Deliverable:** interactions visibly follow a Socratic tutoring style.

### Phase 3 — Avatar MVP
- Build face, idle animation, blinks, and placeholder speaking states
- Then integrate full viseme set

**Deliverable:** working visual tutor avatar that responds during speech.

### Phase 4 — Viseme model integration
- Select and integrate in-browser phoneme/viseme detector
- Map outputs to Preston Blair visemes
- Tune smoothing and timing

**Deliverable:** believable live lip-sync.

### Phase 5 — Latency measurement + overlay
- Capture timestamps from Realtime events and render lifecycle
- Add metrics overlay and JSON export

**Deliverable:** benchmark-ready app with measurable per-stage metrics.

### Phase 6 — Hardening + docs + demo
- Improve error handling for demo stability
- Tune prompt and audio settings
- Write docs, decision log, limitations
- Record demo and save transcript

**Deliverable:** submission-ready prototype.

---

## 6. Key Technical Decisions to Make Early

### 1. Frontend build tool
Pick **Vite + React + TypeScript** for fast iteration and easy static build output.

### 2. Audio playback pipeline
Choose one playback approach early and keep it simple:
- streamed audio chunks into Web Audio scheduling, or
- MediaSource-like buffering if supported by chosen API path

This matters because lip-sync timing depends on accurate knowledge of actual playback timing.

### 3. Avatar rendering tech
Prefer **SVG-based rendering** first.
Reason: mouth swaps, clean vector art, easy animation, low complexity.
Canvas is still acceptable, but SVG is likely simpler for this avatar style.

### 4. Viseme extraction strategy
Timebox research immediately because it is the riskiest feature.
If two options are viable, choose the one with:
- lower integration complexity
- acceptable latency
- deterministic browser operation

### 5. Metrics model
Define the event schema before implementation to avoid retrofitting measurement later.

---

## 7. Risks and Mitigations

### Risk: in-browser phoneme model is hard to integrate or too slow
**Mitigation**
- Timebox research to an initial spike
- Benchmark 2-3 candidate libraries/models quickly
- Favor “good enough” viseme quality over theoretical accuracy
- Keep the avatar architecture modular so the viseme engine can be swapped

### Risk: actual perceived latency exceeds target despite Realtime API
**Mitigation**
- Keep server out of media path
- Keep prompts short and response style concise
- Avoid extra processing before audio playback
- Start avatar response immediately on first audio chunk

### Risk: tutor becomes lecture-heavy instead of Socratic
**Mitigation**
- Bake strong behavioral constraints into system prompt
- Add test scenarios with wrong/right/uncertain student answers
- Explicitly evaluate “question density” during transcript review

### Risk: lip-sync offset is unstable
**Mitigation**
- Measure actual audio playback timing, not just chunk arrival
- Add viseme smoothing and short lookahead if needed
- Keep animation simple rather than hyper-realistic

### Risk: demo instability
**Mitigation**
- Add clear session states and retry UI
- Test with good mic/network conditions
- Prepare a known-good demo flow/topic before recording

---

## 8. Testing Plan

### Functional testing
- Start session successfully
- Speak and receive tutor response
- Type and receive tutor response
- Switch between speaking and typing during the same session
- Avatar remains visible and responsive
- Overlay toggles and exports JSON

### Pedagogical testing
For each subject sample, verify:
- tutor asks guiding questions
- tutor adapts to correct and incorrect answers
- tutor stays age-appropriate
- tutor covers only 1-3 concepts in a short session

### Latency testing
Measure across multiple runs:
- speech end → first text delta
- first text delta → first audio delta
- first audio delta → first viseme render
- speech end → first avatar response
- total response completion

### Reliability testing
- invalid token retrieval
- network interruption at session start
- missing microphone permission
- empty text submission
- Realtime disconnect during session

---

## 9. Proposed Repository Structure

```text
backend/
  app/
    main.py
    routes/
      realtime.py
    services/
      openai_sessions.py
    config.py
frontend/
  src/
    app/
    components/
      Avatar/
      Overlay/
      SessionControls/
      TextInput/
    lib/
      realtime/
      audio/
      metrics/
      visemes/
    assets/
      avatar/
docs/
  decisions.md
  latency-optimization.md
  limitations.md
  transcript-template.md
README.md
```

---

## 10. Recommended Milestones

### Milestone 1: Working conversation loop
- Backend token endpoint works
- Frontend connects to Realtime
- Voice in / voice out / text in all function

### Milestone 2: Tutor behavior is acceptable
- Prompt reliably produces Socratic questioning
- Dynamic subject handling works

### Milestone 3: Avatar is visibly integrated
- Idle face, blinking, speaking mouth states exist
- Large avatar-first UI is complete

### Milestone 4: Real lip-sync + metrics
- Viseme engine works in browser
- Overlay shows inferred per-stage latency
- JSON export works

### Milestone 5: Demo-ready package
- Docs complete
- Limitations listed
- Demo session recorded successfully

---

## 11. Minimum Viable Demo Scope
If time gets tight, the minimum acceptable implementation should still include:
- direct OpenAI Realtime voice tutoring
- text input support
- warm Socratic prompt behavior
- visible 2D avatar with mouth animation, blink, idle movement
- inferred latency tracking with overlay and export
- setup docs and a recorded demo

Non-essential polish should be deferred before compromising these requirements.

---

## 12. Immediate Next Steps
1. Bootstrap monorepo with `backend/` and `frontend/`
2. Implement FastAPI ephemeral token endpoint
3. Stand up React client and connect to OpenAI Realtime
4. Validate voice input, typed input, and streamed tutor audio
5. Draft and tune the Socratic tutor system prompt
6. Spike viseme model options in browser
7. Add avatar MVP and latency event schema before polish

---

## 13. Definition of Done
The project is done when:
- a user can open the app and start a live tutoring session by voice or text
- the tutor responds with `alloy` voice and a live avatar
- the tutoring style is recognizably Socratic, warm, and adaptive
- the app displays inferred per-stage latency and supports JSON export
- the repo includes README, decision log, limitations, and optimization notes
- a 1-5 minute demo video and annotated transcript can be produced from the working system
