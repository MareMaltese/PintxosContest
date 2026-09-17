import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useVotesStore } from './votes';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useVotesStore', () => {
  it('starts unloaded with no favorites', () => {
    const store = useVotesStore();
    expect(store.loaded).toBe(false);
    expect(store.favoriteIds.size).toBe(0);
    expect(store.limit).toBe(0);
  });

  it('init loads favorites and limit from the server', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1', 'e2'], limit: 3 });
    const store = useVotesStore();

    await store.init();

    expect(api.get).toHaveBeenCalledWith('/api/votes/me');
    expect(store.loaded).toBe(true);
    expect(store.limit).toBe(3);
    expect(store.isFavorite('e1')).toBe(true);
    expect(store.isFavorite('e3')).toBe(false);
  });

  it('init only fetches once even if called twice', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    const store = useVotesStore();

    await store.init();
    await store.init();

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('toggle adds a favorite optimistically and confirms via POST', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(api.post).toHaveBeenCalledWith('/api/votes', { entryId: 'e1' });
    expect(store.isFavorite('e1')).toBe(true);
    expect(store.error).toBeNull();
  });

  it('toggle removes an existing favorite via DELETE', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1'], limit: 3 });
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(api.delete).toHaveBeenCalledWith('/api/votes/e1');
    expect(store.isFavorite('e1')).toBe(false);
  });

  it('toggle reverts the optimistic add and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(409, 'FAVORITES_LIMIT_REACHED', 'Ya has elegido tus 3 pinchos favoritos.')
    );
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(store.isFavorite('e1')).toBe(false);
    expect(store.error).toBe('Ya has elegido tus 3 pinchos favoritos.');
  });

  it('toggle reverts the optimistic remove and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1'], limit: 3 });
    vi.mocked(api.delete).mockRejectedValue(new ApiError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.'));
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(store.isFavorite('e1')).toBe(true);
    expect(store.error).toBe('La votación no está abierta ahora mismo.');
  });
});
