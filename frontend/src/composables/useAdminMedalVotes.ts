import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface AdminMedalStanding {
  entryId: string;
  number: number;
  name: string | null;
  imagePath: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface PendingWorstTie {
  targetRank: number;
  candidateEntryIds: string[];
}

export interface AdminMedalVotesData {
  standings: AdminMedalStanding[];
  pendingWorstTie: PendingWorstTie | null;
  worstEntryId: string | null;
  worstPrizeEnabled: boolean;
}

const POLL_INTERVAL_MS = 7000;

export function useAdminMedalVotes() {
  const data = ref<AdminMedalVotesData | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<AdminMedalVotesData>('/api/admin/medal-votes');
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
