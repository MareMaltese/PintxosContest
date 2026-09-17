<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminDashboard } from '../../composables/useAdminDashboard';
import { api, ApiError } from '../../services/api';

const { data, isLoading, error, refetch } = useAdminDashboard();

function friendlyMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

async function startContest(): Promise<void> {
  const confirmed = window.confirm(
    'Una vez iniciado el concurso ya no se podrán registrar nuevas tapas. ¿Quieres continuar?'
  );
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/start');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido iniciar el concurso.'));
  }
}

async function closeVoting(): Promise<void> {
  const confirmed = window.confirm('¿Cerrar la votación?');
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/close-voting', {});
    await refetch();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'VOTERS_PENDING') {
      const forceConfirmed = window.confirm(`${err.message} ¿Cerrar igualmente?`);
      if (!forceConfirmed) return;
      try {
        await api.post('/api/admin/contest/close-voting', { force: true });
        await refetch();
      } catch (err2) {
        window.alert(friendlyMessage(err2, 'No hemos podido cerrar la votación.'));
      }
      return;
    }
    window.alert(friendlyMessage(err, 'No hemos podido cerrar la votación.'));
  }
}

async function toggleSelfVote(): Promise<void> {
  if (!data.value) return;
  try {
    await api.patch('/api/admin/contest', { allowSelfVote: !data.value.allowSelfVote });
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido cambiar la configuración.'));
  }
}

async function closeTiebreakRound(): Promise<void> {
  try {
    await api.post('/api/admin/tiebreak/close-round');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido cerrar la ronda.'));
  }
}

async function revealResults(): Promise<void> {
  const confirmed = window.confirm('¿Mostrar los resultados a todo el mundo ahora?');
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/reveal-results');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido mostrar los resultados.'));
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-phases">
      <h1 class="admin-phases__title">
        Control de fases
      </h1>

      <p
        v-if="isLoading"
        class="admin-phases__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-phases__status admin-phases__status--error">
          {{ error }}
        </p>
        <button
          class="button button--secondary"
          type="button"
          @click="refetch"
        >
          Reintentar
        </button>
      </template>
      <div
        v-else-if="data"
        class="admin-phases__actions"
      >
        <button
          v-if="data.phase === 'REGISTRATION'"
          class="button button--primary admin-phases__start"
          type="button"
          @click="startContest"
        >
          Iniciar concurso
        </button>

        <button
          v-if="data.phase === 'VOTING'"
          class="button button--primary admin-phases__close-voting"
          type="button"
          @click="closeVoting"
        >
          Cerrar votación
        </button>

        <button
          v-if="data.phase === 'TIEBREAK'"
          class="button button--primary admin-phases__close-round"
          type="button"
          @click="closeTiebreakRound"
        >
          Cerrar ronda de desempate
        </button>

        <button
          v-if="data.phase === 'RESULTS'"
          class="button button--primary admin-phases__reveal"
          type="button"
          @click="revealResults"
        >
          Mostrar resultados
        </button>

        <button
          class="button button--secondary admin-phases__self-vote"
          type="button"
          @click="toggleSelfVote"
        >
          Autovoto: {{ data.allowSelfVote ? 'permitido' : 'no permitido' }} (cambiar)
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-phases {
  padding: var(--space-5);
  max-width: 480px;
  margin: 0 auto;
}

.admin-phases__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-4);
}

.admin-phases__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-phases__status--error {
  color: var(--color-danger);
}

.admin-phases__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
