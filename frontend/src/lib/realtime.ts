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

    // Enable input audio transcription so user speech appears in chat
    this.dataChannel!.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          input_audio_transcription: {
            model: 'whisper-1',
          },
        },
      }),
    );
  }

  setLocalMicMuted(muted: boolean) {
    this.localMicMuted = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  sendTextMessage(text: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Realtime data channel is not open');
    }

    this.dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }),
    );
    this.dataChannel.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
        },
      }),
    );
  }

  disconnect() {
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
