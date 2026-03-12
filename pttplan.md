# Push-to-Talk Technical Implementation Plan

## Goal
Implement hold-to-talk behavior while preserving the existing realtime session model:
- session starts muted by default
- server VAD stays enabled
- desktop uses spacebar hold-to-talk
- mobile uses touch-and-hold on the mute button
- click-to-toggle mute remains available
- current `M` shortcut is removed
- mute button gains tooltip and hold-state visuals, including audio-reactive glow

---

## Current Codebase Assessment

### `frontend/src/App.tsx`
Current responsibilities already include:
- session lifecycle (`startSession`, `stopSession`)
- mute state management via `muted`
- keyboard shortcut handling (`M` key)
- assistant interruption on `input_audio_buffer.speech_started`
- passing control props into `SessionControls`

Implication:
- `App.tsx` is the right place to own hold-to-talk state and global keyboard/window listeners.
- interruption-on-press should be triggered from the new hold-start path, not only from server speech events.

### `frontend/src/components/SessionControls/SessionControls.tsx`
Current responsibilities:
- render Stop button
- render mute toggle button
- handle click-to-toggle only

Implication:
- this component should stay mostly presentational, but it needs extra props for:
  - `holdingToTalk`
  - `micLevel`
  - hold-touch callbacks
  - tooltip visibility / text

### `frontend/src/index.css`
Current styles already include:
- muted button styling via `.muted-active`
- session controls layout

Implication:
- add tooltip, glow, and snap-animation styles here.

### `frontend/src/lib/realtime.ts`
Current responsibilities:
- mic acquisition with `getUserMedia`
- local track enable/disable via `setLocalMicMuted`
- WebRTC / data channel setup
- session update with server VAD

Implication:
- this is the right place to expose mic stream access and analyser lifecycle utilities.
- no turn-detection behavior should change.

---

## Implementation Strategy

## 1. Update mute model in `App.tsx`

### Changes
- Initialize `muted` to `true`.
- Add new UI/control state:
  - `holdingToTalk: boolean`
  - `holdSource: 'keyboard' | 'touch' | null` (recommended to prevent input conflicts and simplify release behavior)
  - `micLevel: number` in range `0..1`
  - `showHoldTooltip: boolean`
  - optionally `tooltipDismissed: boolean` for session-scoped fade behavior

### Why
The app currently treats mute as a simple toggle. Push-to-talk needs a distinction between:
- persistently unmuted via click
- temporarily unmuted via active hold gesture

A separate `holdingToTalk` state avoids overloading `muted` and makes rendering clearer.

---

## 2. Replace `M` key shortcut with spacebar hold logic in `App.tsx`

### Keyboard behavior to implement
On `keydown` for space:
- ignore if not connected
- ignore if `event.repeat`
- ignore if target/focus is within `INPUT` or `TEXTAREA`
- ignore if already persistently unmuted (`muted === false` and not currently in hold mode)
- otherwise:
  - `preventDefault()`
  - if tutor is currently responding, interrupt immediately
  - set `holdingToTalk = true`
  - set `holdSource = 'keyboard'`
  - set `muted = false`
  - start mic-level animation loop

On `keyup` for space:
- only act if `holdSource === 'keyboard'`
- `preventDefault()`
- set `holdingToTalk = false`
- set `holdSource = null`
- set `muted = true`
- stop mic-level animation loop and reset `micLevel` to `0`

### Notes
- Use `e.code === 'Space'` instead of `e.key === ' '` for reliability.
- Add a helper like `isTypingTarget(target: EventTarget | null)` that checks `INPUT`, `TEXTAREA`, and ideally `contenteditable`.
- Keep the listeners on `window` so release is captured even if focus shifts within the page.

---

## 3. Force re-mute on blur / visibility loss

### Events
Add listeners for:
- `window.blur`
- `document.visibilitychange`

### Behavior
If a hold gesture is active:
- immediately end hold mode
- set `muted = true`
- clear `holdingToTalk`
- clear `holdSource`
- stop analyzer loop

### Why
This matches the spec and prevents the mic from remaining open after tab switches or focus loss.

---

## 4. Preserve click-to-toggle behavior

### Existing behavior
The mute button currently flips `muted` on click.

### Required adjustment
Keep click-to-toggle, but make hold-to-talk a no-op while already persistently unmuted.

