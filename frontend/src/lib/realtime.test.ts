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

type MockTrack = {
  enabled: boolean;
  label: string;
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => { deviceId: string };
};

function createTrack(label: string, deviceId: string): MockTrack {
  return {
    enabled: true,
    label,
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
  };
}

function createStream(track: MockTrack): MediaStream {
  return {
    getAudioTracks: () => [track as unknown as MediaStreamTrack],
    getTracks: () => [track as unknown as MediaStreamTrack],
  } as MediaStream;
}

async function openConnection(client: RealtimeClient, bootstrap = { client_secret: { value: 'ephemeral' }, model: 'gpt-test' }) {
  const connectPromise = client.connect(bootstrap, vi.fn(), vi.fn());
  const peer = MockPeerConnection.instances.at(-1)!;

  for (let attempt = 0; attempt < 20 && !peer.dataChannel.onopen; attempt += 1) {
    await Promise.resolve();
  }

  peer.dataChannel.readyState = 'open';
  peer.dataChannel.onopen?.();
  await connectPromise;
  return peer;
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

    const builtInTrack = createTrack('Built-in Microphone', 'built-in');
    const getUserMedia = vi.fn(async () => createStream(builtInTrack));
    const enumerateDevices = vi.fn(async () => ([
      { kind: 'audioinput', deviceId: 'continuity', label: 'iPhone Microphone' },
      { kind: 'audioinput', deviceId: 'built-in', label: 'Built-in Microphone' },
    ]));

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices,
      },
    });
  });

  it('prefers a non-continuity microphone when labeled devices are available', async () => {
    const client = new RealtimeClient();

    await openConnection(client);

    expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: { exact: 'built-in' },
      },
    });
  });

  it('replaces a continuity mic after fallback acquisition when a better device appears', async () => {
    const continuityTrack = createTrack('iPhone Microphone', 'continuity');
    const builtInTrack = createTrack('Built-in Microphone', 'built-in');
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockResolvedValueOnce(createStream(continuityTrack))
      .mockResolvedValueOnce(createStream(builtInTrack));
    const enumerateDevices = vi
      .fn<() => Promise<MediaDeviceInfo[]>>()
      .mockResolvedValueOnce([
        { kind: 'audioinput', deviceId: 'default', label: '' } as MediaDeviceInfo,
      ])
      .mockResolvedValueOnce([
        { kind: 'audioinput', deviceId: 'continuity', label: 'iPhone Microphone' } as MediaDeviceInfo,
        { kind: 'audioinput', deviceId: 'built-in', label: 'Built-in Microphone' } as MediaDeviceInfo,
      ]);

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices,
      },
    });

    const client = new RealtimeClient();
    const peer = await openConnection(client);

    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: { exact: 'built-in' },
      },
    });
    expect(continuityTrack.stop).toHaveBeenCalled();
    expect(peer.addTrack).toHaveBeenCalledWith(expect.objectContaining({ label: 'Built-in Microphone' }), expect.any(Object));
  });

  it('connects, handles remote tracks, sends text, interrupts responses, mutes, and disconnects', async () => {
    const client = new RealtimeClient();
    const onEvent = vi.fn();
    const onRemoteTrack = vi.fn();

    const connectPromise = client.connect(
      { client_secret: { value: 'ephemeral' }, model: 'gpt-test' },
      onEvent,
      onRemoteTrack,
    );

    const peer = MockPeerConnection.instances[0]!;
    for (let attempt = 0; attempt < 20 && !peer.dataChannel.onopen; attempt += 1) {
      await Promise.resolve();
    }
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
    client.interruptAssistantResponse();
    client.sendTextMessage('hello');
    expect(peer.dataChannel.send).toHaveBeenCalledTimes(5);
    expect(peer.dataChannel.send).toHaveBeenNthCalledWith(2, JSON.stringify({ type: 'response.cancel' }));
    expect(peer.dataChannel.send).toHaveBeenNthCalledWith(3, JSON.stringify({ type: 'output_audio_buffer.clear' }));
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

    const connectPromise = failingClient.connect(
      { client_secret: { value: 'ephemeral' }, session_config: { model: 'fallback-model' } },
      vi.fn(),
      vi.fn(),
    );
    const peer = MockPeerConnection.instances.at(-1)!;
    for (let attempt = 0; attempt < 20 && !peer.dataChannel.onopen; attempt += 1) {
      await Promise.resolve();
    }
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
