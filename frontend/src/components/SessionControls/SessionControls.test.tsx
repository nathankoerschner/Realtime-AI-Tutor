import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionControls } from './SessionControls';

describe('SessionControls', () => {
  it('disables stop and mute until connected', () => {
    render(
      <SessionControls
        state="connecting"
        muted={false}
        keyboardOpen={false}
        onStop={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleKeyboard={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mute microphone (press M)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show keyboard' })).toBeEnabled();
  });

  it('calls handlers and updates labels from props', () => {
    const onStop = vi.fn();
    const onToggleMute = vi.fn();
    const onToggleKeyboard = vi.fn();

    render(
      <SessionControls
        state="connected"
        muted={true}
        keyboardOpen={true}
        onStop={onStop}
        onToggleMute={onToggleMute}
        onToggleKeyboard={onToggleKeyboard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone (press M)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide keyboard' }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onToggleKeyboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Unmute microphone (press M)' })).toHaveTextContent('Unmute mic');
  });
});
