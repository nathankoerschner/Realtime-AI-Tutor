import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSetLocalMicMuted = vi.fn();
const mockSendTextMessage = vi.fn();
const mockAttachToMediaStream = vi.fn();
const mockDispose = vi.fn();
const mockResetSpeechFrameFlag = vi.fn();

vi.mock('./components/Avatar/Avatar', () => ({
  Avatar: ({ viseme, speaking, connected, connecting }: Record<string, unknown>) => (
    <div data-testid="avatar">{JSON.stringify({ viseme, speaking, connected, connecting })}</div>
  ),
}));

vi.mock('./components/SessionControls/SessionControls', () => ({
  SessionControls: ({ state, muted, onStop, onToggleMute, keyboardOpen, onToggleKeyboard }: Record<string, any>) => (
    <div>
      <div data-testid="session-state">{JSON.stringify({ state, muted, keyboardOpen })}</div>
      <button onClick={onStop}>Stop session</button>
      <button onClick={onToggleMute}>Toggle mute</button>
      <button onClick={onToggleKeyboard}>Toggle keyboard</button>
    </div>
  ),
}));

vi.mock('./components/TextInput/TextInput', () => ({
  TextInput: ({ disabled, onSubmit }: Record<string, any>) => (
    <div>
      <div data-testid="keyboard-disabled">{String(disabled)}</div>
      <button onClick={() => onSubmit('typed question')}>Send typed</button>
    </div>
  ),
}));

vi.mock('./lib/realtime', () => ({
  RealtimeClient: class {
    connect = mockConnect;
    disconnect = mockDisconnect;
    setLocalMicMuted = mockSetLocalMicMuted;
    sendTextMessage = mockSendTextMessage;
  },
}));

vi.mock('./lib/audio', () => ({
  StreamingVisemeEngine: class {
    attachToMediaStream = mockAttachToMediaStream;
    dispose = mockDispose;
    resetSpeechFrameFlag = mockResetSpeechFrameFlag;
  },
}));

import App from './App';

describe('App', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockDisconnect.mockReset();
    mockSetLocalMicMuted.mockReset();
    mockSendTextMessage.mockReset();
    mockAttachToMediaStream.mockReset();
    mockDispose.mockReset();
    mockResetSpeechFrameFlag.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts a session, handles remote audio and realtime events, and supports lesson/topic actions', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    mockConnect.mockImplementation(async (_bootstrap, onEvent, onRemoteTrack) => {
      mockAttachToMediaStream.mockImplementation(async (_stream, onSnapshot) => {
        onSnapshot({ viseme: 'ai', speaking: true, level: 0.4, timestamp: 1 });
      });
      await onRemoteTrack({} as HTMLAudioElement, {} as MediaStream);
      onEvent({ type: 'input_audio_buffer.speech_stopped' });
      onEvent({ type: 'error', error: { code: 'bad' } });
      onEvent({ type: 'noop' });
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());
    expect(mockAttachToMediaStream).toHaveBeenCalled();
    expect(mockResetSpeechFrameFlag).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('{"code":"bad"}');
    expect(screen.getByTestId('avatar')).toHaveTextContent('"viseme":"ai"');
    expect(screen.getByTestId('avatar')).toHaveTextContent('"speaking":true');

    fireEvent.click(screen.getByRole('button', { name: /Learn about linear equations/i }));
    expect(mockSendTextMessage).toHaveBeenCalledWith('Can you teach me about linear equations?');

    fireEvent.keyDown(window, { key: 'm', target: document.body });
    await waitFor(() => expect(mockSetLocalMicMuted).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle keyboard' }));
    expect(screen.getByRole('button', { name: 'Send typed' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send typed' }));
    expect(mockSendTextMessage).toHaveBeenCalledWith('typed question');

    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop session' }));
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('shows backend start errors and send failures', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => 'start failed',
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('start failed'));

    vi.mocked(fetch).mockRejectedValueOnce('network weirdness');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to start session'));

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);
    mockConnect.mockResolvedValue(undefined);
    mockSendTextMessage.mockImplementationOnce(() => {
      throw new Error('send failed');
    }).mockImplementationOnce(() => {
      throw 'non-error';
    });
    mockConnect.mockImplementation(async (_bootstrap, onEvent) => {
      onEvent({ type: 'error', error: 'plain-error' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());
    expect(screen.getByRole('alert')).toHaveTextContent('Realtime error');

    fireEvent.click(screen.getByRole('button', { name: /Learn about clauses/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('send failed'));

    fireEvent.click(screen.getByRole('button', { name: /Learn about molecular structure/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to send message'));
  });

  it('ignores mute shortcut while typing and cleans up on unmount', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);
    mockConnect.mockResolvedValue(undefined);

    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'm' });
    expect(mockSetLocalMicMuted).not.toHaveBeenCalledWith(true);

    act(() => {
      unmount();
    });

    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });
});
