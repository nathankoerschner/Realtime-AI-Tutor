import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Avatar/Avatar';
import { Overlay } from './components/Overlay/Overlay';
import { SessionControls } from './components/SessionControls/SessionControls';
import { TextInput } from './components/TextInput/TextInput';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { MetricsTracker, type DerivedMetrics } from './lib/metrics';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';

export default function App() {
  const realtimeRef = useRef(new RealtimeClient());
  const metricsRef = useRef(new MetricsTracker());
  const visemeEngineRef = useRef(new StreamingVisemeEngine());
  const textInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connectionState, setConnectionState] = useState('idle');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [viseme, setViseme] = useState<VisemeKey>('rest');
  const [speaking, setSpeaking] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState<DerivedMetrics | null>(null);
  const [history, setHistory] = useState<DerivedMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);


  useEffect(() => {
    realtimeRef.current.setLocalMicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      realtimeRef.current.disconnect();
      visemeEngineRef.current.dispose();
    };
  }, []);

  // Keyboard shortcut: Ctrl+Shift+D to toggle overlay, M to toggle mute (when not typing)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setOverlayVisible((v) => !v);
      }
      // 'M' to toggle mute only when not focused on an input/textarea
      if (e.key === 'm' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName) && connectionState === 'connected') {
        e.preventDefault();
        toggleMute();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionState]);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 8000);
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
      // Focus text input after connection
      setTimeout(() => textInputRef.current?.focus(), 100);
    } catch (sessionError) {
      setConnectionState('idle');
      showError(sessionError instanceof Error ? sessionError.message : 'Unable to start session');
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
        syncMetrics();
        break;
      case 'error':
        showError(typeof event.error === 'object' ? JSON.stringify(event.error) : 'Realtime error');
        break;
      default:
        break;
    }
  }

  async function sendText(text: string) {
    try {
      visemeEngineRef.current.resetSpeechFrameFlag();
      metricsRef.current.beginTurn();
      syncMetrics();
      realtimeRef.current.sendTextMessage(text);
    } catch (sendError) {
      showError(sendError instanceof Error ? sendError.message : 'Unable to send message');
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

      {/* Error toast */}
      {error && (
        <div className="error-toast" role="alert">
          <p>{error}</p>
          <button className="error-toast-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <section className="hero-panel">
        {connectionState === 'idle' ? (
          <>
            <header className="app-header app-header-centered">
              <span className="eyebrow">Live + AI</span>
              <h1>AI Tutor</h1>
            </header>
            <button className="start-orb" onClick={startSession}>Start</button>
          </>
        ) : (
          <>
            <Avatar
              viseme={viseme}
              speaking={speaking}
              connected={connectionState === 'connected'}
              connecting={connectionState === 'connecting'}
            />
            <SessionControls
              state={connectionState}
              muted={muted}
              onStop={stopSession}
              onToggleMute={toggleMute}
              overlayVisible={overlayVisible}
              onToggleOverlay={() => setOverlayVisible((current) => !current)}
              keyboardOpen={keyboardOpen}
              onToggleKeyboard={() => {
                setKeyboardOpen((v) => {
                  if (!v) setTimeout(() => textInputRef.current?.focus(), 100);
                  return !v;
                });
              }}
            />
            {keyboardOpen && (
              <TextInput disabled={connectionState !== 'connected'} onSubmit={sendText} inputRef={textInputRef} />
            )}
          </>
        )}
      </section>
    </main>
  );
}
