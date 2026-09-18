<script setup lang="ts">
import { ref, watch } from 'vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';
import { api, ApiError } from '../../services/api';
import Icon from './Icon.vue';

interface FavoriteWinner {
  entryId: string;
  number: number;
  name: string | null;
  rank: number;
}

interface MedalWinner {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
}

const contest = useContestStore();
const session = useSessionStore();

const showModal = ref(false);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
const favoriteWinners = ref<FavoriteWinner[]>([]);
const medalWinners = ref<MedalWinner[]>([]);

let previousPhase = contest.phase;

watch(
  () => contest.phase,
  (phase) => {
    if (session.user && previousPhase !== 'RESULTS' && phase === 'RESULTS') {
      showModal.value = true;
      loadWinners();
    }
    previousPhase = phase;
  }
);

async function loadWinners(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    if (contest.votingMode === 'MEDALS') {
      const data = await api.get<{ podium: MedalWinner[] }>('/api/medal-votes/results');
      medalWinners.value = data.podium;
    } else {
      const data = await api.get<{ standings: FavoriteWinner[] }>('/api/results');
      favoriteWinners.value = data.standings.filter((s) => s.rank <= 3);
    }
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar los ganadores.';
  } finally {
    isLoading.value = false;
  }
}

function dismiss(): void {
  showModal.value = false;
}
</script>

<template>
  <div
    v-if="showModal"
    class="results-revealed-modal"
    @click="dismiss"
  >
    <div
      class="results-revealed-modal__card"
      @click.stop
    >
      <Icon
        name="crown"
        :size="64"
      />
      <h2 class="results-revealed-modal__title">
        ¡Votación finalizada!
      </h2>

      <p
        v-if="isLoading"
        class="results-revealed-modal__status"
      >
        Cargando ganadores…
      </p>
      <p
        v-else-if="loadError"
        class="results-revealed-modal__status results-revealed-modal__status--error"
      >
        {{ loadError }}
      </p>

      <ol
        v-else-if="contest.votingMode === 'MEDALS'"
        class="results-revealed-modal__list"
      >
        <li
          v-for="winner in medalWinners"
          :key="winner.entryId"
          class="results-revealed-modal__item"
        >
          <span
            class="results-revealed-modal__medal"
            :class="`results-revealed-modal__medal--${winner.medal.toLowerCase()}`"
          >
            <Icon
              name="medal"
              :size="18"
            />
          </span>
          <span>#{{ String(winner.number).padStart(2, '0') }} — {{ winner.creatorName }}</span>
        </li>
      </ol>
      <ol
        v-else
        class="results-revealed-modal__list"
      >
        <li
          v-for="winner in favoriteWinners"
          :key="winner.entryId"
          class="results-revealed-modal__item"
        >
          <span class="results-revealed-modal__rank">{{ winner.rank }}º</span>
          <span>#{{ String(winner.number).padStart(2, '0') }}<template v-if="winner.name"> — {{ winner.name }}</template></span>
        </li>
      </ol>

      <button
        class="button button--primary results-revealed-modal__dismiss"
        type="button"
        @click="dismiss"
      >
        Vale
      </button>
    </div>
  </div>
</template>

<style scoped>
.results-revealed-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-5);
}

.results-revealed-modal__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 380px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-gold);
}

.results-revealed-modal__title {
  font-size: 1.6rem;
  margin: var(--space-2) 0 var(--space-3);
  color: var(--color-text);
}

.results-revealed-modal__status {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-3);
}

.results-revealed-modal__status--error {
  color: var(--color-danger);
}

.results-revealed-modal__list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-4);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.results-revealed-modal__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
  font-weight: 600;
  text-align: left;
}

.results-revealed-modal__rank {
  font-weight: 700;
  color: var(--color-gold);
  min-width: 1.5em;
}

.results-revealed-modal__medal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  color: #fff;
}

.results-revealed-modal__medal--gold {
  background: var(--color-gold);
}

.results-revealed-modal__medal--silver {
  background: var(--color-silver);
}

.results-revealed-modal__medal--bronze {
  background: var(--color-bronze);
}
</style>
