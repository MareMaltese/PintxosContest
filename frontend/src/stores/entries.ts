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

  return { lastCreated, list, isLoadingList, listError, setLastCreated, fetchList, fetchDetail };
});
