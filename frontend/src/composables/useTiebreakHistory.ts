import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface TiebreakHistoryCandidate {
  entryId: string;
  number: number;
  name: string | null;
  votes: number;
}

export interface TiebreakVoteLogEntry {
  userName: string;
  entryNumber: number;
  createdAt: string;
}

export interface TiebreakHistoryRound {
  id: string;
  roundNumber: number;
  kind: 'MAIN' | 'MEDAL';
  targetRank: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
  candidates: TiebreakHistoryCandidate[];
  votes: TiebreakVoteLogEntry[];
  result: 'RESOLVED' | 'STILL_TIED' | null;
  winnerEntryId?: string;
}

const POLL_INTERVAL_MS = 7000;

export function useTiebreakHistory() {
  const data = ref<TiebreakHistoryRound[]>([]);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<TiebreakHistoryRound[]>('/api/admin/tiebreak/history');
      error.value = null;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el historial.';
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
