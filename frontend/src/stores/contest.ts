import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api';
import { connectContestStream } from '../services/sse';
import { useEntriesStore } from './entries';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';
export type VotingMode = 'FAVORITES' | 'MEDALS';

interface ContestResponse {
  phase: ContestPhase;
  allowSelfVote: boolean;
  votingMode: VotingMode;
}

export const useContestStore = defineStore('contest', () => {
  const phase = ref<ContestPhase>('REGISTRATION');
  const allowSelfVote = ref(false);
  const votingMode = ref<VotingMode>('FAVORITES');
  const loaded = ref(false);
  const resultsRevealedAt = ref<string | null>(null);

  async function init(): Promise<void> {
    const data = await api.get<ContestResponse>('/api/contest');
    phase.value = data.phase;
    allowSelfVote.value = data.allowSelfVote;
    votingMode.value = data.votingMode;
    loaded.value = true;

    connectContestStream((event) => {
      if (event.type === 'phase-changed' && typeof event.data.phase === 'string') {
        phase.value = event.data.phase as ContestPhase;
      }
      if (event.type === 'entries-changed') {
        useEntriesStore().refreshList();
      }
      if (event.type === 'results-revealed' && typeof event.data.revealedAt === 'string') {
        resultsRevealedAt.value = event.data.revealedAt;
      }
    });
  }

  return { phase, allowSelfVote, votingMode, loaded, resultsRevealedAt, init };
});
