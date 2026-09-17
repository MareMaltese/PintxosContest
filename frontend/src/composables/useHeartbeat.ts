import { onMounted, onUnmounted } from 'vue';
import { api } from '../services/api';
import { useSessionStore } from '../stores/session';

const HEARTBEAT_INTERVAL_MS = 20_000;

export function useHeartbeat(): void {
  const session = useSessionStore();
  let timer: ReturnType<typeof setInterval> | undefined;

  function send(): void {
    if (!session.user) return;
    api.post(`/api/users/${session.user.id}/heartbeat`).catch(() => {
      // un heartbeat fallido no debe interrumpir la experiencia
    });
  }

  onMounted(() => {
    send();
    timer = setInterval(send, HEARTBEAT_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });
}
