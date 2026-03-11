# Submission Notes

## Thesis

This project is a lightweight realtime AI tutor designed for short, situational moments when a student gets stuck and needs help resuming progress. It is intentionally optimized for responsiveness, simplicity, and deployability rather than photorealistic avatar rendering or heavyweight orchestration.

The system demonstrates a practical proof of concept for low-latency Socratic tutoring with a video-presence avatar. The architecture keeps the live media path thin, uses OpenAI Realtime over WebRTC, and couples voice interaction with an expressive 2D avatar to preserve conversational presence while keeping complexity and infrastructure costs low.

## What this project is intended to demonstrate

- A simple realtime tutoring architecture that can be deployed without routing media through a custom backend
- A supportive Socratic tutoring loop for students in grades 6-12
- A video-presence tutor experience using a lightweight animated avatar
- A design that can fit as a feature inside a larger guided-practice or homework-help product
- Evaluation hooks for responsiveness, conversation quality, and Socratic behavior

## What this project is not claiming

This project does **not** claim to be:

- a photorealistic talking-head avatar system
- a phoneme-accurate lip-sync implementation
- a fully production-hardened tutoring platform
- a deeply personalized long-term learner model
- a fully observable multi-stage STT/LLM/TTS benchmark rig

Instead, it should be read as a practical prototype that prioritizes student-perceived responsiveness and a scalable implementation shape.

## Problem framing

The product target is the moment when a student is stuck on a problem and needs a quick, supportive intervention rather than a long-form lesson. In that moment, the key UX goals are:

- fast turn-taking
- low-friction voice interaction
- a tutor that feels present rather than chatbot-like
- short, supportive responses that keep the student thinking

That framing guided both the architecture and the avatar decisions.

## Chosen educational scope

The current demo scope focuses on two concepts:

- **Linear equations**
- **Molecular structure**

These were chosen because they are common sticking points for students and are well suited to Socratic questioning. Each can be taught through short chains of guided questions rather than long explanations.

The implementation is aimed at the broader **grades 6-12** range specified in the challenge, while the tutor instructions attempt to adapt tone and wording to the student level provided at session creation.

## Pedagogical approach

The tutor is designed to be:

- supportive rather than critical
- encouraging in tone
- short in each spoken turn
- redirective when the student is wrong
- willing to give hints when the student is drifting too far off track
- playful when the student becomes non-cooperative

The goal is not just correctness. A successful tutoring turn is one in which the student feels supported and is nudged back into the reasoning process.

## Video avatar position

This project takes a **video-presence** interpretation of the video requirement rather than pursuing a photorealistic talking head.

The avatar approach is deliberate:

- Third-party avatar platforms were rejected due to additional cost and weaker scaling economics.
- A 3D avatar was rejected because of uncanny-valley concerns.
- A custom 2D avatar was chosen to maintain presence, keep rendering lightweight, and avoid adding extra network or inference hops.

The result is an expressive SVG-based avatar with speaking state, animated body motion, viseme-driven mouth states, blinking, and subtle reactive motion. The design goal is to make the tutor feel present and attentive without sacrificing responsiveness.

## Latency framing

This system uses a **collapsed realtime pipeline** through OpenAI Realtime. That means speech recognition, language generation, and speech synthesis are not exposed as separate internal stages in the application.

Because of that architectural choice, the documentation emphasizes **user-perceived latency** and **boundary latency** rather than claiming full internal per-stage timing for STT, LLM, and TTS.

The primary trusted user-visible checkpoint is:

- **time to first avatar-speaking frame**

This is the moment at which the student first perceives the tutor as responding. For this architecture, that is the most meaningful latency boundary because it combines model turnaround, audio delivery, and client rendering into a single perceptual milestone.

## Evaluation approach

The repo includes evaluation support for:

- connection timing
- time to first frame / first audio
- response latency from speech end to tutor response start
- connection reliability
- Socratic-method behavior
- conversation quality and adaptation

These evaluations are meant to answer two questions:

1. Does the interaction feel responsive enough to sustain conversation?
2. Does the tutor continue to guide instead of lecture?

## Architecture summary

High-level flow:

1. Browser requests a session from the FastAPI backend.
2. Backend creates an ephemeral OpenAI Realtime session.
3. Browser connects directly to OpenAI Realtime over WebRTC.
4. Tutor audio returns directly to the browser.
5. Frontend renders transcript updates, controls the session UI, and drives the 2D avatar.
6. Evaluation events are logged separately for later analysis.

This keeps the custom backend out of the live media path and reduces avoidable latency.

## Scaling position

The intended scaling story is not "replace an entire tutoring platform," but rather "embed a short-form realtime help feature inside guided practice."

That matters because the likely usage pattern is many short sessions rather than long, continuous tutoring calls. Within that product shape, the backend remains operationally simple because it primarily handles session setup and log ingestion, while the main scaling constraints become:

- OpenAI realtime usage cost
- vendor rate limits / concurrency ceilings
- any future need for more durable analytics or user state

If this moved beyond prototype usage, the next operational step would be to request higher provider rate limits where needed and investigate a queuing strategy for connection initialization during spikes in demand.

## Known limitations

Current limitations that should be read plainly:

- Avatar animation is lightweight and expressive, but not phoneme-accurate lip sync.
- Internal STT/LLM/TTS stage timings are not directly observable through the collapsed realtime API.
- There is no persistent learner profile or cross-session memory.
- There are currently no visual teaching aids or diagrams.
- The concept scope is intentionally narrow for a prototype.
- Production-scale deployment would require more work around provider rate limits, connection-initialization strategy, and logging overhead.

## Recommended reviewer interpretation

The strongest way to evaluate this project is as a **fast, lightweight realtime tutoring prototype** that pairs direct WebRTC media with a minimal backend and an expressive low-cost avatar. Its main contribution is the combination of:

- low-friction architecture
- conversational responsiveness
- supportive Socratic prompting
- a scalable avatar strategy that favors presence over realism
