import { ref } from 'vue';
import { defineStore } from 'pinia';
import { getStoredAdminPin, saveAdminPin, clearAdminPin } from '../services/adminAuth';

export const useAdminAuthStore = defineStore('adminAuth', () => {
  const pin = ref<string | null>(getStoredAdminPin());
  const isLoggingIn = ref(false);
  const loginError = ref<string | null>(null);

  async function login(candidatePin: string): Promise<void> {
    isLoggingIn.value = true;
    loginError.value = null;
    try {
      const response = await fetch('/api/admin/dashboard', {
        headers: { 'X-Admin-Pin': candidatePin },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'PIN incorrecto.' : 'No hemos podido comprobar el PIN.');
      }
      saveAdminPin(candidatePin);
      pin.value = candidatePin;
    } catch (err) {
      loginError.value = err instanceof Error ? err.message : 'No hemos podido comprobar el PIN.';
      throw err;
    } finally {
      isLoggingIn.value = false;
    }
  }

  function logout(): void {
    pin.value = null;
    clearAdminPin();
  }

  return { pin, isLoggingIn, loginError, login, logout };
});
