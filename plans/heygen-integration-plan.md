# Plan: Replace Local SVG Avatar with HeyGen

## Goal
Swap the current local SVG avatar for a HeyGen-hosted talking avatar while keeping OpenAI Realtime as the conversational brain.

## Recommended first architecture
Use:
- **OpenAI Realtime** for mic input, turn handling, and assistant text generation
- **HeyGen** for avatar rendering, speech, and playback

This means the first HeyGen prototype should be **text-driven**, not audio-stream-driven.

## Why this approach
- Fastest path to a usable prototype
- Avoids trying to bridge OpenAI live audio into a second realtime avatar stack
- Lets us keep most of the current app structure
- Makes cost easier to control by dropping OpenAI assistant audio output

---

## Current app touchpoints
Relevant files:
- `frontend/src/App.tsx`
- `frontend/src/lib/realtime.ts`
- `frontend/src/components/Avatar/Avatar.tsx`
- `frontend/src/lib/audio.ts`
- `backend/app/main.py`
- `backend/app/routes/realtime.py`
- `backend/app/config.py`

Current flow:
1. Frontend creates OpenAI Realtime session via backend
2. Frontend connects directly to OpenAI Realtime over WebRTC
3. Assistant audio comes back as a remote audio track
4. `StreamingVisemeEngine` analyzes audio to animate the SVG avatar

Target flow:
1. Frontend creates OpenAI Realtime session via backend
2. Frontend connects directly to OpenAI Realtime
3. OpenAI returns **text only** for assistant responses
4. Frontend sends completed assistant utterances to backend
5. Backend creates/forwards a HeyGen session request
6. Frontend renders the HeyGen avatar instead of the SVG

---

## Scope for V1
### In scope
- Replace the SVG hero avatar with a HeyGen-backed avatar panel
- Keep the existing transcript/messages UI
- Keep OpenAI Realtime for session logic and user input
- Switch OpenAI responses to text-only for assistant output
- Trigger HeyGen after each completed assistant turn
- Add minimal connection and error handling for HeyGen

### Out of scope for V1
- Streaming partial `response.text.delta` into HeyGen
- Feeding OpenAI live audio into HeyGen
- Perfect interruption / barge-in handling
- Custom HeyGen avatars
- Fallback local avatar behavior beyond a simple placeholder state

---

## Proposed implementation phases

## Phase 1 — HeyGen feasibility and API contract
### Tasks
- Confirm which HeyGen product is available on the account:
  - generated videos only
  - streaming avatar / interactive avatar
  - browser SDK availability
- Confirm auth model:
  - API key on backend only
  - session token for frontend
- Confirm what frontend receives:
  - embeddable stream
  - SDK session object
  - iframe/embed URL
- Confirm expected request model:
  - text to speak
  - avatar ID
  - voice ID
  - language options

### Deliverable
A short API contract doc covering:
- backend request/response shapes
- frontend session lifecycle
- required env vars

### Exit criteria
We know exactly how to start a HeyGen avatar session from our backend and render it in the frontend.

---

## Phase 2 — Backend HeyGen proxy
### Files to add
- `backend/app/routes/heygen.py`
- `backend/app/services/heygen.py`

### Files to update
- `backend/app/main.py`
- `backend/app/config.py`

### Proposed backend responsibilities
- Hold the HeyGen API key server-side
- Create/init a HeyGen avatar session
- Accept assistant text from frontend and forward it to HeyGen
- Return any frontend-safe session metadata/token

### Proposed endpoints
- `POST /api/heygen/session`
  - creates or initializes a frontend-consumable HeyGen session
- `POST /api/heygen/speak`
  - accepts one finalized assistant utterance
  - forwards text to HeyGen
- `POST /api/heygen/stop` *(optional)*
  - stops current avatar speech/session

### Config additions
Add env vars in `backend/app/config.py` for:
- `HEYGEN_API_KEY`
- `HEYGEN_AVATAR_ID`
- `HEYGEN_VOICE_ID` *(if needed)*
- optional `HEYGEN_BASE_URL`

### Exit criteria
Backend can create a HeyGen session and trigger avatar speech using hardcoded test text.

---

## Phase 3 — Frontend HeyGen avatar component
### Files to add
- `frontend/src/components/HeyGenAvatar/HeyGenAvatar.tsx`
- `frontend/src/lib/heygen.ts`

### Files to update
- `frontend/src/App.tsx`
- `frontend/src/index.css`

### Component responsibilities
`HeyGenAvatar` should:
- initialize the frontend HeyGen session when the tutoring session starts
- render the avatar container/player/SDK mount point
- expose simple status states:
  - idle
  - connecting
  - listening
  - speaking
  - error
- clean up the HeyGen session on disconnect

### UI behavior
- Replace `<Avatar viseme={viseme} speaking={speaking} />` with `<HeyGenAvatar ... />`
- Keep the hero layout mostly unchanged
- Show fallback status text while the avatar session connects

### Exit criteria
The app can display a HeyGen avatar in the hero panel and play a manually triggered greeting.

---

