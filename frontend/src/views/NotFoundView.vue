<script setup lang="ts">
import { useRouter } from 'vue-router';
import Icon from '../components/common/Icon.vue';

const router = useRouter();

function goHome(): void {
  router.push({ name: 'welcome' });
}
</script>

<template>
  <main class="not-found">
    <div class="not-found__card">
      <Icon
        name="ghost"
        :size="48"
      />
      <h1 class="not-found__title">
        404
      </h1>
      <p class="not-found__subtitle">
        Esta página se ha comido el último pincho. No existe.
      </p>
      <button
        class="button button--primary not-found__home"
        type="button"
        @click="goHome"
      >
        Volver al inicio
      </button>
    </div>
  </main>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.not-found__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.not-found__title {
  font-size: 2.5rem;
  margin: 0;
}

.not-found__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-2);
}
</style>
