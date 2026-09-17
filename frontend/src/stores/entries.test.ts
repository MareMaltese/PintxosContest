import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useEntriesStore } from './entries';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useEntriesStore', () => {
  it('starts with no last-created entry', () => {
    expect(useEntriesStore().lastCreated).toBeNull();
  });

  it('setLastCreated stores the entry', () => {
    const store = useEntriesStore();
    store.setLastCreated({ id: 'e1', number: 7, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    expect(store.lastCreated).toEqual({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
  });

  it('fetchList populates the list on success', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const store = useEntriesStore();

    await store.fetchList();

    expect(store.list).toHaveLength(1);
    expect(store.isLoadingList).toBe(false);
    expect(store.listError).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/api/entries');
  });

  it('fetchList surfaces a friendly error and rethrows on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    const store = useEntriesStore();

    await expect(store.fetchList()).rejects.toThrow();

    expect(store.listError).toBe('Ha ocurrido un error inesperado.');
    expect(store.isLoadingList).toBe(false);
  });

  it('fetchDetail returns the entry detail without touching list state', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 1,
      creatorId: 'u1',
      creatorName: 'Laura',
      name: null,
      description: null,
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const store = useEntriesStore();

    const detail = await store.fetchDetail('e1');

    expect(detail.creatorName).toBe('Laura');
    expect(api.get).toHaveBeenCalledWith('/api/entries/e1');
    expect(store.list).toEqual([]);
  });

  it('fetchMine populates myList on success', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta', description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const store = useEntriesStore();

    await store.fetchMine();

    expect(store.myList).toHaveLength(1);
    expect(store.isLoadingMine).toBe(false);
    expect(store.mineError).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/api/entries/mine');
  });

  it('fetchMine surfaces a friendly error on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    const store = useEntriesStore();

    await store.fetchMine();

    expect(store.mineError).toBe('Ha ocurrido un error inesperado.');
    expect(store.isLoadingMine).toBe(false);
  });

  it('updateMine patches the entry and refreshes myList', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta de jamón', description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    vi.mocked(api.patch).mockResolvedValue({});
    const store = useEntriesStore();

    await store.updateMine('e1', { name: 'Croqueta de jamón' });

    expect(api.patch).toHaveBeenCalledWith('/api/entries/e1', { name: 'Croqueta de jamón' });
    expect(store.myList[0].name).toBe('Croqueta de jamón');
  });
});
