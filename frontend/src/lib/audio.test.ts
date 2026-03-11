import { describe, expect, it, vi } from 'vitest';

import { StreamingAudioEngine } from './audio';

describe('StreamingAudioEngine', () => {
  it('attaches to a media stream, emits snapshots, and fires first-frame once per speech window', async () => {
    const disconnect = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      queued.push(cb);
      return queued.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 4,
      disconnect: vi.fn(),
      getByteFrequencyData: vi
        .fn()
        .mockImplementationOnce((data: Uint8Array) => data.set([64, 64, 64, 64]))
        .mockImplementationOnce((data: Uint8Array) => data.set([0, 0, 0, 0]))
        .mockImplementation((data: Uint8Array) => data.set([64, 64, 64, 64])),
    };
    const source = {
      connect: vi.fn(),
      disconnect,
    };

    vi.stubGlobal(
      'AudioContext',
      class {
        createAnalyser() {
          return analyser;
        }
        createMediaStreamSource() {
          return source;
        }
        resume = resume;
        close = close;
      },
    );

    const engine = new StreamingAudioEngine();
    const snapshots: Array<{ speaking: boolean; level: number }> = [];
    const firstFrame = vi.fn();

    await engine.attachToMediaStream({} as MediaStream, (snapshot) => snapshots.push(snapshot), firstFrame);
    queued.shift()?.(0);
    queued.shift()?.(1);

    expect(resume).toHaveBeenCalled();
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(snapshots[0]?.speaking).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.speaking === false)).toBe(true);
    expect(firstFrame).toHaveBeenCalledTimes(1);

    engine.resetSpeechFrameFlag();
    queued.shift()?.(2);
    expect(firstFrame).toHaveBeenCalledTimes(2);

    engine.dispose();
    queued.shift()?.(3);
    expect(disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
