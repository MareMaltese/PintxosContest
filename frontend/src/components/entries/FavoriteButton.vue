<script setup lang="ts">
import { ref, computed } from 'vue';
import { Heart } from '@lucide/vue';
import { useVotesStore } from '../../stores/votes';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const votes = useVotesStore();
const isPending = ref(false);

const isFavorite = computed(() => votes.isFavorite(props.entryId));

async function onClick(): Promise<void> {
  isPending.value = true;
  try {
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
</style>
