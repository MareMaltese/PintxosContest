import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

export type Medal = 'GOLD' | 'SILVER' | 'BRONZE';

interface MyMedalsResponse {
  gold: string | null;
  silver: string | null;
  bronze: string | null;
}

export const useMedalVotesStore = defineStore('medalVotes', () => {
  const gold = ref<string | null>(null);
  const silver = ref<string | null>(null);
  const bronze = ref<string | null>(null);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  function medalFor(entryId: string): Medal | null {
    if (gold.value === entryId) return 'GOLD';
    if (silver.value === entryId) return 'SILVER';
    if (bronze.value === entryId) return 'BRONZE';
    return null;
  }

  async function init(): Promise<void> {
    if (loaded.value) return;
    const data = await api.get<MyMedalsResponse>('/api/medal-votes/me');
    gold.value = data.gold;
    silver.value = data.silver;
    bronze.value = data.bronze;
    loaded.value = true;
  }

  async function setMedal(entryId: string, medal: Medal | null): Promise<void> {
    error.value = null;
    const prev = { gold: gold.value, silver: silver.value, bronze: bronze.value };

    if (gold.value === entryId) gold.value = null;
    if (silver.value === entryId) silver.value = null;
    if (bronze.value === entryId) bronze.value = null;
    if (medal === 'GOLD') gold.value = entryId;
    if (medal === 'SILVER') silver.value = entryId;
    if (medal === 'BRONZE') bronze.value = entryId;

    try {
      await api.put(`/api/medal-votes/${entryId}`, { medal });
    } catch (err) {
      gold.value = prev.gold;
      silver.value = prev.silver;
      bronze.value = prev.bronze;
      error.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
    }
  }

  return { gold, silver, bronze, loaded, error, medalFor, init, setMedal };
});
