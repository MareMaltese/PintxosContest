<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { GripVertical } from '@lucide/vue';
import Icon from '../components/common/Icon.vue';
import { useEntriesStore, type EntrySummary } from '../stores/entries';
import { useRankingVotesStore } from '../stores/rankingVotes';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';
import { useHeartbeat } from '../composables/useHeartbeat';

useHeartbeat();
const entries = useEntriesStore();
const ranking = useRankingVotesStore();
const contest = useContestStore();
const session = useSessionStore();

const MEDALS = ['gold', 'silver', 'bronze'] as const;

const items = ref<EntrySummary[]>([]);
const loadError = ref<string | null>(null);
const isLoading = ref(true);

const canEdit = computed(() => contest.phase === 'VOTING');
const hasSaved = computed(() => ranking.order.length > 0);
const hiddenOwnCount = computed(() =>
  contest.allowSelfVote ? 0 : entries.list.filter((e) => e.creatorId === session.user?.id).length
);

// Votable entries, in the user's saved order; anything not in it yet (never saved)
// goes after, by entry number.
function buildItems(): EntrySummary[] {
  const votable = entries.list.filter((e) => contest.allowSelfVote || e.creatorId !== session.user?.id);
  const position = new Map(ranking.order.map((id, index) => [id, index]));
  return [...votable].sort((a, b) => {
    const pa = position.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const pb = position.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || a.number - b.number;
  });
}

watch(
  () => [entries.list, ranking.order, contest.allowSelfVote],
  () => {
    items.value = buildItems();
  }
);

onMounted(async () => {
  try {
    await Promise.all([entries.fetchList(), ranking.init()]);
    items.value = buildItems();
  } catch {
    loadError.value = 'No hemos podido cargar los pinchos.';
  } finally {
    isLoading.value = false;
  }
});

function saveCurrentOrder(): void {
  ranking.save(items.value.map((e) => e.id));
}

function onDragEnd(): void {
  const ids = items.value.map((e) => e.id);
  if (hasSaved.value && ids.every((id, index) => ranking.order[index] === id)) return;
  saveCurrentOrder();
}

function medalOf(index: number): (typeof MEDALS)[number] | null {
  return MEDALS[index] ?? null;
}

function isLast(index: number): boolean {
  return contest.worstPrizeEnabled && items.value.length > MEDALS.length && index === items.value.length - 1;
}
</script>

<template>
  <main class="ranking">
    <h1 class="ranking__title">
      Clasificación
    </h1>

    <div class="ranking__intro">
      <template v-if="canEdit">
        <p class="ranking__intro-text">
          Ordénalos según tu gusto, de mejor a peor.
        </p>
        <p
          v-if="contest.worstPrizeEnabled"
          class="ranking__intro-warning"
        >
          <Icon
            name="skull"
            :size="20"
          />
          ¡Ten en cuenta que hay premio para el último!
        </p>
      </template>
      <p
        v-else
        class="ranking__intro-text"
      >
        La votación ha terminado. Esta es la clasificación que enviaste.
      </p>
    </div>

    <p
      v-if="isLoading"
      class="ranking__status"
    >
      Cargando…
    </p>
    <p
      v-else-if="loadError"
      class="ranking__status ranking__status--error"
    >
      {{ loadError }}
    </p>
    <p
      v-else-if="items.length === 0"
      class="ranking__status"
    >
      No hay pinchos que puedas puntuar.
    </p>

    <template v-else>
      <div
        v-if="canEdit && !hasSaved"
        class="ranking__unsaved"
      >
        <p>Todavía no has guardado tu clasificación. Arrastra los pinchos o guarda este orden tal cual.</p>
        <button
          class="button button--primary ranking__save"
          type="button"
          :disabled="ranking.isSaving"
          @click="saveCurrentOrder"
        >
          Guardar este orden
        </button>
      </div>

      <VueDraggable
        v-model="items"
        tag="ol"
        class="ranking__list"
        :animation="180"
        :delay="120"
        :delay-on-touch-only="true"
        :force-fallback="true"
        :fallback-tolerance="4"
        :disabled="!canEdit"
        ghost-class="ranking__item--ghost"
        chosen-class="ranking__item--chosen"
        @end="onDragEnd"
      >
        <li
          v-for="(entry, index) in items"
          :key="entry.id"
          class="ranking__item"
          :class="{
            [`ranking__item--${medalOf(index)}`]: medalOf(index),
            'ranking__item--last': isLast(index),
            'ranking__item--locked': !canEdit,
          }"
        >
          <span
            v-if="medalOf(index)"
            class="ranking__badge"
            :class="`ranking__badge--${medalOf(index)}`"
            :aria-label="`Puesto ${index + 1}`"
          >
            <Icon
              name="medal"
              :size="24"
            />
          </span>
          <span
            v-else-if="isLast(index)"
            class="ranking__badge ranking__badge--last"
            :aria-label="`Puesto ${index + 1}, último`"
          >
            <Icon
              name="skull"
              :size="24"
            />
          </span>
          <span
            v-else
            class="ranking__position"
          >{{ index + 1 }}º</span>

          <img
            :src="`/uploads/${entry.imagePath}`"
            :alt="`Tapa número ${entry.number}`"
            class="ranking__photo"
          >
          <span class="ranking__info">
            <span
              class="ranking__name"
              :class="{ 'ranking__name--empty': !entry.name }"
            >{{ entry.name ?? 'Sin nombre' }}</span>
            <span class="ranking__number">#{{ String(entry.number).padStart(2, '0') }}</span>
          </span>

          <GripVertical
            v-if="canEdit"
            class="ranking__grip"
            :size="24"
            aria-hidden="true"
          />
        </li>
      </VueDraggable>

      <p
        v-if="ranking.error"
        class="ranking__status ranking__status--error"
      >
        {{ ranking.error }}
      </p>
      <p
        v-else-if="canEdit && hasSaved"
        class="ranking__saved"
      >
        {{ ranking.isSaving ? 'Guardando…' : 'Clasificación guardada' }}
      </p>
      <p
        v-if="hiddenOwnCount > 0"
        class="ranking__own-note"
      >
        Tu pincho no aparece porque no puedes puntuarlo.
      </p>
    </template>
  </main>
