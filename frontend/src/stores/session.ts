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

  function clear(): void {
    user.value = null;
    clearStoredSession();
  }

  return { user, isRegistering, registerError, register, clear };
});
