import { describe, expect, it, vi, beforeEach } from 'vitest';

import { EvalCollector } from './evals';

describe('EvalCollector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
  });

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

  it('tracks performance with timers and session lifecycle', () => {
    const collector = new EvalCollector('perf-test');
    
    // Test timer functionality
    collector.startTimer('test_operation', { context: 'test' });
    vi.advanceTimersByTime(500);
    collector.endTimer('test_operation', { result: 'success' });
    
    const events = collector.snapshot();
    const durationEvent = events.find(e => e.name === 'test_operation_duration');
    
    expect(durationEvent).toBeDefined();
    expect(durationEvent?.meta?.duration_ms).toBe(500);
    expect(durationEvent?.meta?.context).toBe('test');
    expect(durationEvent?.meta?.result).toBe('success');
  });

  it('tracks session lifecycle and connection events', () => {
    const collector = new EvalCollector('session-test');
    
    collector.markSessionStart();
    collector.markConnectionAttempt();
    collector.markConnectionSuccess();
    collector.markFirstAudioFrame();
    collector.markSessionEnd();
    
    const events = collector.snapshot();
    
    expect(events.find(e => e.name === 'session_start')).toBeDefined();
    expect(events.find(e => e.name === 'connection_attempt')).toBeDefined();
    expect(events.find(e => e.name === 'connection_success')).toBeDefined();
    expect(events.find(e => e.name === 'first_audio_frame')).toBeDefined();
    expect(events.find(e => e.name === 'session_end')).toBeDefined();
    
    // Verify we have all the expected session events
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it('tracks speech and response latency', () => {
    const collector = new EvalCollector('speech-test');
    
    collector.markSpeechStart();
    vi.advanceTimersByTime(2000); // 2 second speech
    collector.markSpeechEnd();
    
    vi.advanceTimersByTime(800); // 800ms processing delay
    collector.markTutorResponseStart();
    collector.markTutorResponseEnd(); // Test response end tracking
    
    const events = collector.snapshot();
    
    expect(events.find(e => e.name === 'user_speech_start')).toBeDefined();
    expect(events.find(e => e.name === 'user_speech_end')).toBeDefined();
    expect(events.find(e => e.name === 'tutor_response_end')).toBeDefined();
    
    const responseEvent = events.find(e => e.name === 'tutor_response_start');
    expect(responseEvent).toBeDefined();
    expect(responseEvent?.meta?.response_latency_ms).toBe(800);
  });

  it('tracks UI performance and animations', () => {
    const collector = new EvalCollector('ui-test');
    
    // Track smooth animation (60fps)
    collector.markAnimationFrame('avatar_mouth', 15.5);
    
    // Track choppy animation
    collector.markAnimationFrame('avatar_eyes', 45.2);
    
    // Track UI event
    collector.markUIEvent('button_click', 2.3, { button: 'start' });
    
    const events = collector.snapshot();
    
    const smoothAnim = events.find(e => e.name === 'ui_animation_avatar_mouth');
    expect(smoothAnim?.meta?.target_60fps).toBe(true);
    expect(smoothAnim?.meta?.smooth).toBe(true);
    
    const choppyAnim = events.find(e => e.name === 'ui_animation_avatar_eyes');
    expect(choppyAnim?.meta?.target_60fps).toBe(false);
    expect(choppyAnim?.meta?.smooth).toBe(false);
    
    const clickEvent = events.find(e => e.name === 'ui_button_click');
    expect(clickEvent?.meta?.button).toBe('start');
    expect(clickEvent?.meta?.duration_ms).toBe(2.3);
  });

  it('tracks errors with context', () => {
    const collector = new EvalCollector('error-test');
    
    collector.markError('connection', 'WebRTC connection failed', { 
      attempt: 3, 
      browser: 'Chrome' 
    });
    
    collector.markError('audio', 'Microphone permission denied');
    
    const events = collector.snapshot();
    
    const connectionError = events.find(e => e.name === 'error_connection');
    expect(connectionError?.meta?.error_message).toBe('WebRTC connection failed');
    expect(connectionError?.meta?.attempt).toBe(3);
    expect(connectionError?.meta?.browser).toBe('Chrome');
    
    const audioError = events.find(e => e.name === 'error_audio');
    expect(audioError?.meta?.error_message).toBe('Microphone permission denied');
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

  it('handles timer edge cases and missing operations', () => {
    const collector = new EvalCollector('edge-case-test');
    
    // Try to end a timer that wasn't started
    collector.endTimer('nonexistent_timer');
    
    // Mark speech events in sequence
    collector.markSpeechStart();
    collector.markSpeechEnd();
    collector.markTutorResponseStart(); // Should include latency calculation
    
    // Mark response without prior speech
    const emptyCollector = new EvalCollector('empty-test');
    emptyCollector.markTutorResponseStart(); // Should work without lastSpeechEnd
    
    const events = collector.snapshot();
    expect(events.length).toBeGreaterThan(0);
  });

  it('tracks connection failures and different event types', () => {
    const collector = new EvalCollector('connection-test');
    
    collector.markConnectionAttempt();
    collector.markConnectionFailure('Network timeout');
    collector.markFirstAudioFrame(); // Should only fire once due to markFirst
    collector.markFirstAudioFrame(); // Should be ignored
    
    const events = collector.snapshot();
    
    expect(events.find(e => e.name === 'connection_failure')).toBeDefined();
    expect(events.filter(e => e.name === 'first_audio_frame')).toHaveLength(1);
  });
});
