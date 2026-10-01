import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

export const useRankingVotesStore = defineStore('rankingVotes', () => {
  // The user's saved ordering, best first. Empty until they save it for the first time.
  const order = ref<string[]>([]);
  const loaded = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  async function init(): Promise<void> {
    if (loaded.value) return;
    const data = await api.get<{ entryIds: string[] }>('/api/ranking-votes/me');
    order.value = data.entryIds;
    loaded.value = true;
  }

  // Saves are chained so quick successive drags reach the server in order: each PUT
  // replaces the whole ranking, so an older one landing last would undo the newer.
  let queue: Promise<void> = Promise.resolve();

  async function persist(entryIds: string[]): Promise<void> {
    isSaving.value = true;
    try {
      await api.put('/api/ranking-votes/me', { entryIds });
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu clasificación.';
      try {
        order.value = (await api.get<{ entryIds: string[] }>('/api/ranking-votes/me')).entryIds;
      } catch {
        // nos quedamos con el orden local; el error ya se muestra
      }
    } finally {
      isSaving.value = false;
    }
  }

  function save(entryIds: string[]): Promise<void> {
    error.value = null;
    order.value = entryIds;
    queue = queue.then(() => persist(entryIds));
    return queue;
  }

  return { order, loaded, isSaving, error, init, save };
});
