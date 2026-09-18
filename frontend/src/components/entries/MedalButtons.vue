<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../common/Icon.vue';
import { useMedalVotesStore, type Medal } from '../../stores/medalVotes';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const medals = useMedalVotesStore();
const current = computed(() => medals.medalFor(props.entryId));

const OPTIONS: { medal: Medal; label: string; points: number }[] = [
  { medal: 'GOLD', label: 'Oro', points: 5 },
  { medal: 'SILVER', label: 'Plata', points: 3 },
  { medal: 'BRONZE', label: 'Bronce', points: 1 },
];

async function choose(medal: Medal): Promise<void> {
  const next = current.value === medal ? null : medal;
  await medals.setMedal(props.entryId, next);
}
</script>

<template>
  <div class="medal-buttons">
    <p
      v-if="disabled"
      class="medal-buttons__reason"
    >
      {{ disabledReason }}
    </p>
    <div
      v-else
      class="medal-buttons__group"
    >
      <button
        v-for="option in OPTIONS"
        :key="option.medal"
        type="button"
        class="medal-buttons__button"
        :class="[
          `medal-buttons__button--${option.medal.toLowerCase()}`,
          { 'medal-buttons__button--active': current === option.medal },
        ]"
        @click="choose(option.medal)"
      >
        <Icon
          name="medal"
          :size="28"
        />
        <span class="medal-buttons__label">{{ option.label }}</span>
        <span class="medal-buttons__points">{{ option.points }} {{ option.points === 1 ? 'pt' : 'pts' }}</span>
      </button>
    </div>
    <p
      v-if="medals.error"
      class="medal-buttons__error"
    >
      {{ medals.error }}
    </p>
  </div>
</template>

<style scoped>
.medal-buttons__group {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.medal-buttons__button {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 72px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
}

.medal-buttons__label {
  font-size: 0.9rem;
}

.medal-buttons__points {
  font-size: 0.7rem;
  font-weight: 700;
  opacity: 0.8;
}

.medal-buttons__button--gold {
  border-color: var(--color-gold);
  color: var(--color-gold);
}

.medal-buttons__button--silver {
  border-color: var(--color-silver);
  color: var(--color-silver);
}

.medal-buttons__button--bronze {
  border-color: var(--color-bronze);
  color: var(--color-bronze);
}

.medal-buttons__button--active {
  color: var(--color-primary-contrast);
}

.medal-buttons__button--gold.medal-buttons__button--active {
  background: var(--color-gold);
}

.medal-buttons__button--silver.medal-buttons__button--active {
  background: var(--color-silver);
}

.medal-buttons__button--bronze.medal-buttons__button--active {
  background: var(--color-bronze);
}

.medal-buttons__reason {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.medal-buttons__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  margin-top: var(--space-2);
}
</style>
