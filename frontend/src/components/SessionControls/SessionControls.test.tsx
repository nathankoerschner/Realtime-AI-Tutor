import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionControls } from './SessionControls';

function renderControls(overrides?: Partial<ComponentProps<typeof SessionControls>>) {
  const onStop = vi.fn();
  const onToggleMute = vi.fn();
  const onHoldStart = vi.fn();
  const onHoldEnd = vi.fn();

  render(
    <SessionControls
      state="connected"
      muted={false}
      holdingToTalk={false}
      micLevel={0}
      showTooltip={false}
      tooltipText="Hold space to talk"
      holdSnapActive={false}
      onStop={onStop}
      onToggleMute={onToggleMute}
      onHoldStart={onHoldStart}
      onHoldEnd={onHoldEnd}
      {...overrides}
    />,
  );

  return { onStop, onToggleMute, onHoldStart, onHoldEnd };
}

describe('SessionControls', () => {
  it('disables stop and mute until connected', () => {
    renderControls({ state: 'connecting' });

    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeDisabled();
  });

  it('calls handlers and updates labels from props', () => {
    const { onStop, onToggleMute } = renderControls({ muted: true });

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toHaveTextContent('Unmute mic');
  });
});
