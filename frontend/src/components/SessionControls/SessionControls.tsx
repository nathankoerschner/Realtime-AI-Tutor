type SessionControlsProps = {
  state: string;
  disabled?: boolean;
  muted: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  overlayVisible: boolean;
  onToggleOverlay: () => void;
};

export function SessionControls({
  state,
  disabled,
  muted,
  onStart,
  onStop,
  onToggleMute,
  overlayVisible,
  onToggleOverlay,
}: SessionControlsProps) {
  return (
    <div className="session-controls">
      <button onClick={onStart} disabled={disabled || state === 'connecting' || state === 'connected'}>
        {state === 'connecting' ? 'Connecting…' : 'Start session'}
      </button>
      <button onClick={onStop} disabled={state !== 'connected'} className="secondary">
        Stop
      </button>
      <button onClick={onToggleMute} disabled={state !== 'connected'} className="secondary">
        {muted ? 'Unmute mic' : 'Mute mic'}
      </button>
      <button onClick={onToggleOverlay} className="secondary">
        {overlayVisible ? 'Hide metrics' : 'Show metrics'}
      </button>
    </div>
  );
}
