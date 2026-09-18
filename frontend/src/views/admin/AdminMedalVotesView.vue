<script setup lang="ts">
import { ref } from 'vue';
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminMedalVotes } from '../../composables/useAdminMedalVotes';
import { api, ApiError } from '../../services/api';

const { data, isLoading, error, refetch } = useAdminMedalVotes();

const isStarting = ref(false);

async function startWorstTiebreak(): Promise<void> {
  isStarting.value = true;
  try {
    await api.post('/api/admin/tiebreak/start-worst');
    await refetch();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido iniciar el desempate.');
  } finally {
    isStarting.value = false;
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-medal-votes">
      <h1 class="admin-medal-votes__title">
        Clasificación
      </h1>

      <p
        v-if="isLoading"
        class="admin-medal-votes__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-medal-votes__status admin-medal-votes__status--error">
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
      <template v-else-if="data">
        <p
          v-if="data.pendingWorstTie"
          class="admin-medal-votes__tie-notice"
        >
          Hay un empate en el premio al último. Inicia la votación de desempate cuando quieras.
        </p>
        <button
          v-if="data.pendingWorstTie"
          class="button button--primary admin-medal-votes__start-worst"
          type="button"
          :disabled="isStarting"
          @click="startWorstTiebreak"
        >
          Iniciar votación de desempate: premio al último
        </button>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Nombre</th>
              <th>Oro</th>
              <th>Plata</th>
              <th>Bronce</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in data.standings"
              :key="entry.entryId"
            >
              <td>#{{ String(entry.number).padStart(2, '0') }}</td>
              <td>{{ entry.name ?? '—' }}</td>
              <td>{{ entry.gold }}</td>
              <td>{{ entry.silver }}</td>
              <td>{{ entry.bronze }}</td>
              <td>{{ entry.total }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </main>
  </div>
</template>

<style scoped>
.admin-medal-votes {
  padding: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
}

.admin-medal-votes__title {
  font-size: 1.4rem;
  margin: 0;
  text-align: center;
  border-bottom: 1px solid var(--color-title);
  padding: 0.8rem 0.5rem 0.5rem 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.admin-medal-votes__status {
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4) var(--space-3);
  margin-top: var(--space-4);
}

.admin-medal-votes__status--error {
  color: var(--color-danger);
}

.admin-medal-votes__tie-notice {
  background: var(--color-surface);
  color: var(--color-text);
  padding: var(--space-3);
  margin: var(--space-3) 0 0;
  border-radius: var(--radius-md);
  text-align: center;
}

.admin-medal-votes__start-worst {
  display: block;
  width: 100%;
  margin: var(--space-2) 0 var(--space-4);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.admin-table th,
.admin-table td {
  text-align: left;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
</style>
