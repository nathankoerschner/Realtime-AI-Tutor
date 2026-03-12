import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';

type SessionControlsProps = {
  state: string;
  muted: boolean;
  holdingToTalk: boolean;
  micLevel: number;
  showTooltip: boolean;
  tooltipText: string;
  holdSnapActive: boolean;
  onStop: () => void;
  onToggleMute: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

export function SessionControls({
  state,
  muted,
  holdingToTalk,
  micLevel,
  showTooltip,
  tooltipText,
  holdSnapActive,
  onStop,
  onToggleMute,
  onHoldStart,
  onHoldEnd,
}: SessionControlsProps) {
  const ignoreNextClickRef = useRef(false);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [isTooltipFocused, setIsTooltipFocused] = useState(false);

  const tooltipVisible = showTooltip || isTooltipHovered || isTooltipFocused;
  const ariaLabel = holdingToTalk
    ? 'Listening, release to mute microphone'
    : muted
      ? 'Unmute microphone'
      : 'Mute microphone';
  const buttonLabel = holdingToTalk ? 'Listening…' : muted ? 'Unmute mic' : 'Mute mic';
  const buttonClassName = [
    'secondary',
    'mute-button',
    muted && !holdingToTalk ? 'muted-active' : '',
    holdingToTalk ? 'hold-active' : '',
    holdSnapActive ? 'hold-snap' : '',
  ].filter(Boolean).join(' ');

  function handleClick() {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    onToggleMute();
  }

  function handleTouchStart(event: TouchEvent<HTMLButtonElement>) {
    ignoreNextClickRef.current = true;
    event.preventDefault();
    onHoldStart();
  }

  function handleTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    event.preventDefault();
    onHoldEnd();
  }

  return (
    <div className="session-controls">
      <button onClick={onStop} disabled={state !== 'connected'} className="secondary">
        Stop
      </button>

      <div className="mute-button-wrapper">
        <button
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onMouseEnter={() => setIsTooltipHovered(true)}
          onMouseLeave={() => setIsTooltipHovered(false)}
          onFocus={() => setIsTooltipFocused(true)}
          onBlur={() => setIsTooltipFocused(false)}
          disabled={state !== 'connected'}
          className={buttonClassName}
          aria-label={ariaLabel}
          style={{ '--mic-level': micLevel } as CSSProperties}
        >
          {buttonLabel}
        </button>

        <div
          className={`speech-bubble-tooltip ${tooltipVisible ? 'visible' : ''}`}
          role="status"
          aria-hidden={!tooltipVisible}
        >
          {tooltipText}
        </div>
      </div>
    </div>
  );
}