### Recommended approach
Treat persistent state as derived from `muted` plus hold state:
- if user clicks unmute, `muted` becomes `false`
- key/touch hold start should only run when `muted === true`
- key/touch release should only re-mute if that hold gesture was the thing that unmuted the mic

This is why `holdSource` is useful: it prevents accidental re-muting after a persistent click-unmute.

---

## 5. Interrupt assistant immediately when hold begins

### Current behavior
Assistant interruption currently happens when the server emits `input_audio_buffer.speech_started` while the tutor is speaking.

### New requirement
If the tutor is mid-response and the user presses space or touches-and-holds the button, interruption should happen immediately on press, before speech is detected.

### Implementation
Create a helper in `App.tsx`, e.g. `beginHoldToTalk(source)`:
- guard against disconnected state
- guard against already persistently unmuted
- if assistant is speaking or a streamed assistant message is active:
  - call `interruptAssistantMessage()`
- set hold state
- unmute mic
- start analyzer loop

Use the same helper for both keyboard and touch start so behavior stays consistent.

---

## 6. Add mobile touch-and-hold support in `SessionControls.tsx`

### New props for `SessionControls`
Recommended props:
- `holdingToTalk: boolean`
- `micLevel: number`
- `tooltipText: string`
- `showTooltip: boolean`
- `onHoldStart: (source: 'touch') => void`
- `onHoldEnd: (source: 'touch') => void`
- existing `onToggleMute`

### Touch behavior on the mute button
Add:
- `onTouchStart`
- `onTouchEnd`
- `onTouchCancel`

Behavior:
- `touchstart`: `preventDefault()`, start hold immediately
- `touchend` / `touchcancel`: `preventDefault()`, end hold immediately

### Important interaction detail
Prevent the touch hold gesture from also triggering the click toggle.

Recommended pattern:
- track a short-lived flag such as `ignoreNextClickRef`
- when a touch hold starts, mark the next click as suppressed
- in `onClick`, if suppression flag is set, clear it and return without toggling

This avoids accidental persistent toggle after a long press.

---

## 7. Add tooltip behavior in `SessionControls.tsx`

### Tooltip text
- desktop: `Hold space to talk`
- mobile/touch-capable: `Hold button to talk`

### Detection
Use a simple touch heuristic in the client, e.g.:
- `'ontouchstart' in window`
- optionally `navigator.maxTouchPoints > 0`

### Show/hide behavior
In `App.tsx` or `SessionControls.tsx`:
- after session reaches `connected`, start a timer for ~1–2 seconds
- then show tooltip
- auto-hide after a few seconds
- after auto-hide, allow reappearance on button hover/focus

### Recommended ownership
- `App.tsx` should own session-timed initial visibility because it knows when connection completes.
- `SessionControls.tsx` can own hover/focus-triggered redisplay because it owns the button.

A simple model:
- `tooltipPhase: 'hidden' | 'auto' | 'dismissed' | 'interactive'`
- or simpler boolean state plus local hover/focus overrides

---

## 8. Add hold visual states in `SessionControls.tsx` and `index.css`

### New visual states
1. **Muted default**
   - keep existing `.muted-active` treatment

2. **Hold active**
   - add class like `.hold-active`
   - show blue/green glow
   - optionally change label to `Listening...`

3. **Persistently unmuted**
   - keep existing unmuted styling
   - do not show reactive glow

### Suggested class logic
For the mute button:
- `muted-active` when `muted && !holdingToTalk`
- `hold-active` when `holdingToTalk`
- plain secondary button when persistently unmuted

### Snap animation
Trigger a one-shot class on hold start, e.g. `hold-snap`.
Possible implementation options:
- incrementing `snapKey` prop that remounts a wrapper/class
- transient boolean state that is set on hold start and cleared after animation frame / timeout

A transient class toggled from `App.tsx` is simplest.

---

## 9. Add local mic analyser support in `frontend/src/lib/realtime.ts`

### Goal
Read local microphone amplitude for the hold glow without affecting audio transmission.

### Recommended API additions
Add fields to `RealtimeClient`:
- `private analyserContext?: AudioContext`
- `private analyserNode?: AnalyserNode`
- `private analyserSource?: MediaStreamAudioSourceNode`
- maybe `private analyserData?: Uint8Array`

Add methods such as:
- `getLocalStream(): MediaStream | undefined`
- `setupLocalAnalyser(): void`
- `readLocalMicLevel(): number`
- `teardownLocalAnalyser(): void`

