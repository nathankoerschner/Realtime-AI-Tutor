type SessionControlsProps = {
  state: string;
  muted: boolean;
  onStop: () => void;
  onToggleMute: () => void;
};

export function SessionControls({
  state,
  muted,
  onStop,
  onToggleMute,
}: SessionControlsProps) {
  return (
    <div className="session-controls">
      <button onClick={onStop} disabled={state !== 'connected'} className="secondary">
        Stop
      </button>
      <button
        onClick={onToggleMute}
        disabled={state !== 'connected'}
        className={`secondary ${muted ? 'muted-active' : ''}`}
        aria-label={muted ? 'Unmute microphone (press M)' : 'Mute microphone (press M)'}
      >
        {muted ? 'Unmute mic' : 'Mute mic'}
      </button>
    </div>
  );
}
