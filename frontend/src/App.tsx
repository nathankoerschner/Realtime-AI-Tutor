import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Avatar/Avatar';
import { SessionControls } from './components/SessionControls/SessionControls';
import { TextInput } from './components/TextInput/TextInput';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';

const lessonTopics = ['linear equations', 'clauses', 'molecular structure'] as const;

export default function App() {
  const realtimeRef = useRef(new RealtimeClient());
  const visemeEngineRef = useRef(new StreamingVisemeEngine());
  const textInputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connectionState, setConnectionState] = useState('idle');
  const [viseme, setViseme] = useState<VisemeKey>('rest');
  const [speaking, setSpeaking] = useState(false);
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

  // Keyboard shortcut: M to toggle mute when not typing
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
    await visemeEngineRef.current.attachToMediaStream(stream, handleAudioSnapshot, () => {});
  }

  function handleAudioSnapshot(snapshot: AudioAnalysisSnapshot) {
    setViseme(snapshot.viseme);
    setSpeaking(snapshot.speaking);
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'input_audio_buffer.speech_stopped':
        visemeEngineRef.current.resetSpeechFrameFlag();
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

  return (
    <main className="app-shell">
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
            {!keyboardOpen && (
              <div className="lesson-topic-bar" aria-label="Suggested lesson topics">
                {lessonTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className="secondary lesson-topic-button"
                    disabled={connectionState !== 'connected'}
                    onClick={() => sendText(`Can you teach me about ${topic}?`)}
                  >
                    Learn about {topic}
                  </button>
                ))}
              </div>
            )}
            <SessionControls
              state={connectionState}
              muted={muted}
              onStop={stopSession}
              onToggleMute={toggleMute}
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
