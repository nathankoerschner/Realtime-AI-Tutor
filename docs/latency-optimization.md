# Latency Optimization Strategy

## Server
- Backend only issues session tokens and serves static assets.
- No backend audio proxying.

## Prompting
- Tutor instructions emphasize short conversational turns.
- Socratic behavior is encouraged with concise follow-up questions instead of long lectures.

## Realtime path
- Direct OpenAI Realtime session from the browser.
- WebRTC chosen to reduce client-side media plumbing.
- Server VAD enabled to trigger responses quickly after speech stops.

## Avatar path
- Avatar begins animating on the first detected non-silent remote audio frame.
- Metrics capture first audio delta and first avatar frame separately.

## Measurement
- Speech end inferred from `input_audio_buffer.speech_stopped`.
- First text and audio timings come from Realtime events.
- First avatar timing is local render/audio-analysis time.
