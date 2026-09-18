<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import Icon from '../components/common/Icon.vue';
import { api, ApiError } from '../services/api';
import { tiebreakRoundLabel } from '../utils/tiebreakLabels';

interface TiebreakCandidate {
  id: string;
  number: number;
  name: string | null;
  imagePath: string;
}

interface TiebreakRoundInfo {
  id: string;
  targetRank: number;
  kind: 'MAIN' | 'MEDAL';
  status: string;
}

interface CurrentRound {
  round: TiebreakRoundInfo;
  candidates: TiebreakCandidate[];
}

const POLL_INTERVAL_MS = 5000;

const current = ref<CurrentRound | null>(null);
const isLoading = ref(true);
const isWaitingForAdmin = ref(false);
const loadError = ref<string | null>(null);
const hasVoted = ref(false);
const voteError = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  loadError.value = null;
  try {
    current.value = await api.get<CurrentRound>('/api/tiebreak/current');
    isWaitingForAdmin.value = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  } catch (err) {
    if (err instanceof ApiError && err.code === 'NO_OPEN_ROUND') {
      isWaitingForAdmin.value = true;
      if (!pollTimer) {
        pollTimer = setInterval(load, POLL_INTERVAL_MS);
      }
    } else {
      loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el desempate.';
    }
  } finally {
    isLoading.value = false;
  }
}

async function vote(entryId: string): Promise<void> {
  voteError.value = null;
  try {
    await api.post('/api/tiebreak/vote', { entryId });
    hasVoted.value = true;
  } catch (err) {
    voteError.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
  }
}

const info = computed(() => (current.value ? tiebreakRoundLabel(current.value.round) : null));

onMounted(load);
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <main class="tiebreak">
    <p
      v-if="isLoading"
      class="tiebreak__status"
    >
      Cargando…
    </p>
    <p
      v-else-if="isWaitingForAdmin"
      class="tiebreak__status"
    >
      ¡Hay un empate! Estamos esperando a que el organizador inicie la votación de desempate.
    </p>
    <template v-else-if="loadError">
      <p class="tiebreak__status tiebreak__status--error">
        {{ loadError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="load"
      >
        Reintentar
      </button>
    </template>
    <template v-else-if="current">
      <div class="tiebreak__header">
        <h1 class="tiebreak__title">
          <Icon
            :name="info!.icon"
            :size="36"
            :style="{ color: info!.color }"
          />
          {{ info!.title }}
        </h1>
        <p
          v-if="!hasVoted"
          class="tiebreak__subtitle"
        >
          Elige tu favorita entre las tapas empatadas:
        </p>
      </div>
      <p
        v-if="hasVoted"
        class="tiebreak__status"
      >
        ¡Voto registrado! Espera a que el resto termine.
      </p>
      <template v-else>
        <div class="tiebreak__grid">
          <button
            v-for="candidate in current.candidates"
            :key="candidate.id"
            class="tiebreak__card"
            type="button"
            @click="vote(candidate.id)"
          >
            <img
              :src="`/uploads/${candidate.imagePath}`"
              :alt="`Tapa número ${candidate.number}`"
              class="tiebreak__photo"
            >
            <span class="tiebreak__number">#{{ String(candidate.number).padStart(2, '0') }}</span>
          </button>
        </div>
        <p
          v-if="voteError"
          class="tiebreak__status tiebreak__status--error"
        >
          {{ voteError }}
        </p>
      </template>
    </template>
  </main>
</template>

<style scoped>
.tiebreak {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.tiebreak__header {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-3);
  margin: 0 0 var(--space-4);
}

.tiebreak__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 1.4rem;
  margin: 0;
}

.tiebreak__subtitle {
  color: var(--color-text-muted);
  margin: var(--space-2) 0 0;
}

.tiebreak__status {
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-3);
  margin-top: var(--space-4);
}

.tiebreak__status--error {
  color: var(--color-danger);
}

.tiebreak__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .tiebreak__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.tiebreak__card {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: none;
  padding: 0;
  cursor: pointer;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.tiebreak__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tiebreak__number {
  position: absolute;
  bottom: var(--space-2);
  left: var(--space-2);
  background: rgba(31, 27, 22, 0.65);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
</style>
