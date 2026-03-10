# Latency Optimization Strategy

This app minimizes latency by keeping the live media path as short as possible and by starting UI feedback quickly.

## 1. Architecture

- The backend only creates Realtime sessions and serves static assets.
- The browser connects directly to OpenAI Realtime.
- The backend does not proxy microphone audio or tutor audio.

This is the main latency win in the current design.

## 2. Browser transport

- The frontend uses **WebRTC** for live audio transport.
- WebRTC keeps browser media handling straightforward and avoids extra custom audio plumbing in the app server.

## 3. Turn detection

The backend requests OpenAI Realtime sessions with `server_vad` turn detection:

- `threshold: 0.5`
- `prefix_padding_ms: 300`
- `silence_duration_ms: 450`
- `create_response: true`
- `interrupt_response: true`

This helps the tutor respond soon after the student stops speaking.

## 4. Prompting

Tutor instructions are intentionally concise:

- short guiding questions
- low-lecture style
- warm conversational phrasing

Shorter answers usually improve perceived responsiveness.

## 5. Avatar responsiveness

The avatar does not wait for full response completion.

Instead it:

- analyzes the remote audio stream continuously
- marks the first speaking frame locally
- updates mouth state as audio energy changes

That lets the UI react as soon as speech is detected in the returned stream.

## 6. Metrics model

The current app tracks:

- `speechStoppedAt`
- `firstTextDeltaAt`
- `firstAudioDeltaAt`
- `firstAvatarAt`
- `completedAt`

From these it derives:

- STT approximation
- TTS first-byte approximation
- avatar render delay
- end-to-end first-frame latency
- total response time
- estimated lip-sync offset

## 7. Important caveat

These metrics are **approximations**, not isolated ground-truth timings for every internal stage of the OpenAI pipeline. They are still useful for comparing turns and spotting regressions in the app.
