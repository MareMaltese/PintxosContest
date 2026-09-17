<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goTo(name: string): void {
  router.push({ name });
}
</script>

<template>
  <nav class="admin-nav">
    <button
      type="button"
      @click="goTo('admin-dashboard')"
    >
      Dashboard
    </button>
    <button
      type="button"
      @click="goTo('admin-participants')"
    >
      Participantes
    </button>
    <button
      type="button"
      @click="goTo('admin-entries')"
    >
      Tapas
    </button>
    <button
      type="button"
      @click="goTo('admin-phases')"
    >
      Fases
    </button>
    <button
      type="button"
      @click="goTo('admin-medal-votes')"
    >
      Pintx-o-visión
    </button>
  </nav>
</template>

<style scoped>
.admin-nav {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.admin-nav button {
  background: none;
  border: none;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.admin-nav button:hover {
  background: var(--color-bg);
  color: var(--color-text);
}
</style>
