export type AudioAnalysisSnapshot = {
  level: number;
  speaking: boolean;
  timestamp: number;
};

export class StreamingAudioEngine {
  private analyser?: AnalyserNode;
  private data?: Uint8Array<ArrayBuffer>;
  private rafId = 0;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private hasRenderedSpeech = false;

  async attachToMediaStream(
    stream: MediaStream,
    onSnapshot: (snapshot: AudioAnalysisSnapshot) => void,
    onFirstAvatarFrame: (at: number) => void,
  ) {
    this.dispose();
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    const loop = () => {
      if (!this.analyser || !this.data) return;
      this.analyser.getByteFrequencyData(this.data as unknown as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (const value of this.data) sum += value;
      const avg = sum / this.data.length;
      const level = Math.min(avg / 64, 1);
      const speaking = level > 0.035;
      const timestamp = performance.now();
      if (speaking && !this.hasRenderedSpeech) {
        this.hasRenderedSpeech = true;
        onFirstAvatarFrame(timestamp);
      }
      onSnapshot({
        level,
        speaking,
        timestamp,
      });
      this.rafId = requestAnimationFrame(loop);
    };

    await this.context.resume();
    loop();
  }

  resetSpeechFrameFlag() {
    this.hasRenderedSpeech = false;
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.hasRenderedSpeech = false;
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.context?.close();
    this.source = undefined;
    this.analyser = undefined;
    this.context = undefined;
  }
}
