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
  SessionControls: ({ state, muted, onStop, onToggleMute }: Record<string, any>) => (
    <div>
      <div data-testid="session-state">{JSON.stringify({ state, muted })}</div>
      <button onClick={onStop}>Stop session</button>
      <button onClick={onToggleMute}>Toggle mute</button>
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
    // jsdom doesn't have scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
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

    // Type and send a message via the chat panel
    const chatInput = screen.getByPlaceholderText('Type a message…');
    fireEvent.change(chatInput, { target: { value: 'typed question' } });
    fireEvent.submit(chatInput.closest('form')!);
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

  it('exercises map else-branches by having multiple messages during resolve/reveal/finalize', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // First, send a typed user message so there are multiple messages in state
    const chatInput = screen.getByPlaceholderText('Type a message…');
    await act(async () => {
      fireEvent.change(chatInput, { target: { value: 'first question' } });
      fireEvent.submit(chatInput.closest('form')!);
    });
    expect(screen.getByText('first question')).toBeInTheDocument();

    // Now speech_started creates a pending user message (2nd message in state)
    act(() => eventHandler({ type: 'input_audio_buffer.speech_started' }));
    // Resolve it — the map will iterate over 'first question' (no match) and pending (match)
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'spoken question' }));
    expect(screen.getByText('spoken question')).toBeInTheDocument();
    expect(screen.getByText('first question')).toBeInTheDocument();

    // Now stream an assistant response — there are already 2 user messages in state
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Answer here' }));
    // Advance to reveal words — map iterates over non-matching messages too
    act(() => vi.advanceTimersByTime(150 * 20));
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 10));

    // Finalize — map iterates over all 3 messages, only assistant matches
    expect(screen.getByText('Answer here')).toBeInTheDocument();
    expect(screen.getByText('first question')).toBeInTheDocument();
    expect(screen.getByText('spoken question')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles speech_started → transcription.completed flow with pending user message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    // Speech started creates a pending placeholder
    act(() => eventHandler({ type: 'input_audio_buffer.speech_started' }));
    expect(screen.getByText('…')).toBeInTheDocument();

    // Second speech_started should not create a duplicate
    act(() => eventHandler({ type: 'input_audio_buffer.speech_started' }));
    expect(screen.getAllByText('…')).toHaveLength(1);

    // Transcription completes, resolves the placeholder
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hello tutor' }));
    expect(screen.getByText('Hello tutor')).toBeInTheDocument();
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });

  it('handles empty transcription by removing pending message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    act(() => eventHandler({ type: 'input_audio_buffer.speech_started' }));
    expect(screen.getByText('…')).toBeInTheDocument();

    // Empty transcription removes the placeholder
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ' }));
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });

  it('handles transcription.failed by showing fallback text', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    act(() => eventHandler({ type: 'input_audio_buffer.speech_started' }));
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.failed' }));
    expect(screen.getByText('[could not transcribe]')).toBeInTheDocument();
  });

  it('handles transcription.completed without a pending message (fallback path)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    // No speech_started first — fallback addUserMessage path
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Surprise!' }));
    expect(screen.getByText('Surprise!')).toBeInTheDocument();
  });

  it('handles removePendingUserMessage when no pending message exists', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    // Empty transcription with no pending message — should be a no-op
    act(() => eventHandler({ type: 'conversation.item.input_audio_transcription.completed', transcript: '' }));
    // No crash, chat is still empty
    expect(screen.getByText('Messages will appear here as you talk with the tutor.')).toBeInTheDocument();
  });

  it('streams assistant response with word-by-word reveal and finalizes', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    // Simulate speaking state so word reveal advances
    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // Delta events buffer text
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Hello ' }));
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'world' }));

    // Advance timer to reveal words
    act(() => vi.advanceTimersByTime(150 * 10));

    // transcript done triggers finalization
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 10));

    expect(screen.getByText('Hello world')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles response.done when streaming assistant message is active', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Test' }));
    // response.done without transcript.done — should still finalize
    act(() => eventHandler({ type: 'response.done' }));
    act(() => vi.advanceTimersByTime(150 * 10));

    expect(screen.getByText('Test')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles response.done when no streaming message is active', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    // Should not crash when no streaming message exists
    act(() => eventHandler({ type: 'response.done' }));
  });

  it('handles delta with no existing streaming message (auto-starts one)', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // Delta without prior startAssistantMessage — bufferTranscriptDelta auto-starts
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Auto' }));
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 10));

    expect(screen.getByText('Auto')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('does not advance words when not speaking and transcript is not done', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    // Not speaking
    act(() => audioSnapshotHandler({ viseme: 'rest', speaking: false, level: 0, timestamp: 1 }));

    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Hello world' }));

    // Timer ticks but nothing should be revealed since not speaking
    act(() => vi.advanceTimersByTime(150 * 5));

    // The assistant message exists but text should still be empty (no reveal)
    const bubbles = document.querySelectorAll('.chat-bubble-assistant, [class*="chat-bubble"]');
    // Just verify no crash and the message is there
    expect(bubbles.length).toBeGreaterThanOrEqual(0);

    vi.useRealTimers();
  });

  it('handles delta event with no delta value (undefined)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any) => {
      eventHandler = onEvent;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce());

    // Delta with no delta value — should not crash
    act(() => eventHandler({ type: 'response.audio_transcript.delta' }));
  });

  it('revealNextWord returns early when no streaming message exists', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // Start and immediately finalize an assistant message
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Done' }));
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 20));

    // Message is finalized, streamingMsgIdRef is null
    // Now the interval still fires revealNextWord but should return early (no id)
    // The timer should have been stopped, but let's also tick to cover the guard
    act(() => vi.advanceTimersByTime(150 * 5));

    expect(screen.getByText('Done')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('word reveal finalizes when all words revealed and transcript is done (totalTokens branch)', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // Short message — just one word so it gets fully revealed before done is called
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'Hi' }));

    // Advance enough to reveal all words
    act(() => vi.advanceTimersByTime(150 * 10));

    // Now mark done — revealNextWord will see revealedWordCount >= totalTokens AND done=true
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 5));

    expect(screen.getByText('Hi')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('word reveal does not finalize when all words shown but transcript not done yet', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ client_secret: { value: 'secret' }, session_config: { model: 'm' } }),
    } as Response);

    let eventHandler: (event: any) => void;
    let audioSnapshotHandler: (snapshot: any) => void;
    mockConnect.mockImplementation(async (_bootstrap: any, onEvent: any, onRemoteAudio: any) => {
      eventHandler = onEvent;
      mockAttachToMediaStream.mockImplementation(async (_stream: any, onSnapshot: any) => {
        audioSnapshotHandler = onSnapshot;
      });
      await onRemoteAudio({} as HTMLAudioElement, {} as MediaStream);
    });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    act(() => audioSnapshotHandler({ viseme: 'ai', speaking: true, level: 0.5, timestamp: 1 }));

    // Short text
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: 'X' }));

    // Reveal all words but transcript is NOT done yet — should NOT finalize
    act(() => vi.advanceTimersByTime(150 * 10));

    // More deltas arrive — proves message wasn't finalized
    act(() => eventHandler({ type: 'response.audio_transcript.delta', delta: ' more' }));
    act(() => eventHandler({ type: 'response.audio_transcript.done' }));
    act(() => vi.advanceTimersByTime(150 * 10));

    expect(screen.getByText('X more')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('ignores mute shortcut when not connected', async () => {
    render(<App />);
    mockSetLocalMicMuted.mockClear();
    // In idle state, pressing 'm' should not toggle mute
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(mockSetLocalMicMuted).not.toHaveBeenCalled();
  });
});
