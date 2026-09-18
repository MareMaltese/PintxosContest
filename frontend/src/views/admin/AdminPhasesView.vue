<script setup lang="ts">
import { computed } from 'vue';
import AdminNav from '../../components/admin/AdminNav.vue';
import Icon from '../../components/common/Icon.vue';
import { useAdminDashboard } from '../../composables/useAdminDashboard';
import { useTiebreakHistory, type TiebreakHistoryRound } from '../../composables/useTiebreakHistory';
import { api, ApiError } from '../../services/api';
import { tiebreakRoundLabel } from '../../utils/tiebreakLabels';

const { data, isLoading, error, refetch } = useAdminDashboard();
const { data: history } = useTiebreakHistory();

const roundLabel = computed(() => (data.value?.openRound ? tiebreakRoundLabel(data.value.openRound) : null));

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function resultLabel(round: TiebreakHistoryRound): string {
  if (round.status === 'OPEN') return 'Ronda abierta, esperando votos';
  if (round.result === 'STILL_TIED') return 'Sigue empatado — se reabrió otra ronda';
  const winner = round.candidates.find((c) => c.entryId === round.winnerEntryId);
  return winner ? `Resuelto: ganó la tapa #${String(winner.number).padStart(2, '0')}` : 'Resuelto';
}

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

        <template v-if="data.phase === 'TIEBREAK'">
          <p
            v-if="roundLabel"
            class="admin-phases__round-info"
          >
            <Icon
              :name="roundLabel.icon"
              :size="36"
              :style="{ color: roundLabel.color }"
            />
            {{ roundLabel.title }}
          </p>

          <button
            v-if="data.openRound"
            class="button button--primary admin-phases__close-round"
            type="button"
            @click="closeTiebreakRound"
          >
            Cerrar ronda de desempate
          </button>
          <p
            v-else
            class="admin-phases__round-info"
          >
            Hay un empate pendiente por resolver. Ve a la pestaña
            <strong>Clasificación</strong> para iniciar esa votación de desempate.
          </p>
        </template>

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
            name="arrow-circle-left"
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
          <Icon
            name="hamburger"
            :size="20"
          />
          Volver al inicio (reabrir registro)
        </button>

        <h1
          class="admin-phases__title"
          style="margin-top:var(--space-8); 
          margin-bottom:0"
        >
          configuración
        </h1>
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

        <template v-if="history.length > 0">
          <h1
            class="admin-phases__title"
            style="margin-top:var(--space-8)"
          >
            Historial de desempates
          </h1>
          <div
            v-for="round in history"
            :key="round.id"
            class="admin-phases__history-round"
          >
            <div class="admin-phases__history-header">
              <Icon
                :name="tiebreakRoundLabel(round).icon"
                :size="24"
                :style="{ color: tiebreakRoundLabel(round).color }"
              />
              <span>{{ tiebreakRoundLabel(round).title }} — ronda {{ round.roundNumber }}</span>
            </div>
            <p class="admin-phases__history-result">
              {{ resultLabel(round) }}
            </p>
            <ul class="admin-phases__history-tally">
              <li
                v-for="candidate in round.candidates"
                :key="candidate.entryId"
              >
                #{{ String(candidate.number).padStart(2, '0') }} {{ candidate.name ?? '' }} —
                {{ candidate.votes }} voto(s)
              </li>
            </ul>
            <details
              v-if="round.votes.length > 0"
              class="admin-phases__history-log"
            >
              <summary>Ver votos ({{ round.votes.length }})</summary>
              <ul>
                <li
                  v-for="(vote, index) in round.votes"
                  :key="index"
                >
                  {{ vote.userName }} → #{{ String(vote.entryNumber).padStart(2, '0') }}
                  ({{ formatTime(vote.createdAt) }})
                </li>
              </ul>
            </details>
          </div>
        </template>
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

.admin-phases__round-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3);
  margin: 0;
  font-weight: 600;
}

.admin-phases__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.admin-phases__history-round {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-phases__history-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}

.admin-phases__history-result {
  margin: 0;
  color: var(--color-text-muted);
}

.admin-phases__history-tally {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.9rem;
}

.admin-phases__history-log summary {
  cursor: pointer;
  color: var(--color-primary);
  font-size: 0.85rem;
}

.admin-phases__history-log ul {
  list-style: none;
  padding: 0;
  margin: var(--space-2) 0 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
