<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { coverImageUrl } from '../services/coverImage';

const router = useRouter();
const session = useSessionStore();

function goToRegister(): void {
  router.push({ name: 'register' });
}
</script>

<template>
  <main class="welcome">
    <div class="welcome__card">
      <template v-if="!session.user">
        <img
          v-if="coverImageUrl"
          :src="coverImageUrl"
          alt=""
          class="welcome__cover"
        >
        <h1 class="welcome__title">
          ¡Bienvenido al primer concurso de tapas y pinchos!
        </h1>
        <p class="welcome__subtitle">
          Que empiece el picoteo!
        </p>
        <button
          class="button button--primary"
          type="button"
          @click="goToRegister"
        >
          Participar
        </button>
      </template>
      <template v-else>
        <h1 class="welcome__title">
          ¡Hola, {{ session.user.name }}!
        </h1>
        <p class="welcome__subtitle">
          Ya estás dentro del concurso. Muy pronto podrás registrar tu pincho.
        </p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.welcome__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.welcome__title {
  font-size: 1.75rem;
  margin: 0 0 var(--space-2);
}

.welcome__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.welcome__cover {
  width: 100%;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
</style>
