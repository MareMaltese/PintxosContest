<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';
import Icon from '../components/common/Icon.vue';

useHeartbeat();
const router = useRouter();
const contest = useContestStore();

watch(
  () => contest.phase,
  (phase) => {
    if (phase !== 'REGISTRATION') {
      router.push({ name: 'gallery' });
    }
  }
);

function goToMyEntries(): void {
  router.push({ name: 'my-entries' });
}
</script>

<template>
  <main class="waiting">
    <div class="waiting__card">
      <h1 class="waiting__title">
        {{ contest.phase === 'REGISTRATION' ? 'Ya estás dentro' : '¡El concurso ha comenzado!' }}
      </h1>
      <p class="waiting__subtitle">
        <template v-if="contest.phase === 'REGISTRATION'">
          Espera a que el anfitrión dé comienzo al concurso. Esta pantalla se
          actualiza sola, no hace falta que recargues.
        </template>
        <template v-else>
          Ya puedes probar las tapas y pinchos para elegir tus favoritos — la galería
          está al caer.
        </template>
      </p>
    </div>

    <button
      v-if="contest.phase === 'REGISTRATION'"
      class="waiting__edit"
      type="button"
      aria-label="Ver y editar mis pinchos"
      @click="goToMyEntries"
    >
      <Icon
        name="pencil"
        :size="28"
      />
    </button>
  </main>
</template>

<style scoped>
.waiting {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background-image: url('../assets/cartel.jpeg');
  background-size: cover;
  background-position: center;
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

.waiting__edit {
  position: fixed;
  right: var(--space-5);
  bottom: var(--space-5);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: none;
  background: var(--color-bronze);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  cursor: pointer;
}
</style>
