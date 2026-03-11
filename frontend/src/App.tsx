import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Avatar } from './components/Avatar/Avatar';
import { SessionControls } from './components/SessionControls/SessionControls';
import { ChatPanel, type ChatMessage } from './components/ChatPanel/ChatPanel';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';
import { EvalCollector } from './lib/evals';

const lessonTopics = ['linear equations', 'molecular structure'] as const;

let messageIdCounter = 0;
function nextMessageId() {
  return `msg-${++messageIdCounter}`;
}

async function getErrorMessage(response: Response) {
  const fallback = `Request failed with ${response.status}`;

  try {
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = await response.json() as { detail?: string };
      return payload.detail ?? fallback;
    }

    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
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
  const userMessageIdByItemIdRef = useRef<Record<string, string>>({});
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptedAssistantRef = useRef(false);

  // Word-by-word reveal state
  const wordRevealRef = useRef<{
    fullText: string;           // accumulated transcript from deltas
    revealedWordCount: number;  // how many words currently visible
    done: boolean;              // transcript stream complete
  }>({ fullText: '', revealedWordCount: 0, done: false });
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingRef = useRef(false);
  const userSpeechStartedAtRef = useRef<number | null>(null);
  const lastUserSpeechDurationMsRef = useRef(0);
  const lastUserSpeechDuringTutorRef = useRef(false);

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
  function addUserMessage(text: string, options?: { flush?: boolean }) {
    const msg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    const appendMessage = () => setMessages((prev) => [...prev, msg]);
    if (options?.flush) {
      flushSync(appendMessage);
      return;
    }

    appendMessage();
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

  function clearUserMessageItemBinding(messageId: string) {
    for (const [itemId, boundMessageId] of Object.entries(userMessageIdByItemIdRef.current)) {
      if (boundMessageId === messageId) {
        delete userMessageIdByItemIdRef.current[itemId];
      }
    }
  }

  function bindPendingUserMessageToItem(itemId: string | undefined) {
    if (!itemId) return pendingUserMsgIdRef.current;

    const existingId = userMessageIdByItemIdRef.current[itemId];
    if (existingId) return existingId;

    const pendingId = pendingUserMsgIdRef.current;
    if (pendingId) {
      userMessageIdByItemIdRef.current[itemId] = pendingId;
      return pendingId;
    }

    return null;
  }

  // Resolve the pending user message with actual transcript
  function resolvePendingUserMessage(text: string, itemId?: string) {
    const id = bindPendingUserMessageToItem(itemId) ?? pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text, pending: false } : m)),
      );
      if (pendingUserMsgIdRef.current === id) {
        pendingUserMsgIdRef.current = null;
      }
      clearUserMessageItemBinding(id);
    } else {
      // No pending placeholder — just append (fallback)
      addUserMessage(text);
    }
  }

  // Remove empty pending user message (e.g. if transcription was empty)
  function removePendingUserMessage(itemId?: string) {
    const id = bindPendingUserMessageToItem(itemId) ?? pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (pendingUserMsgIdRef.current === id) {
        pendingUserMsgIdRef.current = null;
      }
      clearUserMessageItemBinding(id);
    }
  }

  function shouldIgnoreTranscript(transcript: string) {
    const normalized = transcript.trim();
    if (!normalized) return true;

    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    const speechDurationMs = lastUserSpeechDurationMsRef.current;
    const happenedDuringTutorSpeech = lastUserSpeechDuringTutorRef.current;
    const hasLatinLetters = /[A-Za-z]/.test(normalized);
    const hasNonLatinLetters = /[^\u0000-\u024F\s\d\p{P}\p{S}]/u.test(normalized);

    // Very short snippets detected while the tutor is already speaking are
    // usually speaker bleed / room noise rather than an intentional user turn.
    if (happenedDuringTutorSpeech && speechDurationMs < 1200 && wordCount <= 3) {
      return true;
    }

    // We want English transcripts only. If the ASR returns non-Latin script
    // without any Latin letters, treat it as a bad transcript and drop it.
    if (hasNonLatinLetters && !hasLatinLetters) {
      return true;
    }

    return false;
  }

  // Start a new streaming assistant message and begin word reveal
  function startAssistantMessage(): string {
    const id = nextMessageId();
    streamingMsgIdRef.current = id;
    interruptedAssistantRef.current = false;
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
    /* v8 ignore next */
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
    /* v8 ignore next */
    if (!id) return;
    stopWordRevealTimer();
    // Show the full text
    const fullText = wordRevealRef.current.fullText;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: fullText, streaming: false } : m)),
    );
    streamingMsgIdRef.current = null;
    interruptedAssistantRef.current = false;
    wordRevealRef.current = { fullText: '', revealedWordCount: 0, done: false };
  }

  function interruptAssistantMessage() {
    const id = streamingMsgIdRef.current;
    if (!id) return;

    stopWordRevealTimer();

    const reveal = wordRevealRef.current;
    const tokens = reveal.fullText.split(/(\s+)/);
    const visibleText = tokens.slice(0, reveal.revealedWordCount).join('');

    setMessages((prev) => {
      if (!visibleText.trim()) {
        return prev.filter((m) => m.id !== id);
      }
      return prev.map((m) => (m.id === id ? { ...m, text: visibleText, streaming: false } : m));
    });

    streamingMsgIdRef.current = null;
    interruptedAssistantRef.current = true;
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
        throw new Error(await getErrorMessage(response));
      }
      const bootstrap = (await response.json()) as SessionBootstrap;
      await realtimeRef.current.connect(
        bootstrap,
        handleRealtimeEvent,
        handleRemoteAudio,
      );

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
    interruptedAssistantRef.current = false;
    userMessageIdByItemIdRef.current = {};
    userSpeechStartedAtRef.current = null;
    lastUserSpeechDurationMsRef.current = 0;
    lastUserSpeechDuringTutorRef.current = false;
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
    // If we just interrupted an assistant turn and then receive a fresh remote
    // speaking frame before any new transcript has been attached, treat that as
    // the next tutor response starting. This lets an immediate follow-up reply
    // begin in the same tick without being swallowed by the interruption guard.
    if (snapshot.speaking && interruptedAssistantRef.current && !streamingMsgIdRef.current) {
      interruptedAssistantRef.current = false;
    }

    setViseme(snapshot.viseme);
    setSpeaking(snapshot.speaking);
    speakingRef.current = snapshot.speaking;
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    const evaluator = evalCollectorRef.current;

    switch (event.type) {
      case 'input_audio_buffer.speech_started': {
        evaluator.markSpeechStart();
        userSpeechStartedAtRef.current = performance.now();
        lastUserSpeechDuringTutorRef.current = speakingRef.current || !!streamingMsgIdRef.current;

        if (lastUserSpeechDuringTutorRef.current) {
          interruptAssistantMessage();
        }

        // Always anchor the user turn as soon as speech starts so that if the
        // assistant is interrupted, the eventual transcript stays ordered ahead
        // of any follow-up tutor response. Probable bleed-through still gets
        // filtered later by shouldIgnoreTranscript/removePendingUserMessage.
        if (!pendingUserMsgIdRef.current) {
          createPendingUserMessage();
        }
        break;
      }
      case 'conversation.item.created': {
        const item = (event as any).item;
        const itemId = item?.id as string | undefined;
        const isUserAudioItem = item?.role === 'user'
          && Array.isArray(item?.content)
          && item.content.some((contentPart: any) => typeof contentPart?.type === 'string' && contentPart.type.includes('audio'));

        if (isUserAudioItem) {
          bindPendingUserMessageToItem(itemId);
        }
        break;
      }
      case 'input_audio_buffer.speech_stopped': {
        evaluator.markSpeechEnd();
        if (userSpeechStartedAtRef.current != null) {
          lastUserSpeechDurationMsRef.current = performance.now() - userSpeechStartedAtRef.current;
        }
        userSpeechStartedAtRef.current = null;
        visemeEngineRef.current.resetSpeechFrameFlag();
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = (event as any).item_id as string | undefined;
        const transcript = ((event as any).transcript as string | undefined)?.trim() ?? '';

        if (shouldIgnoreTranscript(transcript)) {
          removePendingUserMessage(itemId);
          lastUserSpeechDurationMsRef.current = 0;
          lastUserSpeechDuringTutorRef.current = false;
          break;
        }

        // Fill in the placeholder with the actual transcript.
        resolvePendingUserMessage(transcript, itemId);
        lastUserSpeechDurationMsRef.current = 0;
        lastUserSpeechDuringTutorRef.current = false;
        break;
      }
      case 'conversation.item.input_audio_transcription.failed': {
        const itemId = (event as any).item_id as string | undefined;
        // Input audio transcription failed — only surface it if this looked
        // like an intentional user turn rather than background noise during
        // tutor audio.
        console.warn('[tutor] Input audio transcription failed', event);
        if (lastUserSpeechDuringTutorRef.current) {
          removePendingUserMessage(itemId);
        } else {
          resolvePendingUserMessage('[could not transcribe]', itemId);
        }
        lastUserSpeechDurationMsRef.current = 0;
        lastUserSpeechDuringTutorRef.current = false;
        break;
      }
      case 'response.audio_transcript.delta': {
        if (interruptedAssistantRef.current) {
          break;
        }
        evaluator.markFirst('tutor_response_start');
        const delta = (event as any).delta as string | undefined;
        if (delta) {
          bufferTranscriptDelta(delta);
        }
        break;
      }
      case 'response.audio_transcript.done': {
        if (interruptedAssistantRef.current) {
          interruptedAssistantRef.current = false;
          break;
        }
        // Mark transcript complete — reveal timer will finalize once all words shown
        markTranscriptDone();
        break;
      }
      case 'response.done':
        evaluator.markTutorResponseEnd();
        if (interruptedAssistantRef.current) {
          interruptedAssistantRef.current = false;
          break;
        }
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
      if (streamingMsgIdRef.current) {
        interruptAssistantMessage();
      }

      // Flush the typed user turn into the DOM before the next streamed tutor
      // response can start, so ordering stays stable even when the backend
      // replies immediately.
      addUserMessage(text, { flush: true });
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
              {connectionState === 'connecting' ? (
                <div className="connecting-spinner" role="status" aria-label="Connecting">
                  <div className="spinner-ring" />
                  <span className="spinner-label">Connecting…</span>
                </div>
              ) : (
                <Avatar
                  viseme={viseme}
                  speaking={speaking}
                  connected={isConnected}
                />
              )}
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
            suggestedTopics={lessonTopics}
            disabled={!isConnected}
          />
        </div>
      )}
    </main>
  );
}
