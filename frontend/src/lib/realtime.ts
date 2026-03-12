export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

export type SessionBootstrap = {
  client_secret?: { value?: string };
  model?: string;
  session_config?: { model?: string };
};

export class RealtimeClient {
  private peer?: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private localStream?: MediaStream;
  private remoteAudio?: HTMLAudioElement;
  private localMicMuted = false;
  private analyserContext?: AudioContext;
  private analyserNode?: AnalyserNode;
  private analyserSource?: MediaStreamAudioSourceNode;
  private analyserData?: Uint8Array<ArrayBuffer>;

  async connect(
    bootstrap: SessionBootstrap,
    onEvent: (event: RealtimeEvent) => void,
    onRemoteTrack: (audio: HTMLAudioElement, stream: MediaStream) => void,
  ) {
    const ephemeralKey = bootstrap.client_secret?.value;
    const model = bootstrap.model ?? bootstrap.session_config?.model ?? 'gpt-4o-realtime-preview';
    if (!ephemeralKey) throw new Error('Missing ephemeral client secret from backend');

    this.peer = new RTCPeerConnection();
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;

    this.peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.remoteAudio!.srcObject = stream;
        onRemoteTrack(this.remoteAudio!, stream);
        void this.remoteAudio!.play().catch(() => undefined);
      }
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.setupLocalAnalyser();

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.localMicMuted;
    });
    this.localStream.getTracks().forEach((track) => this.peer!.addTrack(track, this.localStream!));

    this.dataChannel = this.peer.createDataChannel('oai-events');
    this.dataChannel.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      onEvent(event);
    };

    const channelReady = new Promise<void>((resolve) => {
      this.dataChannel!.onopen = () => resolve();
    });

    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    const baseUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const response = await fetch(baseUrl, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    });

    if (!response.ok) {
      throw new Error(`Realtime connection failed: ${response.status} ${await response.text()}`);
    }

    const answer = {
      type: 'answer' as const,
      sdp: await response.text(),
    };
    await this.peer.setRemoteDescription(answer);
    await channelReady;

    this.dataChannel!.send(
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
  }

  getLocalStream() {
    return this.localStream;
  }

  setupLocalAnalyser() {
    if (!this.localStream) return;

    this.teardownLocalAnalyser();

    try {
      const AudioContextCtor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      this.analyserContext = new AudioContextCtor();
      this.analyserNode = this.analyserContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.82;
      this.analyserSource = this.analyserContext.createMediaStreamSource(this.localStream);
      this.analyserSource.connect(this.analyserNode);
      this.analyserData = new Uint8Array(new ArrayBuffer(this.analyserNode.fftSize));
    } catch (error) {
      console.warn('[realtime] Unable to create local mic analyser', error);
      this.teardownLocalAnalyser();
    }
  }

  readLocalMicLevel() {
    if (!this.analyserNode || !this.analyserData) {
      return 0;
    }

    if (this.analyserContext?.state === 'suspended') {
      void this.analyserContext.resume().catch(() => undefined);
    }

    this.analyserNode.getByteTimeDomainData(this.analyserData);

    let sumSquares = 0;
    for (let index = 0; index < this.analyserData.length; index += 1) {
      const centered = (this.analyserData[index] - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / this.analyserData.length);
    return Math.min(1, Math.max(0, rms * 4.5));
  }

  teardownLocalAnalyser() {
    this.analyserSource?.disconnect();
    this.analyserNode?.disconnect();
    if (this.analyserContext) {
      void this.analyserContext.close().catch(() => undefined);
    }
    this.analyserSource = undefined;
    this.analyserNode = undefined;
    this.analyserContext = undefined;
    this.analyserData = undefined;
  }

  setLocalMicMuted(muted: boolean) {
    this.localMicMuted = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  private assertOpenDataChannel() {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Realtime data channel is not open');
    }
  }

  interruptAssistantResponse() {
    this.assertOpenDataChannel();

    this.dataChannel!.send(
      JSON.stringify({
        type: 'response.cancel',
      }),
    );

    this.dataChannel!.send(
      JSON.stringify({
        type: 'output_audio_buffer.clear',
      }),
    );
  }

  sendTextMessage(text: string) {
    this.assertOpenDataChannel();

    this.dataChannel!.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }),
    );
    this.dataChannel!.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
        },
      }),
    );
  }

  disconnect() {
    this.teardownLocalAnalyser();
    this.dataChannel?.close();
    this.peer?.close();
    this.localStream?.getTracks().forEach((track) => track.stop());
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }
    this.dataChannel = undefined;
    this.peer = undefined;
    this.localStream = undefined;
    this.remoteAudio = undefined;
  }
}
