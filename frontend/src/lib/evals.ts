export type EvalEvent = {
  eval_run_id?: string;
  name: string;
  at_ms: number;
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