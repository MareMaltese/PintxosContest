import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

export interface CreatedEntry {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

export interface EntrySummary {
  id: string;
  number: number;
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
}

export interface EntryDetail extends EntrySummary {
  creatorName: string;
}


export const useEntriesStore = defineStore('entries', () => {
  const lastCreated = ref<CreatedEntry | null>(null);
  const list = ref<EntrySummary[]>([]);
  const isLoadingList = ref(false);
  const listError = ref<string | null>(null);
  const myList = ref<EntrySummary[]>([]);
  const isLoadingMine = ref(false);
  const mineError = ref<string | null>(null);

  function setLastCreated(entry: CreatedEntry): void {
    lastCreated.value = entry;
  }

  async function fetchList(): Promise<void> {
    isLoadingList.value = true;
    listError.value = null;
    try {
      list.value = await api.get<EntrySummary[]>('/api/entries');
    } catch (err) {
      listError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar la galería.';
      throw err;
    } finally {
      isLoadingList.value = false;
    }
  }

  async function fetchDetail(id: string): Promise<EntryDetail> {
    return api.get<EntryDetail>(`/api/entries/${id}`);
  }

  async function fetchMine(): Promise<void> {
    isLoadingMine.value = true;
    mineError.value = null;
    try {
      myList.value = await api.get<EntrySummary[]>('/api/entries/mine');
    } catch (err) {
      mineError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar tus tapas.';
    } finally {
      isLoadingMine.value = false;
    }
  }

  async function updateMine(id: string, form: FormData): Promise<void> {
    await api.patchForm(`/api/entries/${id}`, form);
    await fetchMine();
  }

  async function deleteMine(id: string): Promise<void> {
    await api.delete(`/api/entries/${id}`);
    await fetchMine();
  }

  return {
    lastCreated,
    list,
    isLoadingList,
    listError,
    myList,
    isLoadingMine,
    mineError,
    setLastCreated,
    fetchList,
    fetchDetail,
    fetchMine,
    updateMine,
    deleteMine,
  };
});
