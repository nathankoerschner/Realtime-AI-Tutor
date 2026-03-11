import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeClient } from './realtime';

class MockDataChannel {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  onmessage?: (message: { data: string }) => void;
  onopen?: () => void;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 'closed';
  });
}

class MockPeerConnection {
  static instances: MockPeerConnection[] = [];
  ontrack?: (event: { streams: MediaStream[] }) => void;
  localDescription?: { type: 'offer'; sdp: string };
  remoteDescription?: { type: 'answer'; sdp: string };
  dataChannel = new MockDataChannel();
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.dataChannel);
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  setLocalDescription = vi.fn(async (offer: { type: 'offer'; sdp: string }) => {
    this.localDescription = offer;
  });
  setRemoteDescription = vi.fn(async (answer: { type: 'answer'; sdp: string }) => {
    this.remoteDescription = answer;
  });
  close = vi.fn();

  constructor() {
    MockPeerConnection.instances.push(this);
  }
}

class MockAudio {
  autoplay = false;
  srcObject: MediaStream | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    MockPeerConnection.instances.length = 0;

    vi.stubGlobal('RTCPeerConnection', MockPeerConnection as unknown as typeof RTCPeerConnection);
    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => 'answer-sdp', status: 200 })),
    );

    const track = { enabled: true, stop: vi.fn() };
    const localStream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => localStream),
      },
    });
  });

  it('connects, handles remote tracks, sends text, mutes, and disconnects', async () => {
    const client = new RealtimeClient();
    const onEvent = vi.fn();
    const onRemoteTrack = vi.fn();

    const connectPromise = client.connect(
      { client_secret: { value: 'ephemeral' }, model: 'gpt-test' },
      onEvent,
      onRemoteTrack,
    );

    await Promise.resolve();
    await Promise.resolve();
    const peer = MockPeerConnection.instances[0]!;
    peer.dataChannel.readyState = 'open';
    peer.dataChannel.onopen?.();
    await connectPromise;

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime?model=gpt-test',
      expect.objectContaining({
        method: 'POST',
        body: 'offer-sdp',
      }),
    );

    const remoteStream = {} as MediaStream;
    peer.ontrack?.({ streams: [remoteStream] });
    expect(onRemoteTrack).toHaveBeenCalled();

    peer.dataChannel.onmessage?.({ data: JSON.stringify({ type: 'error', error: 'bad' }) });
    peer.dataChannel.onmessage?.({ data: JSON.stringify({ type: 'response.text.delta', delta: 'hi' }) });
    expect(onEvent).toHaveBeenCalledWith({ type: 'error', error: 'bad' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'response.text.delta', delta: 'hi' });

    expect(peer.dataChannel.send).toHaveBeenCalledTimes(1);
    expect(peer.dataChannel.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: 'session.update',
        session: {
          input_audio_transcription: {
            model: 'whisper-1',
            language: 'en',
            prompt: 'Transcribe spoken audio in English only. If the audio is unclear, return an empty transcript.',
          },
          input_audio_noise_reduction: {
            type: 'near_field',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.72,
            prefix_padding_ms: 250,
            silence_duration_ms: 700,
            create_response: true,
            interrupt_response: true,
          },
        },
      }),
    );

    client.setLocalMicMuted(true);
    client.sendTextMessage('hello');
    expect(peer.dataChannel.send).toHaveBeenCalledTimes(3);
    expect(peer.addTrack).toHaveBeenCalled();

    client.disconnect();
    const audio = (client as unknown as { remoteAudio?: MockAudio }).remoteAudio;
    expect(peer.close).toHaveBeenCalled();
    expect(peer.dataChannel.close).toHaveBeenCalled();
    expect(audio).toBeUndefined();
  });

  it('throws for missing secret, closed channel, and failed realtime response', async () => {
    const client = new RealtimeClient();

    await expect(client.connect({}, vi.fn(), vi.fn())).rejects.toThrow('Missing ephemeral client secret from backend');

    const failingClient = new RealtimeClient();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, text: async () => 'denied' })),
    );

    const connectPromise = failingClient.connect({ client_secret: { value: 'ephemeral' }, session_config: { model: 'fallback-model' } }, vi.fn(), vi.fn());
    const peer = MockPeerConnection.instances.at(-1)!;
    peer.dataChannel.readyState = 'open';
    peer.dataChannel.onopen?.();
    await expect(connectPromise).rejects.toThrow('Realtime connection failed: 401 denied');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime?model=fallback-model',
      expect.any(Object),
    );

    expect(() => client.sendTextMessage('x')).toThrow('Realtime data channel is not open');
  });
});
