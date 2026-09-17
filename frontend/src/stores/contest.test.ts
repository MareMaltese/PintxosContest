import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const connectMock = vi.fn();
vi.mock('../services/sse', () => ({
  connectContestStream: (cb: (e: { type: string; data: Record<string, unknown> }) => void) => {
    connectMock(cb);
    return {} as EventSource;
  },
}));

import { api } from '../services/api';
import { useContestStore } from './contest';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useContestStore', () => {
  it('starts in REGISTRATION before init()', () => {
    const store = useContestStore();
    expect(store.phase).toBe('REGISTRATION');
    expect(store.loaded).toBe(false);
  });

  it('init() loads the current phase and connects the SSE stream', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'VOTING', allowSelfVote: true });
    const store = useContestStore();

    await store.init();

    expect(store.phase).toBe('VOTING');
    expect(store.allowSelfVote).toBe(true);
    expect(store.loaded).toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('updates phase when the SSE stream reports a phase-changed event', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'REGISTRATION', allowSelfVote: false });
    const store = useContestStore();
    await store.init();

    const handler = connectMock.mock.calls[0][0];
    handler({ type: 'phase-changed', data: { phase: 'TIEBREAK' } });

    expect(store.phase).toBe('TIEBREAK');
  });

  it('ignores non-phase-changed SSE events', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'VOTING', allowSelfVote: false });
    const store = useContestStore();
    await store.init();

    const handler = connectMock.mock.calls[0][0];
    handler({ type: 'results-revealed', data: { revealedAt: 'x' } });

    expect(store.phase).toBe('VOTING');
  });
});
