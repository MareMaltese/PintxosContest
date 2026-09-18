<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/common/Icon.vue';
import { api, ApiError } from '../services/api';

interface PodiumEntry {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  imagePath: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
  total: number;
}

const podium = ref<PodiumEntry[] | null>(null);
const isLoading = ref(true);
const notReady = ref(false);
const loadError = ref<string | null>(null);

const gold = computed(() => podium.value?.find((p) => p.medal === 'GOLD') ?? null);
const silver = computed(() => podium.value?.find((p) => p.medal === 'SILVER') ?? null);
const bronze = computed(() => podium.value?.find((p) => p.medal === 'BRONZE') ?? null);

function padNumber(number: number): string {
  return String(number).padStart(2, '0');
}

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
      Pinch-o-visión
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
      Todavía no se ha revelado el podium de Pinch-o-visión.
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

    <div
      v-else-if="podium"
      class="medal-podium__stage"
    >
      <div class="medal-podium__column">
        <template v-if="silver">
          <img
            :src="`/uploads/${silver.imagePath}`"
            :alt="`Tapa número ${silver.number}`"
            class="medal-podium__photo"
          >
          <span class="medal-podium__number">#{{ padNumber(silver.number) }}</span>
        </template>
        <div
          class="medal-podium__step medal-podium__step--silver"
          style="height: 120px"
        >
          <Icon
            name="medal"
            :size="28"
          />
        </div>
      </div>

      <div class="medal-podium__column">
        <template v-if="gold">
          <img
            :src="`/uploads/${gold.imagePath}`"
            :alt="`Tapa número ${gold.number}`"
            class="medal-podium__photo"
          >
          <span class="medal-podium__number">#{{ padNumber(gold.number) }}</span>
        </template>
        <div
          class="medal-podium__step medal-podium__step--gold"
          style="height: 160px"
        >
          <Icon
            name="medal"
            :size="32"
          />
        </div>
      </div>

      <div class="medal-podium__column">
        <template v-if="bronze">
          <img
            :src="`/uploads/${bronze.imagePath}`"
            :alt="`Tapa número ${bronze.number}`"
            class="medal-podium__photo"
          >
          <span class="medal-podium__number">#{{ padNumber(bronze.number) }}</span>
        </template>
        <div
          class="medal-podium__step medal-podium__step--bronze"
          style="height: 90px"
        >
          <Icon
            name="medal"
            :size="24"
          />
        </div>
      </div>
    </div>
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

.medal-podium__stage {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--space-3);
}

.medal-podium__column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  max-width: 140px;
}

.medal-podium__photo {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
}

.medal-podium__number {
  font-weight: 700;
  color: var(--color-primary);
}

.medal-podium__step {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--space-3);
  border: 3px solid;
  border-bottom: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  box-sizing: border-box;
}

.medal-podium__step--gold {
  border-color: var(--color-gold);
  color: var(--color-gold);
  background: rgba(201, 162, 39, 0.1);
}

.medal-podium__step--silver {
  border-color: var(--color-silver);
  color: var(--color-silver);
  background: rgba(154, 160, 166, 0.1);
}

.medal-podium__step--bronze {
  border-color: var(--color-bronze);
  color: var(--color-bronze);
  background: rgba(176, 106, 53, 0.1);
}
</style>
