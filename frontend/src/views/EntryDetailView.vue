<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { X } from '@lucide/vue';
import { ApiError } from '../services/api';
import { useEntriesStore, type EntryDetail } from '../stores/entries';
import { useVotesStore } from '../stores/votes';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';
import FavoriteButton from '../components/entries/FavoriteButton.vue';
import FavoriteCounter from '../components/entries/FavoriteCounter.vue';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const votes = useVotesStore();
const contest = useContestStore();
const session = useSessionStore();

const entry = ref<EntryDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

const canVote = computed(() => contest.phase === 'VOTING');
const isOwnEntry = computed(() => entry.value !== null && entry.value.creatorId === session.user?.id);
const selfVoteBlocked = computed(() => isOwnEntry.value && !contest.allowSelfVote);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    entry.value = await entries.fetchDetail(route.params.id as string);
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar esta tapa.';
  } finally {
    isLoading.value = false;
  }
}

function close(): void {
  router.push({ name: 'gallery' });
}

onMounted(() => {
  load();
  votes.init().catch(() => {
    // un fallo al cargar los favoritos no debe bloquear la vista de la tapa
  });
});
</script>

<template>
  <main class="entry-detail">
    <button
      class="entry-detail__close"
      type="button"
      aria-label="Cerrar"
      @click="close"
    >
      <X
        :size="24"
        aria-hidden="true"
      />
    </button>

    <p
      v-if="isLoading"
      class="entry-detail__status"
    >
      Cargando…
    </p>
    <template v-else-if="loadError">
      <p class="entry-detail__status entry-detail__status--error">
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
      v-else-if="entry"
      class="entry-detail__card"
    >
      <img
        :src="`/uploads/${entry.imagePath}`"
        :alt="`Tapa número ${entry.number}`"
        class="entry-detail__photo"
      >
      <p class="entry-detail__badge">
        #{{ String(entry.number).padStart(2, '0') }}
      </p>
      <h1
        v-if="entry.name"
        class="entry-detail__name"
      >
        {{ entry.name }}
      </h1>
      <p
        v-if="entry.description"
        class="entry-detail__description"
      >
        {{ entry.description }}
      </p>
      <p class="entry-detail__creator">
        Presentado por {{ entry.creatorName }}
      </p>

      <div
        v-if="canVote"
        class="entry-detail__voting"
      >
        <FavoriteCounter />
        <FavoriteButton
          :entry-id="entry.id"
          :disabled="selfVoteBlocked"
          disabled-reason="No puedes votar tu propio pincho."
        />
      </div>
    </div>
  </main>
</template>

<style scoped>
.entry-detail {
  padding: var(--space-5);
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}

.entry-detail__close {
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: none;
  background: rgba(31, 27, 22, 0.55);
  color: #fff;
  cursor: pointer;
}

.entry-detail__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.entry-detail__status--error {
  color: var(--color-danger);
}

.entry-detail__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  padding-bottom: var(--space-5);
}

.entry-detail__photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

.entry-detail__badge {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
  margin: var(--space-4) var(--space-5) 0;
}

.entry-detail__name {
  font-size: 1.4rem;
  margin: var(--space-1) var(--space-5) 0;
}

.entry-detail__description {
  color: var(--color-text-muted);
  margin: var(--space-2) var(--space-5) 0;
}

.entry-detail__creator {
  margin: var(--space-4) var(--space-5) 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.entry-detail__voting {
  margin: var(--space-4) var(--space-5) 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}
</style>
