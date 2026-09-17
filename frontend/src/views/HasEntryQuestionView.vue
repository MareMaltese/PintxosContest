<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function yes(): void {
  router.push({ name: 'new-entry' });
}

function no(): void {
  router.push({ name: 'waiting-room' });
}
</script>

<template>
  <main class="has-entry">
    <div class="has-entry__card">
      <h1 class="has-entry__title">
        ¿Has traído algún pincho?
      </h1>
      <div class="has-entry__actions">
        <button class="button button--primary button--block" type="button" @click="yes">
          Sí, quiero registrar mi pincho
        </button>
        <button class="button button--secondary button--block" type="button" @click="no">
          No, solo vengo a comer 😄
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.has-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.has-entry__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.has-entry__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.has-entry__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
