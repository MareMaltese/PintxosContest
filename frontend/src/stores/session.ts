import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';
import { loadStoredSession, saveStoredSession, clearStoredSession } from '../services/sessionStorage';

export interface SessionUser {
  id: string;
  name: string;
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(loadStoredSession());
  const isRegistering = ref(false);
  const registerError = ref<string | null>(null);
  const isRecovering = ref(false);
  const recoverError = ref<string | null>(null);

  async function register(name: string): Promise<void> {
    isRegistering.value = true;
    registerError.value = null;
    try {
      const created = await api.post<SessionUser>('/api/users', { name });
      user.value = created;
      saveStoredSession(created);
    } catch (err) {
      registerError.value = err instanceof ApiError ? err.message : 'No hemos podido completar tu registro.';
      throw err;
    } finally {
      isRegistering.value = false;
    }
  }

  async function recover(name: string, number: number): Promise<void> {
    isRecovering.value = true;
    recoverError.value = null;
    try {
      const recovered = await api.post<SessionUser>('/api/users/recover', { name, number });
      user.value = recovered;
      saveStoredSession(recovered);
    } catch (err) {
      recoverError.value = err instanceof ApiError ? err.message : 'No hemos podido recuperar tu sesión.';
      throw err;
    } finally {
      isRecovering.value = false;
    }
  }

  function clear(): void {
    user.value = null;
    clearStoredSession();
  }

  return {
    user,
    isRegistering,
    registerError,
    isRecovering,
    recoverError,
    register,
    recover,
    clear,
  };
});
