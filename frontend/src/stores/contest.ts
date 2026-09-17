import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api';
import { connectContestStream } from '../services/sse';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';

interface ContestResponse {
  phase: ContestPhase;
  allowSelfVote: boolean;
}

export const useContestStore = defineStore('contest', () => {
  const phase = ref<ContestPhase>('REGISTRATION');
  const allowSelfVote = ref(false);
  const loaded = ref(false);

  async function init(): Promise<void> {
    const data = await api.get<ContestResponse>('/api/contest');
    phase.value = data.phase;
    allowSelfVote.value = data.allowSelfVote;
    loaded.value = true;

    connectContestStream((event) => {
      if (event.type === 'phase-changed' && typeof event.data.phase === 'string') {
        phase.value = event.data.phase as ContestPhase;
      }
    });
  }

  return { phase, allowSelfVote, loaded, init };
});
