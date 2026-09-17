import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectContestStream } from './sse';

class FakeEventSource {
  listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  constructor(public url: string) {}
  addEventListener(type: string, cb: (e: { data: string }) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  emit(type: string, data: unknown): void {
    for (const cb of this.listeners[type] ?? []) cb({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
});

describe('connectContestStream', () => {
  it('connects to the contest SSE endpoint', () => {
    const source = connectContestStream(() => {}) as unknown as FakeEventSource;
    expect(source.url).toBe('/api/contest/stream');
  });

  it('forwards phase-changed events to the callback', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.emit('phase-changed', { phase: 'VOTING' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'phase-changed', data: { phase: 'VOTING' } });
  });

  it('forwards results-revealed and tiebreak-round-changed events too', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.emit('results-revealed', { revealedAt: '2026-09-17T10:00:00.000Z' });
    source.emit('tiebreak-round-changed', { phase: 'TIEBREAK' });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('ignores events with invalid JSON payloads', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.listeners['phase-changed'][0]({ data: 'not json' });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
