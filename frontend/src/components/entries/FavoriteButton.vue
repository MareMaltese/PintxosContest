<script setup lang="ts">
import { ref, computed } from 'vue';
import { Heart } from '@lucide/vue';
import Icon from '../common/Icon.vue';
import { useVotesStore } from '../../stores/votes';
import { useEntriesStore, type EntrySummary } from '../../stores/entries';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const votes = useVotesStore();
const entries = useEntriesStore();
const isPending = ref(false);
const showLimitWarning = ref(false);

const isFavorite = computed(() => votes.isFavorite(props.entryId));
const atLimit = computed(
  () => votes.loaded && !isFavorite.value && votes.favoriteIds.size >= votes.limit
);
const favoritedEntries = computed<EntrySummary[]>(() => entries.list.filter((e) => votes.isFavorite(e.id)));

async function onClick(): Promise<void> {
  if (atLimit.value) {
    showLimitWarning.value = true;
    return;
  }
  isPending.value = true;
  try {
    await votes.toggle(props.entryId);
  } finally {
    isPending.value = false;
  }
}

function dismissLimitWarning(): void {
  showLimitWarning.value = false;
}

async function swapFavorite(oldEntryId: string): Promise<void> {
  showLimitWarning.value = false;
  isPending.value = true;
  try {
    await votes.toggle(oldEntryId);
    await votes.toggle(props.entryId);
  } finally {
    isPending.value = false;
  }
}
</script>

<template>
  <div class="favorite-button">
    <p
      v-if="disabled"
      class="favorite-button__reason"
    >
      {{ disabledReason }}
    </p>
    <button
      v-else
      class="button"
      :class="isFavorite ? 'button--primary' : 'button--secondary'"
      type="button"
      :disabled="isPending"
      @click="onClick"
    >
      <Heart
        :size="20"
        :fill="isFavorite ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
      {{ isFavorite ? '¡Ya no tanto!' : '¡Me encanta!' }}
    </button>
    <p
      v-if="votes.error"
      class="favorite-button__error"
    >
      {{ votes.error }}
    </p>

    <div
      v-if="showLimitWarning"
      class="favorite-button__limit"
      @click="dismissLimitWarning"
    >
      <div
        class="favorite-button__limit-card"
        @click.stop
      >
        <Icon
          name="seal-warning"
          :size="40"
        />
        <p class="favorite-button__limit-message">
          Ya has usado tus {{ votes.limit }} corazones. Quita uno para poder añadir este.
        </p>
        <ul class="favorite-button__limit-list">
          <li
            v-for="entry in favoritedEntries"
            :key="entry.id"
            class="favorite-button__limit-row"
          >
            <img
              :src="`/uploads/${entry.imagePath}`"
              :alt="`Tapa número ${entry.number}`"
              class="favorite-button__limit-photo"
            >
            <span class="favorite-button__limit-entry">
              #{{ String(entry.number).padStart(2, '0') }}
              <template v-if="entry.name">
                — {{ entry.name }}
              </template>
            </span>
            <button
              class="button button--secondary favorite-button__limit-swap"
              type="button"
              @click="swapFavorite(entry.id)"
            >
              Quitar
            </button>
          </li>
        </ul>
        <button
          class="button button--secondary favorite-button__limit-cancel"
          type="button"
          @click="dismissLimitWarning"
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.favorite-button__reason {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.favorite-button__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  margin-top: var(--space-2);
}

.favorite-button__limit {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-5);
}

.favorite-button__limit-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-6) var(--space-5);
  max-width: 360px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.favorite-button__limit-card .icon {
  color: var(--color-danger);
}

.favorite-button__limit-message {
  margin: 0;
  color: var(--color-text);
}

.favorite-button__limit-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.favorite-button__limit-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  text-align: left;
}

.favorite-button__limit-photo {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.favorite-button__limit-entry {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.favorite-button__limit-cancel {
  width: 100%;
}
</style>
