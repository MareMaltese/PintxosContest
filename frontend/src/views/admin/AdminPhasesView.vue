<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import Icon from '../../components/common/Icon.vue';
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

async function toggleVotingMode(): Promise<void> {
  if (!data.value) return;
  const next = data.value.votingMode === 'FAVORITES' ? 'MEDALS' : 'FAVORITES';
  if (data.value.phase !== 'REGISTRATION') {
    const confirmed = window.confirm(
      'Ya se ha empezado a votar. Los votos ya emitidos con el sistema actual no se perderán, pero quedarán ocultos y no contarán para el resultado que se muestre. ¿Seguro que quieres cambiar el tipo de puntuación?'
    );
    if (!confirmed) return;
  }
  try {
    await api.patch('/api/admin/contest', { votingMode: next });
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido cambiar la configuración.'));
  }
}

async function toggleWorstPrize(): Promise<void> {
  if (!data.value) return;
  try {
    await api.patch('/api/admin/contest', { worstPrizeEnabled: !data.value.worstPrizeEnabled });
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

async function reopenVoting(): Promise<void> {
  const confirmed = window.confirm(
    '¿Volver a la votación? Los resultados dejarán de mostrarse hasta que los reveles de nuevo.'
  );
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/reopen-voting');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido volver a la votación.'));
  }
}

async function backToRegistration(): Promise<void> {
  const confirmed = window.confirm(
    '¿Volver al inicio? Se reabrirá el registro: los participantes podrán volver a editar y añadir pinchos, y la votación quedará cerrada hasta que inicies el concurso de nuevo.'
  );
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/back-to-registration');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido volver al inicio.'));
  }
}
</script>

<template>
  <div class="admin-page">
    <AdminNav />
    <main class="admin-phases">
      <h1 class="admin-phases__title">
        Administración
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
          v-if="data.phase === 'RESULTS' && !data.resultsRevealedAt"
          class="button button--primary admin-phases__reveal"
          type="button"
          @click="revealResults"
        >
          Mostrar resultados
        </button>

        <button
          v-if="data.phase === 'RESULTS' && data.resultsRevealedAt"
          class="button button--secondary admin-phases__reopen-voting"
          type="button"
          @click="reopenVoting"
        >
          <Icon
            name="check"
            :size="20"
          />
          Volver a votación
        </button>

        <button
          v-if="data.phase !== 'REGISTRATION'"
          class="button button--secondary admin-phases__back-to-registration"
          type="button"
          @click="backToRegistration"
        >
          Volver al inicio (reabrir registro)
        </button>

        <button
          class="button button--secondary admin-phases__self-vote"
          type="button"
          @click="toggleSelfVote"
        >
          Autovoto: {{ data.allowSelfVote ? 'permitido' : 'no permitido' }} (cambiar)
        </button>

        <button
          class="button button--secondary admin-phases__voting-mode"
          type="button"
          @click="toggleVotingMode"
        >
          <Icon
            :name="data.votingMode === 'FAVORITES' ? 'heart' : 'medal'"
            :size="20"
          />
          Modo de puntuación: {{ data.votingMode === 'FAVORITES' ? 'Favoritos' : 'Medallas' }} (cambiar)
        </button>

        <button
          v-if="data.votingMode === 'MEDALS'"
          class="button button--secondary admin-phases__worst-prize"
          type="button"
          @click="toggleWorstPrize"
        >
          Premio al último: {{ data.worstPrizeEnabled ? 'activado' : 'desactivado' }} (cambiar)
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
  text-align: center;
  border-bottom: 1px solid var(--color-title);
  padding: 0.8rem 0.5rem 0.5rem 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.admin-phases__status {
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-3);
  margin-top: var(--space-4);
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
