import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface AdminMedalStanding {
  entryId: string;
  number: number;
  name: string | null;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

const POLL_INTERVAL_MS = 7000;

export function useAdminMedalVotes() {
  const data = ref<AdminMedalStanding[] | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<AdminMedalStanding[]>('/api/admin/medal-votes');
      error.value = null;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el recuento.';
    } finally {
      isLoading.value = false;
    }
  }

  onMounted(() => {
    refetch();
    timer = setInterval(refetch, POLL_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { data, isLoading, error, refetch };
}
