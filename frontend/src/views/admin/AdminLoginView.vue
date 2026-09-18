<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminAuthStore } from '../../stores/adminAuth';

const router = useRouter();
const adminAuth = useAdminAuthStore();
const pin = ref('');
const touched = ref(false);

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!pin.value.trim()) return;
  try {
    await adminAuth.login(pin.value.trim());
    router.push({ name: 'admin-dashboard' });
  } catch {
    // el mensaje de error ya queda reflejado en adminAuth.loginError
  }
}
</script>

<template>
  <main class="admin-login admin-page">
    <form
      class="admin-login__card"
      @submit.prevent="onSubmit"
    >
      <h1 class="admin-login__title">
        Panel de administración
      </h1>
      <p class="admin-login__subtitle">
        Introduce el PIN del anfitrión.
      </p>

      <label
        class="admin-login__label"
        for="admin-pin"
      >PIN</label>
      <input
        id="admin-pin"
        v-model="pin"
        class="admin-login__input"
        type="password"
        inputmode="numeric"
        autocomplete="off"
      >
      <p
        v-if="touched && !pin.trim()"
        class="admin-login__error"
        role="alert"
      >
        Escribe el PIN para continuar.
      </p>
      <p
        v-if="adminAuth.loginError"
        class="admin-login__error"
        role="alert"
      >
        {{ adminAuth.loginError }}
      </p>

      <button
        class="button button--primary button--block"
        type="submit"
        :disabled="adminAuth.isLoggingIn"
      >
        {{ adminAuth.isLoggingIn ? 'Comprobando…' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.admin-login__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 360px;
  width: 100%;
}

.admin-login__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-1);
}

.admin-login__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.admin-login__label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.admin-login__input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  margin-bottom: var(--space-4);
}

.admin-login__error {
  color: var(--color-danger);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
