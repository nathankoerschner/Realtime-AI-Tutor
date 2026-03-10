type SessionControlsProps = {
  state: string;
  muted: boolean;
  onStop: () => void;
  onToggleMute: () => void;
  overlayVisible: boolean;
  onToggleOverlay: () => void;
  keyboardOpen: boolean;
  onToggleKeyboard: () => void;
};

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <line x1="6" y1="8" x2="6" y2="8" strokeWidth="2" />
      <line x1="10" y1="8" x2="10" y2="8" strokeWidth="2" />
      <line x1="14" y1="8" x2="14" y2="8" strokeWidth="2" />
      <line x1="18" y1="8" x2="18" y2="8" strokeWidth="2" />
      <line x1="6" y1="12" x2="6" y2="12" strokeWidth="2" />
      <line x1="10" y1="12" x2="10" y2="12" strokeWidth="2" />
      <line x1="14" y1="12" x2="14" y2="12" strokeWidth="2" />
      <line x1="18" y1="12" x2="18" y2="12" strokeWidth="2" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

export function SessionControls({
  state,
  muted,
  onStop,
  onToggleMute,
  overlayVisible,
  onToggleOverlay,
  keyboardOpen,
  onToggleKeyboard,
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
      <button onClick={onToggleOverlay} className="secondary">
        {overlayVisible ? 'Hide metrics' : 'Show metrics'}
      </button>
      <button
        onClick={onToggleKeyboard}
        className={`secondary ${keyboardOpen ? 'keyboard-active' : ''}`}
        aria-label={keyboardOpen ? 'Hide keyboard' : 'Show keyboard'}
        title={keyboardOpen ? 'Hide keyboard' : 'Type a message'}
      >
        <KeyboardIcon />
      </button>
    </div>
  );
}
