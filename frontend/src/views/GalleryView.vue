<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw, Lock } from '@lucide/vue';
import Icon from '../components/common/Icon.vue';
import { api } from '../services/api';
import { useEntriesStore, type EntrySummary } from '../stores/entries';
import { useVotesStore } from '../stores/votes';
import { useMedalVotesStore } from '../stores/medalVotes';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';
import { useHeartbeat } from '../composables/useHeartbeat';
import FavoriteCounter from '../components/entries/FavoriteCounter.vue';

const REFRESH_COOLDOWN_MS = 3000;
const REFRESH_FLASH_MS = 400;

useHeartbeat();
const router = useRouter();
const entries = useEntriesStore();
const votes = useVotesStore();
const medals = useMedalVotesStore();
const contest = useContestStore();
const session = useSessionStore();

const refreshWarning = ref<string | null>(null);
const isFlashing = ref(false);
const worstEntryId = ref<string | null>(null);
let lastRefreshAt = 0;
let warningTimer: ReturnType<typeof setTimeout> | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;

async function loadWorstEntry(): Promise<void> {
  if (contest.phase !== 'RESULTS') return;
  try {
    const data = await api.get<{ worstEntryId: string | null }>('/api/medal-votes/results');
    worstEntryId.value = data.worstEntryId;
  } catch {
    // el icono de "premio al último" es un extra -- no debe bloquear la galería
  }
}

onMounted(() => {
  entries.fetchList().catch(() => {
    // el error queda reflejado en entries.listError
  });
  votes.init().catch(() => {
    // un fallo al cargar los favoritos no debe bloquear la galería
  });
  medals.init().catch(() => {
    // un fallo al cargar las medallas no debe bloquear la galería
  });
  loadWorstEntry();
});

watch(
  () => contest.phase,
  () => loadWorstEntry()
);

onBeforeUnmount(() => {
  if (warningTimer) clearTimeout(warningTimer);
  if (flashTimer) clearTimeout(flashTimer);
});

function refresh(): void {
  const now = Date.now();
  if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
    refreshWarning.value = '¡No me satures! Ya estoy trabajando en ello…';
    if (warningTimer) clearTimeout(warningTimer);
    warningTimer = setTimeout(() => {
      refreshWarning.value = null;
    }, REFRESH_COOLDOWN_MS);
    return;
  }
  lastRefreshAt = now;
  refreshWarning.value = null;
  entries.refreshList();

  isFlashing.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    isFlashing.value = false;
  }, REFRESH_FLASH_MS);
}

function isOwn(entry: EntrySummary): boolean {
  return entry.creatorId === session.user?.id;
}

function ownOverlayIcon(entry: EntrySummary): 'pencil' | 'lock' | null {
  if (!isOwn(entry)) return null;
  if (contest.phase === 'REGISTRATION') return 'pencil';
  if (!contest.allowSelfVote) return 'lock';
  return null;
}

function medalClass(entry: EntrySummary): string | null {
  if (contest.votingMode !== 'MEDALS') return null;
  const medal = medals.medalFor(entry.id);
  return medal ? medal.toLowerCase() : null;
}

function openEntry(entry: EntrySummary): void {
  if (isOwn(entry) && contest.phase === 'REGISTRATION') {
    router.push({ name: 'edit-entry', params: { id: entry.id } });
    return;
  }
  router.push({ name: 'entry-detail', params: { id: entry.id } });
}
</script>

