import { useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Avatar/Avatar';
import { Overlay } from './components/Overlay/Overlay';
import { SessionControls } from './components/SessionControls/SessionControls';
import { TextInput } from './components/TextInput/TextInput';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { MetricsTracker, type DerivedMetrics } from './lib/metrics';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export default function App() {
  const realtimeRef = useRef(new RealtimeClient());
  const metricsRef = useRef(new MetricsTracker());
  const visemeEngineRef = useRef(new StreamingVisemeEngine());

  const [connectionState, setConnectionState] = useState('idle');
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'system',
      text: 'Start a session, then speak or type. The tutor will respond with voice and animated avatar feedback.',
    },
  ]);
  const [viseme, setViseme] = useState<VisemeKey>('rest');
  const [speaking, setSpeaking] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState<DerivedMetrics | null>(null);
  const [history, setHistory] = useState<DerivedMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const assistantDraftId = useRef<string | null>(null);

  useEffect(() => {
    realtimeRef.current.setLocalMicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      realtimeRef.current.disconnect();
      visemeEngineRef.current.dispose();
    };
  }, []);

  async function startSession() {
    setError(null);
    setConnectionState('connecting');
    try {
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_level: 'grades 6-12' }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const bootstrap = (await response.json()) as SessionBootstrap;
      await realtimeRef.current.connect(bootstrap, handleRealtimeEvent, handleRemoteAudio);
      setConnectionState('connected');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: 'Session connected. Ask about any topic and the tutor will narrow it to 1–3 concepts.',
        },
      ]);
    } catch (sessionError) {
      setConnectionState('idle');
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to start session');
    }
  }

  function stopSession() {
    realtimeRef.current.disconnect();
    visemeEngineRef.current.dispose();
    setConnectionState('idle');
    setSpeaking(false);
    setViseme('rest');
  }

  async function handleRemoteAudio(_audio: HTMLAudioElement, stream: MediaStream) {
    await visemeEngineRef.current.attachToMediaStream(stream, handleAudioSnapshot, (at) => {
      metricsRef.current.markFirstAvatar(at);
      syncMetrics();
    });
  }

  function handleAudioSnapshot(snapshot: AudioAnalysisSnapshot) {
    setViseme(snapshot.viseme);
    setSpeaking(snapshot.speaking);
  }

  function syncMetrics() {
    setLatestMetrics(metricsRef.current.latest());
    setHistory(metricsRef.current.getHistory());
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'input_audio_buffer.speech_stopped':
        visemeEngineRef.current.resetSpeechFrameFlag();
        metricsRef.current.markSpeechStopped();
        syncMetrics();
        break;
      case 'response.text.delta': {
        metricsRef.current.markFirstTextDelta();
        const delta = String(event.delta ?? '');
        appendAssistantDelta(delta);
        syncMetrics();
        break;
      }
      case 'response.audio.delta':
        metricsRef.current.markFirstAudioDelta();
        syncMetrics();
        break;
      case 'response.done':
      case 'response.output_audio.done':
        metricsRef.current.completeTurn();
        assistantDraftId.current = null;
        syncMetrics();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = String(event.transcript ?? '').trim();
        if (transcript) addMessage('user', transcript);
        break;
      }
      case 'error':
        setError(typeof event.error === 'object' ? JSON.stringify(event.error) : 'Realtime error');
        break;
      default:
        break;
    }
  }

  function addMessage(role: ChatMessage['role'], text: string) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text }]);
  }

  function appendAssistantDelta(delta: string) {
    if (!assistantDraftId.current) {
      assistantDraftId.current = crypto.randomUUID();
      setMessages((current) => [...current, { id: assistantDraftId.current!, role: 'assistant', text: delta }]);
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantDraftId.current ? { ...message, text: `${message.text}${delta}` } : message,
      ),
    );
  }

  async function sendText(text: string) {
    try {
      addMessage('user', text);
      assistantDraftId.current = null;
      visemeEngineRef.current.resetSpeechFrameFlag();
      metricsRef.current.beginTurn();
      syncMetrics();
      realtimeRef.current.sendTextMessage(text);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send message');
    }
  }

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      realtimeRef.current.setLocalMicMuted(next);
      return next;
    });
  }

  function exportMetrics() {
    const blob = new Blob([JSON.stringify(metricsRef.current.export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `latency-report-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <Overlay
        visible={overlayVisible}
        connectionState={connectionState}
        latest={latestMetrics}
        history={history}
        onExport={exportMetrics}
      />

      <section className="hero-panel">
        <Avatar viseme={viseme} speaking={speaking} connected={connectionState === 'connected'} />
      </section>

      <section className="controls-panel">
        <SessionControls
          state={connectionState}
          muted={muted}
          onStart={startSession}
          onStop={stopSession}
          onToggleMute={toggleMute}
          overlayVisible={overlayVisible}
          onToggleOverlay={() => setOverlayVisible((current) => !current)}
        />
        <TextInput disabled={connectionState !== 'connected'} onSubmit={sendText} />
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      <section className="messages-panel" aria-label="Recent transcript">
        {messages.slice(-8).map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <span>{message.role}</span>
            <p>{message.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
