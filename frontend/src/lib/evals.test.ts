import { describe, expect, it, vi } from 'vitest';

import { EvalCollector } from './evals';

describe('EvalCollector', () => {
  it('uses explicit, generated, or query-string run ids, tracks events, and snapshots state', async () => {
    window.history.replaceState({}, '', '/');

    const generated = new EvalCollector();
    expect(generated.runId).toMatch(/^eval_/);

    window.history.replaceState({}, '', '/?eval_run_id=query-run');

    const explicit = new EvalCollector('manual-run');
    explicit.mark('started', { topic: 'math' });
    explicit.markFirst('once');
    explicit.markFirst('once');

    expect(window.__NERDY_EVAL__?.runId).toBe('manual-run');
    expect(explicit.snapshot()).toHaveLength(2);

    const flushSpy = vi.spyOn(explicit, 'flush').mockResolvedValue(undefined);
    await window.__NERDY_EVAL__?.flush();
    expect(flushSpy).toHaveBeenCalledOnce();

    const fromQuery = new EvalCollector();
    expect(fromQuery.runId).toBe('query-run');
  });

  it('flushes with sendBeacon when available and falls back to fetch', async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    const collector = new EvalCollector('beacon-run');
    collector.mark('beacon-event');
    await collector.flush();
    expect(sendBeacon).toHaveBeenCalledWith('/api/evals/client-events', expect.any(Blob));

    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    const fallback = new EvalCollector('fetch-run');
    fallback.mark('fetch-event');
    await fallback.flush();
    expect(fetch).toHaveBeenCalledWith(
      '/api/evals/client-events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );

    const empty = new EvalCollector('empty-run');
    await expect(empty.flush()).resolves.toBeUndefined();
  });

  it('falls back to fetch when sendBeacon throws', async () => {
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('beacon failed');
      }),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    const collector = new EvalCollector('fallback-run');
    collector.mark('event');
    await collector.flush();

    expect(fetch).toHaveBeenCalledOnce();
  });
});
