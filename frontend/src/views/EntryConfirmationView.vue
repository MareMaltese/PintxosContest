<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEntriesStore } from '../stores/entries';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();

const number = computed(() => route.params.number as string);
const paddedNumber = computed(() => number.value.padStart(2, '0'));
const imageUrl = computed(() => (entries.lastCreated ? `/uploads/${entries.lastCreated.imagePath}` : null));

function registerAnother(): void {
  router.push({ name: 'new-entry' });
}

function finish(): void {
  router.push({ name: 'gallery' });
}
</script>

<template>
  <main class="confirmation">
    <div class="confirmation__card">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="`Foto del pincho número ${number}`"
        class="confirmation__photo"
      >
      <p class="confirmation__badge">
        PINCHO Nº {{ paddedNumber }}
      </p>
      <h1 class="confirmation__title">
        ¡Tu pincho ya está compitiendo!
      </h1>

      <div class="confirmation__actions">
        <button
          class="button button--secondary button--block"
          type="button"
          @click="registerAnother"
        >
          Registrar otro pincho
        </button>
        <button
          class="button button--primary button--block"
          type="button"
          @click="finish"
        >
          Terminar
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.confirmation {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.confirmation__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.confirmation__photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.confirmation__badge {
  display: inline-block;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
  margin: 0 0 var(--space-2);
}

.confirmation__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.confirmation__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
