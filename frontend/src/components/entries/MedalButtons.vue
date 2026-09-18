<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from '../common/Icon.vue';
import { useMedalVotesStore, type Medal } from '../../stores/medalVotes';
import { useEntriesStore, type EntrySummary } from '../../stores/entries';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const medals = useMedalVotesStore();
const entries = useEntriesStore();
const current = computed(() => medals.medalFor(props.entryId));

const OPTIONS: { medal: Medal; label: string; points: number }[] = [
  { medal: 'GOLD', label: 'Oro', points: 5 },
  { medal: 'SILVER', label: 'Plata', points: 3 },
  { medal: 'BRONZE', label: 'Bronce', points: 1 },
];

const pendingSwap = ref<{ medal: Medal; previousEntry: EntrySummary } | null>(null);

function holderEntryId(medal: Medal): string | null {
  if (medal === 'GOLD') return medals.gold;
  if (medal === 'SILVER') return medals.silver;
  return medals.bronze;
}

async function choose(medal: Medal): Promise<void> {
  if (current.value === medal) {
    await medals.setMedal(props.entryId, null);
    return;
  }
  const holderId = holderEntryId(medal);
  if (holderId && holderId !== props.entryId) {
    const previousEntry = entries.list.find((e) => e.id === holderId);
    if (previousEntry) {
      pendingSwap.value = { medal, previousEntry };
      return;
    }
  }
  await medals.setMedal(props.entryId, medal);
}

async function confirmSwap(): Promise<void> {
  if (!pendingSwap.value) return;
  const { medal } = pendingSwap.value;
  pendingSwap.value = null;
  await medals.setMedal(props.entryId, medal);
}

function cancelSwap(): void {
  pendingSwap.value = null;
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

    <div
      v-if="pendingSwap"
      class="medal-buttons__swap"
      @click="cancelSwap"
    >
      <div
        class="medal-buttons__swap-card"
        @click.stop
      >
        <Icon
          name="seal-warning"
          :size="40"
        />
        <p class="medal-buttons__swap-message">
          Vas a quitar esta medalla al pincho actual
        </p>
        <img
          :src="`/uploads/${pendingSwap.previousEntry.imagePath}`"
          :alt="`Tapa número ${pendingSwap.previousEntry.number}`"
          class="medal-buttons__swap-photo"
        >
        <p class="medal-buttons__swap-entry">
          #{{ String(pendingSwap.previousEntry.number).padStart(2, '0') }}
          <template v-if="pendingSwap.previousEntry.name">
            — {{ pendingSwap.previousEntry.name }}
          </template>
        </p>
        <div class="medal-buttons__swap-actions">
          <button
            class="button button--secondary medal-buttons__swap-cancel"
            type="button"
            @click="cancelSwap"
          >
            Cancelar
          </button>
          <button
            class="button button--primary medal-buttons__swap-confirm"
            type="button"
            @click="confirmSwap"
          >
            Sí, quitar
          </button>
        </div>
      </div>
    </div>
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

.medal-buttons__swap {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-5);
}

.medal-buttons__swap-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-6) var(--space-5);
  max-width: 340px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.medal-buttons__swap-card .icon {
  color: var(--color-danger);
}

.medal-buttons__swap-message {
  margin: 0;
  color: var(--color-text);
}

.medal-buttons__swap-entry {
  margin: 0;
  font-weight: 700;
  color: var(--color-text);
}

.medal-buttons__swap-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.medal-buttons__swap-actions {
  display: flex;
  gap: var(--space-3);
  width: 100%;
}

.medal-buttons__swap-actions .button {
  flex: 1;
}
</style>