<template>
  <div
    v-if="isFlashing"
    class="gallery__flash-overlay"
  />
  <main class="gallery">
    <div class="gallery__header">
      <h1 class="gallery__title">
        Galería de tapas
      </h1>
      <div class="gallery__header-actions">
        <FavoriteCounter v-if="contest.phase === 'VOTING' && contest.votingMode === 'FAVORITES'" />
        <button
          class="gallery__refresh"
          type="button"
          aria-label="Actualizar"
          @click="refresh"
        >
          <RefreshCw
            :size="20"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <p
      v-if="refreshWarning"
      class="gallery__refresh-warning"
    >
      {{ refreshWarning }}
    </p>

    <p
      v-if="entries.isLoadingList"
      class="gallery__status"
    >
      Cargando…
    </p>
    <template v-else-if="entries.listError">
      <p class="gallery__status gallery__status--error">
        {{ entries.listError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="entries.fetchList()"
      >
        Reintentar
      </button>
    </template>
    <p
      v-else-if="entries.list.length === 0"
      class="gallery__status"
    >
      Todavía no hay tapas registradas.
    </p>

    <div
      v-else
      class="gallery__grid"
    >
      <button
        v-for="entry in entries.list"
        :key="entry.id"
        class="gallery__card"
        :class="{
          'gallery__card--favorite': contest.votingMode === 'FAVORITES' && votes.isFavorite(entry.id),
          'gallery__card--own': isOwn(entry),
          [`gallery__card--${medalClass(entry)}`]: medalClass(entry),
        }"
        type="button"
        @click="openEntry(entry)"
      >
        <img
          :src="`/uploads/${entry.imagePath}`"
          :alt="`Tapa número ${entry.number}`"
          class="gallery__photo"
        >
        <span class="gallery__number">#{{ String(entry.number).padStart(2, '0') }}</span>

        <div
          v-if="ownOverlayIcon(entry)"
          class="gallery__own-overlay"
        >
          <Icon
            v-if="ownOverlayIcon(entry) === 'pencil'"
            name="pencil"
            :size="28"
          />
          <Lock
            v-else
            :size="28"
            aria-hidden="true"
          />
        </div>

        <div
          v-if="medalClass(entry)"
          class="gallery__medal-badge"
          :class="`gallery__medal-badge--${medalClass(entry)}`"
        >
          <Icon
            name="medal"
            :size="35"
          />
        </div>

        <div
          v-if="entry.id === worstEntryId"
          class="gallery__medal-badge gallery__medal-badge--worst"
        >
          <Icon
            name="skull"
            :size="35"
          />
        </div>
      </button>
    </div>
  </main>
</template>

<style scoped>
.gallery {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.gallery__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-2);
}

.gallery__header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.gallery__title {
  font-size: 1.5rem;
  margin: 0;
  background: #fff;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.gallery__refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--color-bronze);
  box-shadow: var(--shadow-sm);
  color: #fff;
  cursor: pointer;
}

.gallery__refresh-warning {
  color: var(--color-danger);
  background: white;
  padding: 2rem;
  border: 1px solid;
  text-align: center;
  margin: 0 0 var(--space-3);
  font-size: 0.9rem;
}

.gallery__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.gallery__status--error {
  color: var(--color-danger);
}

.gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .gallery__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 960px) {
  .gallery__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.gallery__card {
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

.gallery__card--favorite {
  box-shadow: 0 0 0 5px var(--color-primary);
}

.gallery__card--gold {
  box-shadow: 0 0 0 5px var(--color-gold);
}

.gallery__card--silver {
  box-shadow: 0 0 0 5px var(--color-silver);
}

.gallery__card--bronze {
  box-shadow: 0 0 0 5px var(--color-bronze);
}

.gallery__card--own {
  outline: 3px solid #000;
  outline-offset: -3px;
}

.gallery__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery__number {
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

.gallery__own-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
}

.gallery__medal-badge {
  position: absolute;
  z-index: 2;
  bottom: var(--space-2);
  right: var(--space-2);
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 1px 1px 2px 2px #0000007a;
  border: 3px solid;
}

.gallery__medal-badge--gold {
  color: var(--color-gold);
}

.gallery__medal-badge--silver {
  color: var(--color-silver);
}

.gallery__medal-badge--bronze {
  color: var(--color-bronze);
}

.gallery__medal-badge--worst {
  top: var(--space-2);
  right: var(--space-2);
  bottom: auto;
  color: #000;
}

.gallery__flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #000;
  opacity: 0.35;
  pointer-events: none;
  animation: gallery-flash 0.4s ease;
}

@keyframes gallery-flash {
  0% {
    opacity: 0;
  }
  15% {
    opacity: 0.35;
  }
  100% {
    opacity: 0;
  }
}
</style>
