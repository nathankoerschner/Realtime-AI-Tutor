# Decision Log

## 1. Direct Realtime connection from the browser
The backend only creates OpenAI Realtime sessions. Audio does not flow through the server, which preserves latency.

## 2. WebRTC for browser media transport
The plan called out a direct realtime client. This implementation uses WebRTC rather than a raw WebSocket media path because browser mic capture and remote audio playback are much simpler and lower risk for a demo.

## 3. SVG avatar first
The avatar is intentionally stylized and minimal. SVG keeps mouth states and layout simple.

## 4. Client-side inferred latency tracking
Per-stage numbers are inferred from Realtime events and local render timing instead of a synthetic benchmark harness.

## 5. Pluggable viseme engine
A dedicated audio/viseme layer was introduced so a real browser phoneme model can replace the starter analyzer without rewriting the UI.
