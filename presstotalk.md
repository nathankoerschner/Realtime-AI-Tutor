# Hold-to-Talk (Push-to-Talk) Specification

## Overview

The session starts with the microphone **default-muted**. Users unmute by holding the spacebar (desktop) or long-pressing the mute button (mobile). Releasing re-mutes. A speech bubble tooltip above the mute button guides discoverability.

---

## Core Behavior

### Default Mute State
- `muted` initializes to `true` instead of `false`.
- Microphone permission is still requested on session connect (via `getUserMedia` in `RealtimeClient.connect`). The audio track is immediately disabled (`track.enabled = false`).
- Server-side VAD remains active at all times — no switch to manual turn handling. The server still decides end-of-turn based on silence detection, even while space is held.

### Hold-to-Talk (Desktop — Spacebar)
- **keydown (space)**: If `muted === true` and the session is connected, set muted to `false` (enable audio track). Only fires when focus is NOT in an `INPUT` or `TEXTAREA` element.
- **keyup (space)**: Set muted back to `true` (disable audio track). Cut immediately on release — no flush delay.
- Ignore key repeat events (`event.repeat === true`).
- If the tutor is mid-response when space is pressed, **immediately interrupt** the assistant (same as current speech_started interruption behavior).

### Hold-to-Talk (Mobile — Touch)
- The mute button becomes a **touch-and-hold** target on mobile.
- **touchstart**: Unmute immediately (no delay threshold).
- **touchend / touchcancel**: Re-mute immediately.
- Prevent default to avoid click/toggle firing on the same gesture.

### Click-to-Toggle (Coexists)
- The mute button retains its **click-to-toggle** behavior for persistent unmute/mute.
- If the user clicks to persistently unmute, **spacebar hold-to-talk becomes a no-op** while already unmuted.
- The toggle gives users the option to stay unmuted if they prefer the old behavior.

### Remove M Key Shortcut
- The existing `M` key toggle-mute keyboard shortcut is **removed entirely**.

---

## Edge Cases

### Window Blur / Tab Switch
- Listen for `window blur` and `document.visibilitychange` events.
- If space is being held (user is in hold-to-talk mode) and the window loses focus, **force re-mute** immediately.
- No notification on return — just silently re-mute.

### Text Input Conflict
- Spacebar hold-to-talk only activates when focus is outside `INPUT` and `TEXTAREA` elements.
- Inside text fields, space types a space character as normal.

### Race with Persistent Toggle
- If user clicks button to unmute (persistent), space does nothing.
- If user clicks button to re-mute (back to default), space hold-to-talk resumes working.

---

## Speech Bubble Tooltip

### Content
- **Desktop**: `"Hold space to talk"`
- **Mobile**: `"Hold button to talk"` (detect via `'ontouchstart' in window` or similar heuristic)

### Positioning
- Rendered as a small speech bubble **above** the mute button, with a downward-pointing tail/arrow.

### Show/Hide Behavior
- **Appears** ~1-2 seconds after the session connects (brief delay to let UI settle).
- **Auto-fades** after a few seconds of being visible.
- **Reappears on hover/focus** of the mute button after it has faded.
- Does NOT persist permanently — avoids visual noise for returning users.
- No localStorage-based "show N times" logic — keep it session-scoped.

---

## Mute Button Visual States

### Resting (Muted — Default)
- Current `muted-active` styling: red/pink background (`rgba(255, 80, 80, 0.2)`), red border, light red text.
- Label: `"Unmute mic"` (existing).

### Active (Hold-to-Talk Engaged — Space Held)
- **Pulsing glow effect**: The button gets a pulsing glow while space is held / touch is active.
- Glow is **audio-reactive**: pulse intensity/speed modulated by actual mic input amplitude.
- Implementation: Create a local `AnalyserNode` on the mic's `MediaStream` to read real-time amplitude. Use the amplitude value to drive CSS custom property (e.g. `--mic-level`) that controls glow intensity/scale.
- Base color: green/blue tint to contrast with the red muted state.
- Label switches to: `"Listening..."` or remains `"Mute mic"` (existing unmuted label).

### Visual Snap on Press
- Brief **scale/opacity animation** on the button when space is first pressed (the moment hold begins).
- CSS transition: quick scale to ~1.05 then back to 1.0, with a slight opacity bump. No sound.

### Persistently Unmuted (Clicked Toggle)
- Standard unmuted styling (no red, no glow). Existing behavior.

---

## Audio-Reactive Glow Implementation

### Local AnalyserNode Setup
- When the session connects and `localStream` is available, create an `AudioContext` + `AnalyserNode`.
- Connect the mic's `MediaStreamSource` to the `AnalyserNode` (do NOT connect to `destination` — analysis only, no feedback loop).
- Use `getByteFrequencyData()` or `getByteTimeDomainData()` in a `requestAnimationFrame` loop (only while space is held) to get amplitude.
- Normalize amplitude to 0-1 range and expose as a reactive value (state or CSS custom property).

### Cleanup
- Disconnect the `AnalyserNode` and close the `AudioContext` when the session ends.
- Stop the rAF loop when space is released.

---

## Files to Modify

1. **`frontend/src/App.tsx`**
   - Change `useState(false)` to `useState(true)` for `muted`.
   - Replace `M` key `useEffect` with spacebar hold-to-talk `useEffect` (keydown + keyup handlers).
   - Add window blur / visibilitychange listener to force re-mute.
   - Add state for `holdingToTalk` (boolean) to drive glow/snap UI.
   - Pass `holdingToTalk` and mic amplitude level to `SessionControls`.

2. **`frontend/src/components/SessionControls/SessionControls.tsx`**
   - Add speech bubble tooltip component (positioned above mute button).
   - Add touch-and-hold handlers (`onTouchStart`, `onTouchEnd`, `onTouchCancel`) on the mute button.
   - Add pulsing glow CSS class driven by `holdingToTalk` prop.
   - Add `--mic-level` CSS custom property for audio-reactive glow.
   - Add visual snap animation on hold start.

3. **`frontend/src/index.css`**
   - Add `.speech-bubble-tooltip` styles (positioning, arrow, fade animation).
   - Add `.hold-active` glow/pulse keyframes and styles.
   - Add snap animation keyframes.

4. **`frontend/src/lib/realtime.ts`** (or new utility)
   - Add local `AnalyserNode` setup method on the mic stream.
   - Expose amplitude reading for the UI.
   - Cleanup on disconnect.

---

## Summary of Decisions

| Decision | Choice |
|---|---|
| Turn handling while holding space | Keep server VAD (no manual mode) |
| Interruption on space press | Immediate interrupt |
| M key shortcut | Remove entirely |
| Release behavior | Cut immediately (no flush delay) |
| Tooltip persistence | Show briefly after connect, then on hover |
| Button glow while held | Audio-reactive (local AnalyserNode) |
| Tooltip timing | Show ~1-2s after connect |
| Mic permission | Request on connect (keep current) |
| Audio amplitude source | Local AnalyserNode on mic stream |
| Press feedback | Visual snap only (no sound) |
| Tab switch handling | Force re-mute on blur |
| Mobile support | Touch-and-hold on mute button, instant |
| Click toggle | Coexists; space is no-op when persistently unmuted |
| Text field conflict | Space ignored in INPUT/TEXTAREA |
| Tooltip text | "Hold space to talk" (desktop) / "Hold button to talk" (mobile) |
