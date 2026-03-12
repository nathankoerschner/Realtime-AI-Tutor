import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Avatar } from './components/Avatar/Avatar';
import { SessionControls } from './components/SessionControls/SessionControls';
import { ChatPanel, type ChatMessage } from './components/ChatPanel/ChatPanel';
import { StreamingVisemeEngine, type AudioAnalysisSnapshot, type VisemeKey } from './lib/audio';
import { RealtimeClient, type RealtimeEvent, type SessionBootstrap } from './lib/realtime';
import { EvalCollector } from './lib/evals';

const lessonTopics = ['linear equations', 'molecular structure'] as const;
const HOLD_TOOLTIP_SHOW_DELAY_MS = 1200;
const HOLD_TOOLTIP_AUTO_HIDE_MS = 3200;
const HOLD_SNAP_DURATION_MS = 280;

type HoldSource = 'keyboard' | 'touch' | null;

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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
}

function detectTouchDevice() {
  if (typeof window === 'undefined') {
    return false;
  }

  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export default function App() {
  const realtimeRef = useRef(new RealtimeClient());
  const visemeEngineRef = useRef(new StreamingVisemeEngine());
  const evalCollectorRef = useRef(new EvalCollector());

  const [connectionState, setConnectionState] = useState('idle');
  const [viseme, setViseme] = useState<VisemeKey>('rest');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [holdingToTalk, setHoldingToTalk] = useState(false);
  const [holdSource, setHoldSource] = useState<HoldSource>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [showHoldTooltip, setShowHoldTooltip] = useState(false);
  const [holdSnapActive, setHoldSnapActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTouchDevice] = useState(detectTouchDevice);

  // Track current streaming assistant message id
  const streamingMsgIdRef = useRef<string | null>(null);
  // Track pending user message placeholder (waiting for transcription)
  const pendingUserMsgIdRef = useRef<string | null>(null);
  const userMessageIdByItemIdRef = useRef<Record<string, string>>({});
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptedAssistantRef = useRef(false);
  const micLevelRafRef = useRef<number | null>(null);
  const micLevelRef = useRef(0);
  const holdSourceRef = useRef<HoldSource>(null);
  const tooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Word-by-word reveal state
  const wordRevealRef = useRef<{
    fullText: string;
    revealedWordCount: number;
    done: boolean;
  }>({ fullText: '', revealedWordCount: 0, done: false });
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingRef = useRef(false);
  const userSpeechStartedAtRef = useRef<number | null>(null);
  const lastUserSpeechDurationMsRef = useRef(0);
  const lastUserSpeechDuringTutorRef = useRef(false);

  const stopMicLevelLoop = useCallback(() => {
    if (micLevelRafRef.current != null) {
      cancelAnimationFrame(micLevelRafRef.current);
      micLevelRafRef.current = null;
    }
    micLevelRef.current = 0;
    setMicLevel(0);
  }, []);

  const startMicLevelLoop = useCallback(() => {
    if (micLevelRafRef.current != null) {
      return;
    }

    const tick = () => {
      const rawLevel = realtimeRef.current.readLocalMicLevel();
      const smoothedLevel = Math.max(rawLevel, micLevelRef.current * 0.82);
      micLevelRef.current = smoothedLevel;
      setMicLevel(smoothedLevel);
      micLevelRafRef.current = requestAnimationFrame(tick);
    };

    micLevelRafRef.current = requestAnimationFrame(tick);
  }, []);

  const clearTooltipTimers = useCallback(() => {
    if (tooltipShowTimerRef.current) {
      clearTimeout(tooltipShowTimerRef.current);
      tooltipShowTimerRef.current = null;
    }
    if (tooltipHideTimerRef.current) {
      clearTimeout(tooltipHideTimerRef.current);
      tooltipHideTimerRef.current = null;
    }
  }, []);

  const triggerHoldSnap = useCallback(() => {
    if (holdSnapTimerRef.current) {
      clearTimeout(holdSnapTimerRef.current);
    }

    setHoldSnapActive(true);
    holdSnapTimerRef.current = setTimeout(() => {
      setHoldSnapActive(false);
      holdSnapTimerRef.current = null;
    }, HOLD_SNAP_DURATION_MS);
  }, []);

  const endHoldToTalk = useCallback((source?: Exclude<HoldSource, null>) => {
    if (!holdSourceRef.current) {
      return;
    }

    if (source && holdSourceRef.current !== source) {
      return;
    }

    holdSourceRef.current = null;
    setHoldingToTalk(false);
    setHoldSource(null);
    setMuted(true);
    stopMicLevelLoop();
  }, [stopMicLevelLoop]);

  const beginHoldToTalk = useCallback((source: Exclude<HoldSource, null>) => {
    if (connectionState !== 'connected') {
      return;
    }

    if (holdSourceRef.current) {
      return;
    }

    if (!muted) {
      return;
    }

    if (speakingRef.current || streamingMsgIdRef.current) {
      interruptAssistantMessage();
      try {
        realtimeRef.current.interruptAssistantResponse();
      } catch {
        // Ignore channel state issues; local UI interruption should still proceed.
      }
    }

    holdSourceRef.current = source;
    setHoldingToTalk(true);
    setHoldSource(source);
    setMuted(false);
    triggerHoldSnap();
    startMicLevelLoop();
  }, [connectionState, muted, startMicLevelLoop, triggerHoldSnap]);

  useEffect(() => {
    realtimeRef.current.setLocalMicMuted(muted);
  }, [muted]);

  useEffect(() => {
    return () => {
      clearTooltipTimers();
      if (holdSnapTimerRef.current) {
        clearTimeout(holdSnapTimerRef.current);
      }
      stopMicLevelLoop();
      realtimeRef.current.disconnect();
      visemeEngineRef.current.dispose();
      evalCollectorRef.current.flush();
      stopWordRevealTimer();
    };
  }, [clearTooltipTimers, stopMicLevelLoop]);

  useEffect(() => {
    if (connectionState !== 'connected') {
      clearTooltipTimers();
      setShowHoldTooltip(false);
      return;
    }

    clearTooltipTimers();
    setShowHoldTooltip(false);

    tooltipShowTimerRef.current = setTimeout(() => {
      setShowHoldTooltip(true);
      tooltipHideTimerRef.current = setTimeout(() => {
        setShowHoldTooltip(false);
        tooltipHideTimerRef.current = null;
      }, HOLD_TOOLTIP_AUTO_HIDE_MS);
      tooltipShowTimerRef.current = null;
    }, HOLD_TOOLTIP_SHOW_DELAY_MS);

    return () => clearTooltipTimers();
  }, [clearTooltipTimers, connectionState]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') {
        return;
      }

      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }

      if (connectionState !== 'connected') {
        return;
      }

      event.preventDefault();
      beginHoldToTalk('keyboard');
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') {
        return;
      }

      if (holdSourceRef.current !== 'keyboard') {
        return;
      }

      event.preventDefault();
      endHoldToTalk('keyboard');
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [beginHoldToTalk, connectionState, endHoldToTalk]);

  useEffect(() => {
    function handleBlur() {
      endHoldToTalk();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        endHoldToTalk();
      }
    }

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [endHoldToTalk]);

  const showError = useCallback((msg: string) => {
    evalCollectorRef.current.markError('ui', msg);
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 8000);
  }, []);

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

  function resolvePendingUserMessage(text: string, itemId?: string) {
    const id = bindPendingUserMessageToItem(itemId) ?? pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((message) => (message.id === id ? { ...message, text, pending: false } : message)),
      );
      if (pendingUserMsgIdRef.current === id) {
        pendingUserMsgIdRef.current = null;
      }
      clearUserMessageItemBinding(id);
    } else {
      addUserMessage(text);
    }
  }

  function removePendingUserMessage(itemId?: string) {
    const id = bindPendingUserMessageToItem(itemId) ?? pendingUserMsgIdRef.current;
    if (id) {
      setMessages((prev) => prev.filter((message) => message.id !== id));
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

    if (happenedDuringTutorSpeech && speechDurationMs < 1200 && wordCount <= 3) {
      return true;
    }

    if (hasNonLatinLetters && !hasLatinLetters) {
      return true;
    }

    return false;
  }

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

  function bufferTranscriptDelta(delta: string) {
    if (!streamingMsgIdRef.current) {
      startAssistantMessage();
    }
    wordRevealRef.current.fullText += delta;
  }

  function markTranscriptDone() {
    wordRevealRef.current.done = true;
  }

  function revealNextWord() {
    const reveal = wordRevealRef.current;
    const id = streamingMsgIdRef.current;
    if (!id) return;

    const words = reveal.fullText.split(/(\s+)/);
    const totalTokens = words.length;
    if (reveal.revealedWordCount >= totalTokens) {
      if (reveal.done) {
        finalizeAssistantMessage();
      }
      return;
    }

    if (!speakingRef.current && !reveal.done) return;

    reveal.revealedWordCount += 1;
    const visibleText = words.slice(0, reveal.revealedWordCount).join('');

    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, text: visibleText } : message)),
    );

    if (reveal.done && reveal.revealedWordCount >= totalTokens) {
      finalizeAssistantMessage();
    }
  }

  function startWordRevealTimer() {
    stopWordRevealTimer();
    wordRevealTimerRef.current = setInterval(revealNextWord, 150);
  }

  function stopWordRevealTimer() {
    if (wordRevealTimerRef.current) {
      clearInterval(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }
  }

  function finalizeAssistantMessage() {
    const id = streamingMsgIdRef.current;
    if (!id) return;
    stopWordRevealTimer();
    const fullText = wordRevealRef.current.fullText;
    setMessages((prev) =>
      prev.map((message) => (message.id === id ? { ...message, text: fullText, streaming: false } : message)),
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
        return prev.filter((message) => message.id !== id);
      }
      return prev.map((message) => (message.id === id ? { ...message, text: visibleText, streaming: false } : message));
    });

    streamingMsgIdRef.current = null;
    interruptedAssistantRef.current = true;
    wordRevealRef.current = { fullText: '', revealedWordCount: 0, done: false };
  }

  async function startSession() {
    const evaluator = evalCollectorRef.current;
    evaluator.markSessionStart();
    evaluator.markConnectionAttempt();

    endHoldToTalk();
    setMuted(true);
    setShowHoldTooltip(false);
    setHoldSnapActive(false);
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

    endHoldToTalk();
    clearTooltipTimers();
    setShowHoldTooltip(false);
    if (holdSnapTimerRef.current) {
      clearTimeout(holdSnapTimerRef.current);
      holdSnapTimerRef.current = null;
    }
    setHoldSnapActive(false);
    setMuted(true);
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

    evalCollectorRef.current.flush();
  }

  async function handleRemoteAudio(_audio: HTMLAudioElement, stream: MediaStream) {
    evalCollectorRef.current.markFirstAudioFrame();
    await visemeEngineRef.current.attachToMediaStream(stream, handleAudioSnapshot, () => {});
  }

  function handleAudioSnapshot(snapshot: AudioAnalysisSnapshot) {
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

        resolvePendingUserMessage(transcript, itemId);
        lastUserSpeechDurationMsRef.current = 0;
        lastUserSpeechDuringTutorRef.current = false;
        break;
      }
      case 'conversation.item.input_audio_transcription.failed': {
        const itemId = (event as any).item_id as string | undefined;
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
        markTranscriptDone();
        break;
      }
      case 'response.done':
        evaluator.markTutorResponseEnd();
        if (interruptedAssistantRef.current) {
          interruptedAssistantRef.current = false;
          break;
        }
        if (streamingMsgIdRef.current) {
          markTranscriptDone();
        }
        break;
      case 'error': {
        const errorMsg = typeof event.error === 'object' ? JSON.stringify(event.error) : 'Realtime error';
        evaluator.markError('realtime', errorMsg, { event_type: event.type });
        showError(errorMsg);
        break;
      }
      default:
        break;
    }
  }

  async function sendText(text: string) {
    try {
      if (streamingMsgIdRef.current) {
        interruptAssistantMessage();
      }

      addUserMessage(text, { flush: true });
      visemeEngineRef.current.resetSpeechFrameFlag();
      realtimeRef.current.sendTextMessage(text);
    } catch (sendError) {
      showError(sendError instanceof Error ? sendError.message : 'Unable to send message');
    }
  }

  function toggleMute() {
    if (holdingToTalk) {
      endHoldToTalk();
      return;
    }

    setMuted((current) => !current);
  }

  const isConnected = connectionState === 'connected';
  const isActive = connectionState !== 'idle';
  const tooltipText = isTouchDevice ? 'Hold button to talk' : 'Hold space to talk';

  return (
    <main className="app-shell">
      {error && (
        <div className="error-toast" role="alert">
          <p>{error}</p>
          <button className="error-toast-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {!isActive ? (
        <section className="hero-panel">
          <header className="app-header app-header-centered">
            <span className="eyebrow">Live + AI</span>
            <h1>AI Tutor</h1>
          </header>
          <button className="start-orb" onClick={startSession}>Start</button>
        </section>
      ) : (
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
              holdingToTalk={holdingToTalk}
              micLevel={micLevel}
              showTooltip={showHoldTooltip}
              tooltipText={tooltipText}
              holdSnapActive={holdSnapActive}
              onStop={stopSession}
              onToggleMute={toggleMute}
              onHoldStart={() => beginHoldToTalk('touch')}
              onHoldEnd={() => endHoldToTalk('touch')}
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
