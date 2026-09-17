<script setup lang="ts">
import { computed } from 'vue';
import { Heart } from '@lucide/vue';
import { useVotesStore } from '../../stores/votes';

const votes = useVotesStore();
const count = computed(() => votes.favoriteIds.size);
</script>

<template>
  <p class="favorite-counter">
    <Heart
      :size="16"
      aria-hidden="true"
    />
    {{ count }} / {{ votes.limit }} favoritos
  </p>
</template>

<style scoped>
.favorite-counter {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: var(--space-1) var(--space-3);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0;
}
</style>
