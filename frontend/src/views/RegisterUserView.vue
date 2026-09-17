<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@lucide/vue';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const name = ref('');
const touched = ref(false);

function trimmedName(): string {
  return name.value.trim();
}

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!trimmedName()) return;
  try {
    await session.register(trimmedName());
    router.push({ name: 'welcome' });
  } catch {
    // el mensaje de error ya queda reflejado en session.registerError
  }
}
</script>

<template>
  <main class="register">
    <form class="register__card" @submit.prevent="onSubmit">
      <h1 class="register__title">¿Cómo te llamas?</h1>
      <p class="register__subtitle">Solo necesitamos tu nombre, nada más.</p>

      <label class="register__label" for="name">Nombre</label>
      <input
        id="name"
        v-model="name"
        class="register__input"
        type="text"
        placeholder="Tu nombre"
        autocomplete="name"
        maxlength="60"
        :aria-invalid="touched && !trimmedName()"
      />
      <p v-if="touched && !trimmedName()" class="register__error" role="alert">
        Escribe tu nombre para continuar.
      </p>
      <p v-if="session.registerError" class="register__error" role="alert">
        {{ session.registerError }}
      </p>

      <button class="button button--primary button--block" type="submit" :disabled="session.isRegistering">
        <span>{{ session.isRegistering ? 'Un momento…' : 'Participar' }}</span>
        <ArrowRight :size="18" aria-hidden="true" />
      </button>
    </form>
  </main>
</template>

<style scoped>
.register {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.register__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.register__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-1);
}

.register__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.register__label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.register__input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  margin-bottom: var(--space-4);
}

.register__input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.register__error {
  color: var(--color-danger);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
