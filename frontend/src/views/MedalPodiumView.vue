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

interface StandingEntry {
  rank: number;
  entryId: string;
  number: number;
  name: string | null;
  creatorName: string;
  imagePath: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

const podium = ref<PodiumEntry[] | null>(null);
const standings = ref<StandingEntry[]>([]);
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
    const data = await api.get<{ revealedAt: string; podium: PodiumEntry[]; standings: StandingEntry[] }>(
      '/api/medal-votes/results'
    );
    podium.value = data.podium;
    standings.value = data.standings;
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
      RANKING
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
      Todavía no se ha revelado el podium de medallas.
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
        <img
          v-if="silver"
          :src="`/uploads/${silver.imagePath}`"
          :alt="`Tapa número ${silver.number}`"
          class="medal-podium__photo"
        >
        <div
          class="medal-podium__step medal-podium__step--silver"
          style="height: 120px"
        >
          <Icon
            name="medal"
            :size="45"
          />
          <span
            v-if="silver"
            class="medal-podium__number"
          >#{{ padNumber(silver.number) }}</span>
        </div>
      </div>

      <div class="medal-podium__column">
        <img
          v-if="gold"
          :src="`/uploads/${gold.imagePath}`"
          :alt="`Tapa número ${gold.number}`"
          class="medal-podium__photo"
        >
        <div
          class="medal-podium__step medal-podium__step--gold"
          style="height: 160px"
        >
          <Icon
            name="medal"
            :size="45"
          />
          <span
            v-if="gold"
            class="medal-podium__number"
          >#{{ padNumber(gold.number) }}</span>
        </div>
      </div>

      <div class="medal-podium__column">
        <img
          v-if="bronze"
          :src="`/uploads/${bronze.imagePath}`"
          :alt="`Tapa número ${bronze.number}`"
          class="medal-podium__photo"
        >
        <div
          class="medal-podium__step medal-podium__step--bronze"
          style="height: 90px"
        >
          <Icon
            name="medal"
            :size="45"
          />
          <span
            v-if="bronze"
            class="medal-podium__number"
          >#{{ padNumber(bronze.number) }}</span>
        </div>
      </div>
    </div>

    <ul
      v-if="standings.length > 0"
      class="medal-podium__list"
    >
      <li
        v-for="entry in standings"
        :key="entry.entryId"
        class="medal-podium__row"
      >
        <span class="medal-podium__row-number">#{{ padNumber(entry.number) }}</span>
        <span class="medal-podium__row-creator">{{ entry.creatorName }}</span>
        <span class="medal-podium__counts">
          <span class="medal-podium__count medal-podium__count--gold">
            <Icon
              name="medal"
              :size="20"
            />{{ entry.gold }}
          </span>
          <span class="medal-podium__count medal-podium__count--silver">
            <Icon
              name="medal"
              :size="20"
            />{{ entry.silver }}
          </span>
          <span class="medal-podium__count medal-podium__count--bronze">
            <Icon
              name="medal"
              :size="20"
            />{{ entry.bronze }}
          </span>
          <span class="medal-podium__row-total">{{ entry.total }}</span>
        </span>
      </li>
    </ul>
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
  background: #fff;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
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
  gap: var(--space-1);
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
  width: 106px;
  height: 106px;
  object-fit: cover;
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
}

.medal-podium__number {
  font-size: 1.1rem;
  font-weight: 700;
  color: inherit;
}

.medal-podium__step {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-1);
  padding-top: var(--space-3);
  border: 3px solid;
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  box-sizing: border-box;
  color: white;
  box-shadow: var(--shadow-lg);
}

.medal-podium__step--gold {
  border-color: var(--color-gold);
  background: var(--color-gold);
}

.medal-podium__step--silver {
  border-color: var(--color-silver);
  background: var(--color-silver);
}

.medal-podium__step--bronze {
  border-color: var(--color-bronze);
  background: var(--color-bronze);
}

.medal-podium__list {
  list-style: none;
  padding: 0;
  margin: var(--space-6) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.medal-podium__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-2) var(--space-3);
}

.medal-podium__row-number {
  font-weight: 700;
  color: var(--color-primary);
}

.medal-podium__row-creator {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.medal-podium__counts {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.medal-podium__count {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
}

.medal-podium__count--gold {
  color: var(--color-gold);
}

.medal-podium__count--silver {
  color: var(--color-silver);
}

.medal-podium__count--bronze {
  color: var(--color-bronze);
}

.medal-podium__row-total {
  font-weight: 700;
  color: var(--color-text);
  min-width: 1.5em;
  text-align: right;
}
</style>
