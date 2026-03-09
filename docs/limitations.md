# Known Limitations

- The included viseme engine is a streaming browser analyzer and mouth-state mapper, not yet a true phoneme classifier model.
- The app uses WebRTC for the browser Realtime path rather than a raw WebSocket transport.
- There is no reconnect flow, session persistence, or advanced recovery for demo interruptions.
- Educational quality assessment is limited to visible transcript output; a full annotated transcript workflow is still manual.
- Browser audio policies may require a user gesture before remote audio playback starts.
- Event shapes in the OpenAI Realtime API can evolve; small adapter updates may be needed.
