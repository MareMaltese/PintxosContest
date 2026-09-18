<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@lucide/vue';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const name = ref('');
const number = ref('');
const touched = ref(false);

const trimmedName = computed(() => name.value.trim());
const parsedNumber = computed(() => Number(number.value));
const isValid = computed(() => trimmedName.value.length > 0 && Number.isInteger(parsedNumber.value) && parsedNumber.value > 0);

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!isValid.value) return;
  try {
    await session.recover(trimmedName.value, parsedNumber.value);
    router.push({ name: 'welcome' });
  } catch {
    // el mensaje de error ya queda reflejado en session.recoverError
  }
}
</script>

<template>
  <main class="recover">
    <form
      class="recover__card"
      @submit.prevent="onSubmit"
    >
      <h1 class="recover__title">
        Recupera tu sesión
      </h1>
      <p class="recover__subtitle">
        Escribe tu nombre y el número de uno de tus pinchos para volver a entrar.
      </p>

      <label
        class="recover__label"
        for="recover-name"
      >Nombre</label>
      <input
        id="recover-name"
        v-model="name"
        class="recover__input"
        type="text"
        placeholder="Tu nombre"
        autocomplete="name"
        maxlength="60"
      >

      <label
        class="recover__label"
        for="recover-number"
      >Número de tu pincho</label>
      <input
        id="recover-number"
        v-model="number"
        class="recover__input"
        type="number"
        inputmode="numeric"
        min="1"
        placeholder="Por ejemplo: 7"
      >

      <p
        v-if="touched && !isValid"
        class="recover__error"
        role="alert"
      >
        Escribe tu nombre y el número de tu pincho.
      </p>
      <p
        v-if="session.recoverError"
        class="recover__error"
        role="alert"
      >
        {{ session.recoverError }}
      </p>

      <button
        class="button button--primary button--block"
        type="submit"
        :disabled="session.isRecovering"
      >
        <span>{{ session.isRecovering ? 'Un momento…' : 'Recuperar sesión' }}</span>
        <ArrowRight
          :size="18"
          aria-hidden="true"
        />
      </button>
    </form>
  </main>
</template>

<style scoped>
.recover {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.recover__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.recover__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-1);
}

.recover__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.recover__label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.recover__input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  margin-bottom: var(--space-4);
}

.recover__input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.recover__error {
  color: var(--color-danger);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
