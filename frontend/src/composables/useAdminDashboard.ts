import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface AdminPerson {
  id: string;
  name: string;
  entryNumbers: number[];
  votedCount: number;
  voteLimit: number;
  hasFinishedVoting: boolean;
  lastSeen: string;
}

export interface AdminDashboardData {
  phase: 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';
  allowSelfVote: boolean;
  votingMode: 'FAVORITES' | 'MEDALS';
  resultsRevealedAt: string | null;
  participantCount: number;
  entryCount: number;
  votersFinished: number;
  votersTotal: number;
  people: AdminPerson[];
}

const POLL_INTERVAL_MS = 7000;

export function useAdminDashboard() {
  const data = ref<AdminDashboardData | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<AdminDashboardData>('/api/admin/dashboard');
      error.value = null;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el panel.';
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
