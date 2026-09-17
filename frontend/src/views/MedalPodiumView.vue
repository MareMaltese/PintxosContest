<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Icon from '../components/common/Icon.vue';
import { api, ApiError } from '../services/api';

interface PodiumEntry {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
  total: number;
}

const podium = ref<PodiumEntry[] | null>(null);
const isLoading = ref(true);
const notReady = ref(false);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  notReady.value = false;
  try {
    const data = await api.get<{ revealedAt: string; podium: PodiumEntry[] }>('/api/medal-votes/results');
    podium.value = data.podium;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'RESULTS_NOT_READY') {
      notReady.value = true;
    } else {
      loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el podio.';
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="medal-podium">
    <h1 class="medal-podium__title">
      Pintx-o-visión
    </h1>
    <p
      v-if="isLoading"
      class="medal-podium__status"
    >
      Cargando…
    </p>
    <p
      v-else-if="notReady"
      class="medal-podium__status"
    >
      Todavía no se ha revelado el podium de Pintx-o-visión.
    </p>
    <template v-else-if="loadError">
      <p class="medal-podium__status medal-podium__status--error">
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
    <ol
      v-else-if="podium"
      class="medal-podium__list"
    >
      <li
        v-for="entry in podium"
        :key="entry.entryId"
        class="medal-podium__item"
      >
        <span
          class="medal-podium__circle"
          :class="`medal-podium__circle--${entry.medal.toLowerCase()}`"
        >
          <Icon
            name="medal"
            :size="24"
          />
        </span>
        <span class="medal-podium__number">#{{ String(entry.number).padStart(2, '0') }}</span>
        <span class="medal-podium__creator">{{ entry.creatorName }}</span>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.medal-podium {
  padding: var(--space-5);
  max-width: 480px;
  margin: 0 auto;
}

.medal-podium__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
  text-align: center;
}

.medal-podium__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.medal-podium__status--error {
  color: var(--color-danger);
}

.medal-podium__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.medal-podium__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-4);
}

.medal-podium__circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #fff;
  flex-shrink: 0;
}

.medal-podium__circle--gold {
  background: var(--color-gold);
}

.medal-podium__circle--silver {
  background: var(--color-silver);
}

.medal-podium__circle--bronze {
  background: var(--color-bronze);
}

.medal-podium__number {
  font-weight: 700;
  color: var(--color-primary);
}

.medal-podium__creator {
  color: var(--color-text-muted);
}
</style>
