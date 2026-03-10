import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from './components/Avatar/Avatar';
import { SessionControls } from './components/SessionControls/SessionControls';
import { ChatPanel, type ChatMessage } from './components/ChatPanel/ChatPanel';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';
import { EvalCollector } from './lib/evals';

const lessonTopics = ['linear equations', 'clauses', 'molecular structure'] as const;

let messageIdCounter = 0;
function nextMessageId() {
  return `msg-${++messageIdCounter}`;
}

export default function App() {
  const realtimeRef = useRef(new RealtimeClient());
  const visemeEngineRef = useRef(new StreamingVisemeEngine());
  const evalCollectorRef = useRef(new EvalCollector());

  const [connectionState, setConnectionState] = useState('idle');
  const [viseme, setViseme] = useState<VisemeKey>('rest');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Track current streaming assistant message id
  const streamingMsgIdRef = useRef<string | null>(null);
  // Track pending user message placeholder (waiting for transcription)
  const pendingUserMsgIdRef = useRef<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Word-by-word reveal state
  const wordRevealRef = useRef<{
    fullText: string;           // accumulated transcript from deltas
    revealedWordCount: number;  // how many words currently visible
    done: boolean;              // transcript stream complete
  }>({ fullText: '', revealedWordCount: 0, done: false });
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    realtimeRef.current.setLocalMicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      realtimeRef.current.disconnect();
      visemeEngineRef.current.dispose();
      evalCollectorRef.current.flush();
      stopWordRevealTimer();
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
    evalCollectorRef.current.markError('ui', msg);
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 8000);
  }, []);

  // Add a user message to chat (used for typed messages)
  function addUserMessage(text: string) {
    const msg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }

  // Create a placeholder user message when speech is detected
  function createPendingUserMessage(): string {
    const id = nextMessageId();
    pendingUserMsgIdRef.current = id;
    const msg: ChatMessage = {
      id,
      role: 'user',
      text: '',
      pending: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return id;
  }

  // Resolve the pending user message with actual transcript
  function resolvePendingUserMessage(text: string) {
    const id = pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text, pending: false } : m)),
      );
      pendingUserMsgIdRef.current = null;
    } else {
      // No pending placeholder — just append (fallback)
      addUserMessage(text);
    }
  }

  // Remove empty pending user message (e.g. if transcription was empty)
  function removePendingUserMessage() {
    const id = pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      pendingUserMsgIdRef.current = null;
    }
  }

  // Start a new streaming assistant message and begin word reveal
  function startAssistantMessage(): string {
    const id = nextMessageId();
    streamingMsgIdRef.current = id;
    wordRevealRef.current = { fullText: '', revealedWordCount: 0, done: false };
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      text: '',
      streaming: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    startWordRevealTimer();
    return id;
  }

  // Buffer transcript text (don't display yet — the reveal timer handles display)
  function bufferTranscriptDelta(delta: string) {
    if (!streamingMsgIdRef.current) {
      startAssistantMessage();
    }
    wordRevealRef.current.fullText += delta;
  }

  // Mark transcript as complete — the reveal timer will finalize once all words are shown
  function markTranscriptDone() {
    wordRevealRef.current.done = true;
  }

  // Reveal the next word in the assistant message
  function revealNextWord() {
    const reveal = wordRevealRef.current;
    const id = streamingMsgIdRef.current;
    if (!id) return;

    const words = reveal.fullText.split(/(\s+)/); // preserve whitespace
    const totalTokens = words.length;
    if (reveal.revealedWordCount >= totalTokens) {
      // All buffered words shown — if transcript is done, finalize
      if (reveal.done) {
        finalizeAssistantMessage();
      }
      return;
    }

    // Don't reveal words while still waiting for the user's transcription
    if (pendingUserMsgIdRef.current) return;

    // Only advance when the AI is actually speaking audio
    if (!speakingRef.current && !reveal.done) return;

    reveal.revealedWordCount++;
    const visibleText = words.slice(0, reveal.revealedWordCount).join('');

    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: visibleText } : m)),
    );

    // If transcript is done and all words now revealed, finalize
    if (reveal.done && reveal.revealedWordCount >= totalTokens) {
      finalizeAssistantMessage();
    }
  }

  function startWordRevealTimer() {
    stopWordRevealTimer();
    // ~150ms per token ≈ word-by-word at natural speech pace
    wordRevealTimerRef.current = setInterval(revealNextWord, 150);
  }

  function stopWordRevealTimer() {
    if (wordRevealTimerRef.current) {
      clearInterval(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }
  }

  // Finalize the streaming assistant message
  function finalizeAssistantMessage() {
    const id = streamingMsgIdRef.current;
    if (!id) return;
    stopWordRevealTimer();
    // Show the full text
    const fullText = wordRevealRef.current.fullText;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: fullText, streaming: false } : m)),
    );
    streamingMsgIdRef.current = null;
    wordRevealRef.current = { fullText: '', revealedWordCount: 0, done: false };
  }

  async function startSession() {
    const evaluator = evalCollectorRef.current;
    evaluator.markSessionStart();
    evaluator.markConnectionAttempt();

    setError(null);
    setMessages([]);
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

      evaluator.markConnectionSuccess();
      setConnectionState('connected');
    } catch (sessionError) {
      const errorMsg = sessionError instanceof Error ? sessionError.message : 'Unable to start session';
      evaluator.markConnectionFailure(errorMsg);
      setConnectionState('idle');
      showError(errorMsg);
    }
  }

  function stopSession() {
    evalCollectorRef.current.markSessionEnd();

    realtimeRef.current.disconnect();
    visemeEngineRef.current.dispose();
    setConnectionState('idle');
    setSpeaking(false);
    setViseme('rest');
    streamingMsgIdRef.current = null;
    pendingUserMsgIdRef.current = null;
    stopWordRevealTimer();
    wordRevealRef.current = { fullText: '', revealedWordCount: 0, done: false };

    // Flush eval data when session ends
    evalCollectorRef.current.flush();
  }

  async function handleRemoteAudio(_audio: HTMLAudioElement, stream: MediaStream) {
    evalCollectorRef.current.markFirstAudioFrame();
    await visemeEngineRef.current.attachToMediaStream(stream, handleAudioSnapshot, () => {});
  }

  function handleAudioSnapshot(snapshot: AudioAnalysisSnapshot) {
    setViseme(snapshot.viseme);
    setSpeaking(snapshot.speaking);
    speakingRef.current = snapshot.speaking;
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    const evaluator = evalCollectorRef.current;

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        evaluator.markSpeechStart();
        // Create a placeholder so the user message appears before the AI response
        if (!pendingUserMsgIdRef.current) {
          createPendingUserMessage();
        }
        break;
      case 'input_audio_buffer.speech_stopped':
        evaluator.markSpeechEnd();
        visemeEngineRef.current.resetSpeechFrameFlag();
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        // Fill in the placeholder with the actual transcript
        const transcript = (event as any).transcript as string | undefined;
        if (transcript?.trim()) {
          resolvePendingUserMessage(transcript.trim());
        } else {
          // Empty transcription — remove the placeholder
          removePendingUserMessage();
        }
        break;
      }
      case 'response.audio_transcript.delta': {
        evaluator.markFirst('tutor_response_start');
        const delta = (event as any).delta as string | undefined;
        if (delta) {
          bufferTranscriptDelta(delta);
        }
        break;
      }
      case 'response.audio_transcript.done': {
        // Mark transcript complete — reveal timer will finalize once all words shown
        markTranscriptDone();
        break;
      }
      case 'response.done':
        evaluator.markTutorResponseEnd();
        // Also finalize in case transcript.done didn't fire
        if (streamingMsgIdRef.current) {
          markTranscriptDone();
        }
        break;
      case 'error':
        const errorMsg = typeof event.error === 'object' ? JSON.stringify(event.error) : 'Realtime error';
        evaluator.markError('realtime', errorMsg, { event_type: event.type });
        showError(errorMsg);
        break;
      default:
        break;
    }
  }

  async function sendText(text: string) {
    try {
      addUserMessage(text);
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

  const isConnected = connectionState === 'connected';
  const isActive = connectionState !== 'idle';

  return (
    <main className="app-shell">
      {/* Error toast */}
      {error && (
        <div className="error-toast" role="alert">
          <p>{error}</p>
          <button className="error-toast-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {!isActive ? (
        /* Idle / start screen — centered */
        <section className="hero-panel">
          <header className="app-header app-header-centered">
            <span className="eyebrow">Live + AI</span>
            <h1>AI Tutor</h1>
          </header>
          <button className="start-orb" onClick={startSession}>Start</button>
        </section>
      ) : (
        /* Active session — avatar left, chat right */
        <div className="session-layout">
          <section className="avatar-area">
            <div className="avatar-center-wrapper">
              <Avatar
                viseme={viseme}
                speaking={speaking}
                connected={isConnected}
                connecting={connectionState === 'connecting'}
              />
            </div>

            <div className="lesson-topic-bar" aria-label="Suggested lesson topics">
              {lessonTopics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="secondary lesson-topic-button"
                  disabled={!isConnected}
                  onClick={() => sendText(`Can you teach me about ${topic}?`)}
                >
                  Learn about {topic}
                </button>
              ))}
            </div>

            <SessionControls
              state={connectionState}
              muted={muted}
              onStop={stopSession}
              onToggleMute={toggleMute}
            />
          </section>

          <ChatPanel
            messages={messages}
            onSend={sendText}
            disabled={!isConnected}
          />
        </div>
      )}
    </main>
  );
}
