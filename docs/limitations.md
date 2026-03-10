# Known Limitations

- The avatar mouth animation is driven by a lightweight audio analyzer, not a phoneme or viseme ML model.
- Lip sync is approximate rather than phoneme-accurate.
- The app uses WebRTC for the browser Realtime connection; there is no alternate transport implementation in this repo.
- The backend does not store transcripts, session history, or user data.
- The metrics overlay reports inferred timings, not fully isolated per-stage measurements.
- There is no reconnect flow or session persistence if a live session drops.
- Error handling is basic and focused on prototype use.
- Browser autoplay and microphone permission rules can affect startup behavior.
- The tutor quality depends heavily on prompt behavior and model responses; it is not backed by a separate pedagogy engine.
- Typed input is available only while a live session is active.
- The app currently defaults to English unless the student explicitly asks for another language.
- The health endpoint is operational only; it is not a full readiness or dependency check.
