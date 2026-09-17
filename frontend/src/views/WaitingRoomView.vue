<script setup lang="ts">
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';

useHeartbeat();
const contest = useContestStore();
</script>

<template>
  <main class="waiting">
    <div class="waiting__card">
      <h1 class="waiting__title">
        {{ contest.phase === 'REGISTRATION' ? 'Ya estás dentro' : '¡El concurso ha empezado!' }}
      </h1>
      <p class="waiting__subtitle">
        <template v-if="contest.phase === 'REGISTRATION'">
          Espera a que el anfitrión dé comienzo al concurso. Esta pantalla se
          actualiza sola, no hace falta que recargues.
        </template>
        <template v-else>
          Ya puedes probar los pinchos y elegir tus favoritos — la galería
          está al caer.
        </template>
      </p>
    </div>
  </main>
</template>

<style scoped>
.waiting {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.waiting__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.waiting__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-2);
}

.waiting__subtitle {
  color: var(--color-text-muted);
  margin: 0;
}
</style>
