import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useRankingVotesStore } from './rankingVotes';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useRankingVotesStore', () => {
  it('init loads the saved ordering once', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e2', 'e1'] });
    const store = useRankingVotesStore();

    await store.init();
    await store.init();

    expect(store.order).toEqual(['e2', 'e1']);
    expect(store.loaded).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('save updates the order optimistically and sends the whole list', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useRankingVotesStore();

    const pending = store.save(['e1', 'e2']);
    expect(store.order).toEqual(['e1', 'e2']);
    await pending;

    expect(api.put).toHaveBeenCalledWith('/api/ranking-votes/me', { entryIds: ['e1', 'e2'] });
    expect(store.error).toBeNull();
  });

  it('sends successive saves in order', async () => {
    const calls: string[][] = [];
    vi.mocked(api.put).mockImplementation(async (_path, body) => {
      calls.push((body as { entryIds: string[] }).entryIds);
      await new Promise((resolve) => setTimeout(resolve, calls.length === 1 ? 20 : 0));
      return { ok: true };
    });
    const store = useRankingVotesStore();

    store.save(['a', 'b']);
    await store.save(['b', 'a']);

    expect(calls).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ]);
  });

  it('on failure shows the error and restores the server ordering', async () => {
    vi.mocked(api.put).mockRejectedValue(new ApiError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta.'));
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e2', 'e1'] });
    const store = useRankingVotesStore();

    await store.save(['e1', 'e2']);

    expect(store.error).toBe('La votación no está abierta.');
    expect(store.order).toEqual(['e2', 'e1']);
  });
});