</template>

<style scoped>
.ranking {
  padding: var(--space-5);
  max-width: 560px;
  margin: 0 auto;
}

.ranking__title {
  display: inline-block;
  font-size: 1.5rem;
  margin: 0 0 var(--space-3);
  background: #fff;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.ranking__intro {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-4);
  text-align: center;
}

.ranking__intro-text {
  margin: 0;
  font-weight: 600;
}

.ranking__intro-warning {
  margin: var(--space-2) 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-danger);
  font-weight: 700;
  font-size: 0.9rem;
}

.ranking__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.ranking__status--error {
  color: var(--color-danger);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-top: var(--space-3);
}

.ranking__unsaved {
  background: var(--color-surface);
  border: 2px dashed var(--color-title);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-4);
  text-align: center;
  font-size: 0.9rem;
}

.ranking__unsaved p {
  margin: 0 0 var(--space-3);
}

.ranking__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ranking__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ranking__item--locked {
  cursor: default;
}

.ranking__item--gold {
  border-color: var(--color-gold);
}

.ranking__item--silver {
  border-color: var(--color-silver);
}

.ranking__item--bronze {
  border-color: var(--color-bronze);
}

.ranking__item--last {
  border-color: #000;
}

.ranking__item--chosen {
  box-shadow: var(--shadow-md);
  cursor: grabbing;
}

.ranking__item--ghost {
  opacity: 0.4;
}

.ranking__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: #fff;
  border: 3px solid;
  box-shadow: 1px 1px 2px 1px #0000004d;
}

.ranking__badge--gold {
  color: var(--color-gold);
}

.ranking__badge--silver {
  color: var(--color-silver);
}

.ranking__badge--bronze {
  color: var(--color-bronze);
}

.ranking__badge--last {
  color: #000;
}

.ranking__position {
  flex-shrink: 0;
  width: 2.5rem;
  text-align: center;
  font-weight: 700;
  color: var(--color-text-muted);
}

.ranking__photo {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  pointer-events: none;
}

.ranking__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ranking__name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking__name--empty {
  color: var(--color-text-muted);
  font-weight: 600;
  font-style: italic;
}

.ranking__number {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.ranking__grip {
  flex-shrink: 0;
  color: var(--color-title);
}

.ranking__saved,
.ranking__own-note {
  width: fit-content;
  margin: var(--space-3) auto 0;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-surface);
  text-align: center;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