### Setup timing
Create the analyser once the local stream exists during `connect()`.
- after `getUserMedia` resolves and `this.localStream` is assigned, initialize analyser resources
- do not connect to `audioContext.destination`

### Level calculation
Use either:
- `getByteTimeDomainData()` and compute RMS, or
- `getByteFrequencyData()` and compute average energy

RMS on time-domain data is preferable for a stable speaking intensity metric.

Suggested normalization:
- compute RMS from centered byte samples
- normalize to `0..1`
- apply a small floor clamp and smoothing in the UI loop if needed

### Cleanup
Call `teardownLocalAnalyser()` from `disconnect()`.

---

## 10. Drive mic glow from an animation loop in `App.tsx`

### Behavior
Only run the mic-level sampling loop while hold-to-talk is active.

### Implementation
In `App.tsx`:
- create `micLevelRafRef`
- on hold start, begin `requestAnimationFrame` loop
- each frame, call `realtimeRef.current.readLocalMicLevel()` and update `micLevel`
- on hold end, cancel the loop and reset `micLevel = 0`

### Why not run always?
The spec says sampling only needs to happen while space is held, and that minimizes unnecessary work.

### Smoothing recommendation
To avoid jitter, smooth values in JS before setting state, e.g.:
- `next = Math.max(raw, previous * 0.82)` for responsive decay
- or throttle React state updates if necessary

Alternative:
- write level to a CSS custom property on a ref instead of using React state every frame

Given current structure, a numeric prop is acceptable initially, but direct style updates may be more efficient if re-render cost becomes noticeable.

---

## 11. Pass hold and mic-level state into `SessionControls`

### Prop additions from `App.tsx`
Pass:
- `holdingToTalk={holdingToTalk}`
- `micLevel={micLevel}`
- `showTooltip={showTooltip}`
- `tooltipText={isTouchDevice ? 'Hold button to talk' : 'Hold space to talk'}`
- `onHoldStart={...}`
- `onHoldEnd={...}`

### Styling hook
Set CSS custom property on the mute button or wrapper:
- `style={{ '--mic-level': micLevel } as React.CSSProperties }`

This lets CSS scale glow intensity without embedding animation math in component logic.

---

## 12. CSS additions in `frontend/src/index.css`

### Add tooltip styles
Add classes such as:
- `.mute-button-wrapper`
- `.speech-bubble-tooltip`
- `.speech-bubble-tooltip.visible`
- `.speech-bubble-tooltip::after` for tail/arrow

Behavior to support:
- positioned above button
- fade in/out
- pointer-safe and unobtrusive

### Add hold-active styles
Add `.hold-active` with:
- blue/green tint
- animated shadow / scale using `--mic-level`
- transition between muted/unmuted/hold states

Example concept:
- box-shadow radius/intensity based on `calc(12px + var(--mic-level, 0) * 22px)`
- subtle scale based on `calc(1 + var(--mic-level, 0) * 0.02)`

### Add snap animation
Create keyframes like:
- `@keyframes hold-snap`

Apply on first press only, not continuously.

### Accessibility / motion
Add `prefers-reduced-motion` handling to soften or disable pulse/snap animation.

---

## 13. Accessibility and UX details

### ARIA labels
Update mute button labels to remove `M` references.

Suggested labels:
- muted: `Unmute microphone`
- persistently unmuted: `Mute microphone`
- hold active: `Mute microphone` or `Listening, release to mute microphone`

### Keyboard focus
Ensure space hold-to-talk does not interfere with focused text inputs.
Also ensure tooltip reappears on button focus for keyboard users.

### Touch UX
Long-press should feel immediate; no threshold is required.

### Reduced motion
Glows and snap effects should degrade gracefully for users who prefer reduced motion.

---

## 14. Edge cases to explicitly handle

1. **Repeated keydown while holding**
   - ignore `event.repeat`

2. **Space pressed while already persistently unmuted**
   - no-op

3. **Touch hold while persistently unmuted**
   - no-op

4. **Window blur during hold**
   - force mute immediately

5. **Visibility change during hold**
   - force mute immediately

6. **Session stops while holding**
   - clear hold state, cancel rAF, reset level

7. **Reconnect / new session**
   - tooltip timers reset per session
   - mute should return to default `true`

8. **Touch gesture causing synthetic click**
   - suppress click toggle after hold gesture

9. **Analyzer unavailable or AudioContext creation fails**
   - fail gracefully; hold-to-talk still works without glow

---

## 15. Proposed file-by-file work plan

