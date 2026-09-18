<script setup lang="ts">
import { useRouter } from 'vue-router';
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminDashboard } from '../../composables/useAdminDashboard';

const router = useRouter();
const { data, isLoading, error, refetch } = useAdminDashboard();

function goTo(name: string): void {
  router.push({ name });
}

const PHASE_LABELS: Record<string, string> = {
  REGISTRATION: 'Registro',
  VOTING: 'Votación',
  TIEBREAK: 'Desempate',
  RESULTS: 'Resultados',
};

const VOTING_MODE_LABELS: Record<string, string> = {
  FAVORITES: 'Favoritos',
  MEDALS: 'Medallas',
};
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-dashboard">
      <p
        v-if="isLoading"
        class="admin-dashboard__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-dashboard__status admin-dashboard__status--error">
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
        class="admin-dashboard__grid"
      >
        <button
          class="admin-card"
          type="button"
          @click="goTo('admin-phases')"
        >
          <p class="admin-card__label">
            Fase actual
          </p>
          <p class="admin-card__value">
            {{ PHASE_LABELS[data.phase] }}
          </p>
        </button>
        <button
          class="admin-card"
          type="button"
          @click="goTo('admin-participants')"
        >
          <p class="admin-card__label">
            Participantes
          </p>
          <p class="admin-card__value">
            {{ data.participantCount }}
          </p>
        </button>
        <button
          class="admin-card"
          type="button"
          @click="goTo('admin-entries')"
        >
          <p class="admin-card__label">
            Tapas y Pinchos
          </p>
          <p class="admin-card__value">
            {{ data.entryCount }}
          </p>
        </button>
        <button
          class="admin-card"
          type="button"
          @click="goTo('admin-phases')"
        >
          <p class="admin-card__label">
            Tipo de puntuación
          </p>
          <p class="admin-card__value">
            {{ VOTING_MODE_LABELS[data.votingMode] }}
          </p>
        </button>
        <div
          v-if="data.votingMode === 'FAVORITES'"
          class="admin-card"
        >
          <p class="admin-card__label">
            Han terminado de votar
          </p>
          <p class="admin-card__value">
            {{ data.votersFinished }} / {{ data.votersTotal }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-dashboard {
  padding: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
}

.admin-dashboard__status {
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-3);
  margin-top: var(--space-4);
}

.admin-dashboard__status--error {
  color: var(--color-danger);
}

.admin-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.admin-card {
  display: block;
  width: 100%;
  border: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
}

.admin-card__label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0 0 var(--space-1);
}

.admin-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
</style>
