<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { X } from '@lucide/vue';
import Icon from '../components/common/Icon.vue';
import { useEntriesStore, type EntrySummary } from '../stores/entries';

const router = useRouter();
const entries = useEntriesStore();

onMounted(() => {
  entries.fetchMine();
});

function close(): void {
  router.push({ name: 'waiting-room' });
}

function addAnother(): void {
  router.push({ name: 'new-entry' });
}

function editEntry(entry: EntrySummary): void {
  router.push({ name: 'edit-entry', params: { id: entry.id } });
}
</script>

<template>
  <main class="my-entries">
    <button
      class="my-entries__close"
      type="button"
      aria-label="Cerrar"
      @click="close"
    >
      <X
        :size="24"
        aria-hidden="true"
      />
    </button>

    <h1 class="my-entries__title">
      Mis pinchos
    </h1>

    <p
      v-if="entries.isLoadingMine"
      class="my-entries__status"
    >
      Cargando…
    </p>
    <template v-else-if="entries.mineError">
      <p class="my-entries__status my-entries__status--error">
        {{ entries.mineError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="entries.fetchMine()"
      >
        Reintentar
      </button>
    </template>
    <p
      v-else-if="entries.myList.length === 0"
      class="my-entries__status"
    >
      Todavía no has registrado ningún pincho.
    </p>
    <ul
      v-else
      class="my-entries__list"
    >
      <li
        v-for="entry in entries.myList"
        :key="entry.id"
        class="my-entries__item"
      >
        <img
          :src="`/uploads/${entry.imagePath}`"
          :alt="`Tapa número ${entry.number}`"
          class="my-entries__photo"
        >
        <div class="my-entries__info">
          <p class="my-entries__number">
            #{{ String(entry.number).padStart(2, '0') }}
          </p>
          <p
            v-if="entry.name"
            class="my-entries__name"
          >
            {{ entry.name }}
          </p>
          <p
            v-if="entry.description"
            class="my-entries__description"
          >
            {{ entry.description }}
          </p>
        </div>
        <button
          class="my-entries__edit"
          type="button"
          aria-label="Editar"
          @click="editEntry(entry)"
        >
          <Icon
            name="pencil"
            :size="16"
          />
        </button>
      </li>
    </ul>

    <button
      class="button button--primary button--block my-entries__add"
      type="button"
      @click="addAnother"
    >
      Añadir otro pincho
    </button>
  </main>
</template>

<style scoped>
.my-entries {
  padding: var(--space-5);
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}

.my-entries__close {
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

.my-entries__title {
  margin: 0 0 var(--space-5);
  text-align: center;
  border-bottom: 1px solid var(--color-title);
  padding: 0.8rem 0.5rem 0.5rem 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-md)
}

.my-entries__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.my-entries__status--error {
  color: var(--color-danger);
}

.my-entries__list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.my-entries__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3);
}

.my-entries__photo {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.my-entries__info {
  flex: 1;
  min-width: 0;
}

.my-entries__number {
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.my-entries__name {
  margin: var(--space-1) 0 0;
}

.my-entries__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.my-entries__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--color-bronze);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}
</style>