### `frontend/src/App.tsx`
1. Change `const [muted, setMuted] = useState(false);` to `useState(true);`
2. Add state/refs for:
   - `holdingToTalk`
   - `holdSource`
   - `micLevel`
   - tooltip timers/visibility
   - rAF id
3. Remove `M` keyboard shortcut effect
4. Add helpers:
   - `isTypingTarget()`
   - `beginHoldToTalk(source)`
   - `endHoldToTalk(source?)`
   - `startMicLevelLoop()`
   - `stopMicLevelLoop()`
5. Add `keydown` / `keyup` listeners for space
6. Add `blur` / `visibilitychange` listeners
7. Ensure `stopSession()` clears all hold-related state
8. Pass new props into `SessionControls`

### `frontend/src/components/SessionControls/SessionControls.tsx`
1. Expand props for hold state, tooltip, and touch handlers
2. Wrap mute button in a positioned container for tooltip
3. Add touch handlers
4. Suppress click after touch hold
5. Apply `hold-active` / `muted-active` / snap classes
6. Bind `--mic-level` style variable
7. Update aria labels and visible labels

### `frontend/src/index.css`
1. Add tooltip container and bubble styles
2. Add fade/pulse/snap keyframes
3. Add `.hold-active` styles using `--mic-level`
4. Add hover/focus tooltip reveal styles if desired
5. Add `prefers-reduced-motion` adjustments

### `frontend/src/lib/realtime.ts`
1. Add analyser-related fields
2. Initialize analyser after mic stream is acquired
3. Add `readLocalMicLevel()` helper
4. Add analyser cleanup in `disconnect()`
5. Keep server VAD config unchanged

---

## 16. Testing plan

### Manual desktop tests
1. Start session
   - mic starts muted
   - button shows muted styling
2. Press and hold space
   - mic unmutes immediately
   - assistant interrupts immediately if speaking
   - button enters listening/glow state
3. Release space
   - mic mutes immediately
   - glow stops immediately
4. Hold space while focused in chat input
   - should type spaces only
   - should not unmute
5. Click to unmute persistently
   - space does nothing
6. Click to mute again
   - space hold resumes working
7. Hold space, then alt-tab / blur window
   - mic re-mutes immediately

### Manual mobile/touch tests
1. Tap mute button
   - toggles persistently
2. Touch-and-hold button while muted
   - unmutes immediately
   - no click toggle occurs on release
3. Release / cancel touch
   - re-mutes immediately
4. Persistently unmute, then touch-and-hold
   - no-op

### Tooltip tests
1. Connect session
   - tooltip appears after delay
   - auto-fades
2. Hover or focus mute button after fade
   - tooltip reappears
3. Mobile device
   - tooltip text changes to `Hold button to talk`

### Analyzer tests
1. During hold, speak louder/softer
   - glow intensity changes
2. Release hold
   - glow and rAF stop
3. Disconnect session
   - no lingering audio context or animation loop

---

## 17. Risks / implementation cautions

### 1. React re-render frequency from mic level
Updating React state every animation frame may be acceptable for this UI, but if it causes churn, move `--mic-level` updates to a DOM ref instead.

### 2. Touch vs click interaction
Mobile browsers often synthesize click after touchend. Explicit suppression is necessary or long-press will accidentally toggle persistent mute.

### 3. AudioContext policies
Some browsers are strict about audio context lifecycle. Since analysis uses the mic stream and not playback, this should generally work, but failures should degrade gracefully.

### 4. Hold-state ownership
Do not infer hold state only from `muted === false`; persistent unmute and temporary hold are different states and need separate tracking.

---

## Recommended implementation order

1. Change default mute to `true`
2. Remove `M` shortcut
3. Implement desktop spacebar hold start/end
4. Add blur/visibility forced remute
5. Add immediate interrupt on hold start
6. Add touch-and-hold with click suppression
7. Add tooltip behavior
8. Add analyser + mic-level loop
9. Add glow/snap styling
10. Run manual desktop/mobile verification

---

## Definition of done
The feature is complete when:
- sessions always begin muted
- holding space temporarily unmutes only while held
- touch-and-hold does the same on mobile
- releasing always re-mutes immediately
- persistent click-toggle still works
- `M` shortcut is gone
- blur/tab-switch during hold force re-mutes
- assistant interrupts immediately on hold start
- tooltip appears and fades per session behavior
- hold state shows audio-reactive glow
- analyser and timers clean up correctly on disconnect
