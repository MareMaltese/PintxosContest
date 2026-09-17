<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useEntriesStore } from '../stores/entries';
import { useVotesStore } from '../stores/votes';
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';
import FavoriteCounter from '../components/entries/FavoriteCounter.vue';

useHeartbeat();
const router = useRouter();
const entries = useEntriesStore();
const votes = useVotesStore();
const contest = useContestStore();

onMounted(() => {
  entries.fetchList().catch(() => {
    // el error queda reflejado en entries.listError
  });
  votes.init().catch(() => {
    // un fallo al cargar los favoritos no debe bloquear la galería
  });
});

function openEntry(id: string): void {
  router.push({ name: 'entry-detail', params: { id } });
}
</script>

<template>
  <main class="gallery">
    <div class="gallery__header">
      <h1 class="gallery__title">
        Galería de tapas
      </h1>
      <FavoriteCounter v-if="contest.phase === 'VOTING'" />
    </div>

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
        :class="{ 'gallery__card--favorite': votes.isFavorite(entry.id) }"
        type="button"
        @click="openEntry(entry.id)"
      >
        <img
          :src="`/uploads/${entry.imagePath}`"
          :alt="`Tapa número ${entry.number}`"
          class="gallery__photo"
        >
        <span class="gallery__number">#{{ String(entry.number).padStart(2, '0') }}</span>
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
  margin: 0 0 var(--space-5);
}

.gallery__title {
  font-size: 1.5rem;
  margin: 0;
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
  box-shadow: 0 0 0 3px var(--color-primary);
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
</style>
