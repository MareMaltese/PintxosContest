import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useMedalVotesStore } from './medalVotes';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useMedalVotesStore', () => {
  it('starts unloaded with no medals assigned', () => {
    const store = useMedalVotesStore();
    expect(store.loaded).toBe(false);
    expect(store.gold).toBeNull();
    expect(store.medalFor('e1')).toBeNull();
  });

  it('init loads the current medals from the server', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: 'e2' });
    const store = useMedalVotesStore();

    await store.init();

    expect(api.get).toHaveBeenCalledWith('/api/medal-votes/me');
    expect(store.loaded).toBe(true);
    expect(store.medalFor('e1')).toBe('GOLD');
    expect(store.medalFor('e2')).toBe('BRONZE');
    expect(store.medalFor('e3')).toBeNull();
  });

  it('init only fetches once even if called twice', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    const store = useMedalVotesStore();
    await store.init();
    await store.init();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('setMedal assigns a medal optimistically and confirms via PUT', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', 'GOLD');

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(store.medalFor('e1')).toBe('GOLD');
    expect(store.error).toBeNull();
  });

  it('setMedal moves a medal away from its previous entry', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e2', 'GOLD');

    expect(store.medalFor('e1')).toBeNull();
    expect(store.medalFor('e2')).toBe('GOLD');
  });

  it('setMedal(entryId, null) clears the medal', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', null);

    expect(store.medalFor('e1')).toBeNull();
  });

  it('reverts the optimistic change and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    vi.mocked(api.put).mockRejectedValue(new ApiError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.'));
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', 'GOLD');

    expect(store.medalFor('e1')).toBeNull();
    expect(store.error).toBe('La votación no está abierta ahora mismo.');
  });
});
