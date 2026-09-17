import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface CreatedEntry {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

export const useEntriesStore = defineStore('entries', () => {
  const lastCreated = ref<CreatedEntry | null>(null);

  function setLastCreated(entry: CreatedEntry): void {
    lastCreated.value = entry;
  }

  return { lastCreated, setLastCreated };
});
