import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

interface MyVotesResponse {
  entryIds: string[];
  limit: number;
}

export const useVotesStore = defineStore('votes', () => {
  const favoriteIds = ref<Set<string>>(new Set());
  const limit = ref(0);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  function isFavorite(entryId: string): boolean {
    return favoriteIds.value.has(entryId);
  }

  async function init(): Promise<void> {
    if (loaded.value) return;
    const data = await api.get<MyVotesResponse>('/api/votes/me');
    favoriteIds.value = new Set(data.entryIds);
    limit.value = data.limit;
    loaded.value = true;
  }

  async function toggle(entryId: string): Promise<void> {
    error.value = null;
    const wasFavorite = isFavorite(entryId);
    const next = new Set(favoriteIds.value);
    if (wasFavorite) {
      next.delete(entryId);
    } else {
      next.add(entryId);
    }
    favoriteIds.value = next;

    try {
      if (wasFavorite) {
        await api.delete(`/api/votes/${entryId}`);
      } else {
        await api.post('/api/votes', { entryId });
      }
    } catch (err) {
      favoriteIds.value = favoriteIds.value.has(entryId)
        ? new Set([...favoriteIds.value].filter((id) => id !== entryId))
        : new Set([...favoriteIds.value, entryId]);
      error.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
    }
  }

  return { favoriteIds, limit, loaded, error, isFavorite, init, toggle };
});
