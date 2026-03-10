export type EvalEvent = {
  eval_run_id?: string;
  name: string;
  at_ms: number;
  meta?: Record<string, unknown>;
};

export type PerformanceMarker = {
  name: string;
  timestamp: number;
  duration?: number;
  meta?: Record<string, unknown>;
};

declare global {
  interface Window {
    __NERDY_EVAL__?: {
      runId: string;
      events: EvalEvent[];
      flush: () => Promise<void>;
    };
  }
}

function createRunId() {
  return `eval_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class EvalCollector {
  readonly runId: string;
  private readonly startedAt = performance.now();
  private readonly events: EvalEvent[] = [];
  private firstSeen = new Set<string>();
  private performanceMarkers = new Map<string, PerformanceMarker>();
  private sessionStartTime?: number;
  private lastSpeechEnd?: number;

  constructor(runId?: string) {
    const params = new URLSearchParams(window.location.search);
    this.runId = runId ?? params.get('eval_run_id') ?? createRunId();
    window.__NERDY_EVAL__ = {
      runId: this.runId,
      events: this.events,
      flush: async () => this.flush(),
    };
  }

  mark(name: string, meta?: Record<string, unknown>) {
    this.events.push({
      eval_run_id: this.runId,
      name,
      at_ms: Number((performance.now() - this.startedAt).toFixed(2)),
      meta,
    });
  }

  markFirst(name: string, meta?: Record<string, unknown>) {
    if (this.firstSeen.has(name)) return;
    this.firstSeen.add(name);
    this.mark(name, meta);
  }

  // Performance tracking methods
  startTimer(name: string, meta?: Record<string, unknown>) {
    this.performanceMarkers.set(name, {
      name,
      timestamp: performance.now(),
      meta
    });
  }

  endTimer(name: string, meta?: Record<string, unknown>) {
    const start = this.performanceMarkers.get(name);
    if (!start) {
      console.warn(`No timer started for: ${name}`);
      return;
    }
    
    const duration = performance.now() - start.timestamp;
    this.mark(`${name}_duration`, {
      ...start.meta,
      ...meta,
      duration_ms: Number(duration.toFixed(2))
    });
    
    this.performanceMarkers.delete(name);
  }

  // Session lifecycle tracking
  markSessionStart() {
    this.sessionStartTime = performance.now();
    this.mark('session_start');
  }

  markSessionEnd() {
    this.mark('session_end');
    if (this.sessionStartTime) {
      const duration = performance.now() - this.sessionStartTime;
      this.mark('session_total_duration', { duration_ms: Number(duration.toFixed(2)) });
    }
  }

  // Connection and audio tracking
  markConnectionAttempt() {
    this.startTimer('connection');
    this.mark('connection_attempt');
  }

  markConnectionSuccess() {
    this.endTimer('connection');
    this.mark('connection_success');
  }

  markConnectionFailure(error: string) {
    this.endTimer('connection');
    this.mark('connection_failure', { error });
  }

  markFirstAudioFrame() {
    this.markFirst('first_audio_frame');
  }

  markSpeechStart() {
    this.startTimer('user_speech');
    this.mark('user_speech_start');
  }

  markSpeechEnd() {
    this.endTimer('user_speech');
    this.lastSpeechEnd = performance.now() - this.startedAt;
    this.mark('user_speech_end');
  }

  markTutorResponseStart() {
    if (this.lastSpeechEnd) {
      const responseLatency = (performance.now() - this.startedAt) - this.lastSpeechEnd;
      this.mark('tutor_response_start', { 
        response_latency_ms: Number(responseLatency.toFixed(2))
      });
    } else {
      this.mark('tutor_response_start');
    }
  }

  markTutorResponseEnd() {
    this.mark('tutor_response_end');
  }

  // UI performance tracking
  markAnimationFrame(animationName: string, duration: number) {
    this.mark(`ui_animation_${animationName}`, {
      animation: animationName,
      duration_ms: Number(duration.toFixed(2)),
      target_60fps: duration <= 16.7,
      smooth: duration <= 33.3
    });
  }

  markUIEvent(eventName: string, duration?: number, meta?: Record<string, unknown>) {
    this.mark(`ui_${eventName}`, {
      ...meta,
      ...(duration && { duration_ms: Number(duration.toFixed(2)) })
    });
  }

  // Error tracking
  markError(errorType: string, message: string, context?: Record<string, unknown>) {
    this.mark(`error_${errorType}`, {
      error_message: message,
      ...context
    });
  }

  snapshot() {
    return [...this.events];
  }

  async flush() {
    if (this.events.length === 0) return;
    const body = JSON.stringify({
      source: 'frontend',
      events: this.events,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/evals/client-events', blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    await fetch('/api/evals/client-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  }
}