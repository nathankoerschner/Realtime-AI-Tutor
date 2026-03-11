# Decision Log

## 1. Use OpenAI Realtime as the core tutoring pipeline

**Decision**

Use OpenAI Realtime for the live tutoring interaction instead of building the production prototype around separate self-hosted STT, LLM, and TTS components.

**Why**

- reduces integration complexity
- supports direct realtime media interaction
- fits the goal of fast conversational tutoring
- lowers the amount of custom orchestration needed for the prototype

**Tradeoff**

- less internal observability into per-stage timing
- more dependence on a managed vendor pipeline

## 2. Keep the backend out of the live media path

**Decision**

Use the backend only for session bootstrap, static serving, and evaluation ingestion.

**Why**

- avoids extra latency from relaying live media
- keeps the architecture operationally simpler
- reduces custom infrastructure in the most latency-sensitive path

**Tradeoff**

- backend has less control over the live session once established

## 3. Use browser-to-provider WebRTC

**Decision**

Connect the browser directly to OpenAI Realtime over WebRTC.

**Why**

- WebRTC is a natural fit for live audio
- supports low-latency transport
- keeps the client interaction model close to real-time media expectations

**Tradeoff**

- more session behavior depends on provider semantics and browser media behavior

## 4. Use a lightweight 2D avatar

**Decision**

Use a custom expressive 2D avatar instead of a 3D avatar or third-party avatar service.

**Why**

- avoids uncanny-valley risk from 3D approaches
- avoids the additional cost and dependency of third-party avatar services
- keeps rendering lightweight
- better supports the project's speed-and-scale priorities

**Tradeoff**

- lower realism than a heavier avatar stack
- no phoneme-accurate lip sync in the current build

## 5. Optimize for presence over realism

**Decision**

Design the tutor avatar to feel present and alive rather than trying to be human-realistic.

**Why**

- presence is enough for short support interactions
- realism would increase cost and complexity without guaranteeing a better tutoring outcome
- lightweight motion, speaking state, and visual engagement cues are sufficient for the product direction being tested

**Tradeoff**

- some reviewers may prefer a more literal interpretation of "video avatar"

## 6. Use Socratic prompts with short spoken turns

**Decision**

Configure the tutor to guide through questions, keep turns brief, and redirect supportively rather than lecture.

**Why**

- aligns with the project brief
- fits voice interaction better than long explanations
- helps students stay active in the reasoning loop

**Tradeoff**

- some students may occasionally want more direct answers or deeper exposition

## 7. Measure boundary latency rather than pretend to measure internal stage timing

**Decision**

Document user-perceived and boundary latency instead of claiming full internal STT/LLM/TTS stage timing.

**Why**

- OpenAI Realtime collapses multiple stages behind one managed interface
- boundary metrics are the most honest and reproducible timings available from the app
- the first user-visible response moment is the metric that matters most to perceived responsiveness

**Tradeoff**

- less diagnostic detail than a composable pipeline benchmark

## 8. Keep the product scope intentionally narrow

**Decision**

Focus the prototype on short, situational tutoring interactions around a small number of concepts.

**Why**

- keeps the demo focused
- matches the intended use case of helping a student get unstuck
- makes the system easier to evaluate as a prototype

**Tradeoff**

- does not yet demonstrate broad curriculum coverage or long-term learner adaptation