## Phase 4 — Rewire OpenAI output for text-driven avatar playback
### Files to update
- `frontend/src/lib/realtime.ts`
- `frontend/src/App.tsx`

### Changes
#### 1. Stop requesting OpenAI assistant audio
In `frontend/src/lib/realtime.ts`, change:
- from `modalities: ['audio', 'text']`
- to `modalities: ['text']`

#### 2. Stop using remote audio for avatar lip-sync
Current flow uses:
- `handleRemoteAudio(...)`
- `StreamingVisemeEngine`
- `viseme` / `speaking` state for the SVG

For V1, remove avatar dependence on those pieces.

#### 3. Accumulate finalized assistant utterances
Use existing Realtime events:
- `response.text.delta`
- `response.done`

Behavior:
- continue appending assistant text to the transcript
- once a turn completes, send the finalized text to `POST /api/heygen/speak`

### State changes in `App.tsx`
Add HeyGen-specific state such as:
- `heygenReady`
- `heygenSpeaking`
- `heygenError`

Potentially remove or stop using:
- `viseme`
- local SVG speaking state
- remote audio analysis path for the main avatar panel

### Exit criteria
A normal tutoring response appears in transcript and is spoken by HeyGen after `response.done`.

---

## Phase 5 — Session lifecycle and UX polish
### Tasks
- Start HeyGen session when OpenAI session starts
- Stop HeyGen session when tutoring session stops
- Prevent overlapping avatar speeches
- Add simple speaking/listening labels
- Add loading and retry states
- Add a timeout/error banner if HeyGen is unavailable

### Recommended first behavior
- Wait for complete assistant response
- Send one clean utterance to HeyGen
- Disable incremental speech in V1

### Exit criteria
The app feels stable for repeated short back-and-forth conversation turns.

---

## Phase 6 — Cleanup and de-scope old SVG path
### Candidate files for cleanup after V1 works
- `frontend/src/components/Avatar/Avatar.tsx`
- `frontend/src/lib/audio.ts`

### Recommendation
Do **not** delete them immediately.
Keep the old local avatar path behind a feature flag or as a fallback until HeyGen proves reliable.

Example feature flag:
- `VITE_AVATAR_MODE=svg|heygen`

### Exit criteria
We can switch between local SVG avatar and HeyGen without risky rewrites.

---

## Suggested file-level change list

### Backend
#### Add
- `backend/app/routes/heygen.py`
- `backend/app/services/heygen.py`

#### Update
- `backend/app/main.py` to register HeyGen router
- `backend/app/config.py` to add HeyGen env config

### Frontend
#### Add
- `frontend/src/components/HeyGenAvatar/HeyGenAvatar.tsx`
- `frontend/src/lib/heygen.ts`

#### Update
- `frontend/src/App.tsx`
- `frontend/src/lib/realtime.ts`
- `frontend/src/index.css`

#### Keep for fallback initially
- `frontend/src/components/Avatar/Avatar.tsx`
- `frontend/src/lib/audio.ts`

---

## Risks and mitigations

### Risk 1 — HeyGen plan does not include required streaming/avatar API
**Mitigation:** validate account capability before implementation.

### Risk 2 — Latency is too high if we wait for full `response.done`
**Mitigation:** ship V1 this way first, then test sentence-based chunking later.

### Risk 3 — OpenAI and HeyGen produce overlapping audio paths
**Mitigation:** switch OpenAI assistant response modality to text-only.

### Risk 4 — HeyGen frontend integration requires SDK-specific lifecycle handling
**Mitigation:** isolate all vendor-specific code inside `frontend/src/lib/heygen.ts` and `HeyGenAvatar.tsx`.

### Risk 5 — Hard to debug multi-service failures
**Mitigation:** add explicit frontend and backend logs for:
- session created
- session attached
- speak request sent
- speak request completed
- avatar error

---

## Acceptance criteria for the HeyGen prototype
- User can start a tutoring session from the current UI
- OpenAI Realtime still handles the conversation loop
- Assistant transcript text still appears in the messages panel
- Hero avatar panel renders HeyGen instead of the SVG
- After each assistant turn completes, HeyGen speaks the response
- Stopping the session tears down both OpenAI and HeyGen state cleanly

---

## Nice-to-have follow-ups after V1
- Sentence-based chunking instead of waiting for full `response.done`
- Interruption support when the user starts talking mid-response
- Feature flag between local SVG and HeyGen
- Better loading skeleton in hero panel
- Avatar/voice selector UI
- Metrics for text-finished to avatar-start latency

---

## Recommended implementation order
1. Validate HeyGen product/API access
2. Add backend HeyGen service + session endpoint
3. Render a hardcoded HeyGen avatar in the hero panel
4. Change OpenAI responses to text-only
5. Trigger HeyGen speech on completed assistant turns
6. Add cleanup, retries, and fallback behavior

---

## Definition of done
This plan is complete when the current app can run a short tutoring conversation where:
- OpenAI Realtime handles the conversational logic
- HeyGen visually replaces the SVG avatar
- the assistant response is shown as text and spoken by HeyGen
- the session is stable enough for a short demo recording
