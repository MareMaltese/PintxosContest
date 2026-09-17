<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import Icon from '../../components/common/Icon.vue';
import { useAdminDashboard, type AdminPerson } from '../../composables/useAdminDashboard';
import { formatRelativeTime } from '../../services/relativeTime';
import { api, ApiError } from '../../services/api';

const { data, isLoading, error, refetch } = useAdminDashboard();

function entryLabels(person: AdminPerson): string {
  if (person.entryNumbers.length === 0) return '—';
  return person.entryNumbers.map((n) => `#${String(n).padStart(2, '0')}`).join(', ');
}

async function renamePerson(person: AdminPerson): Promise<void> {
  const newName = window.prompt('Nuevo nombre', person.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === person.name) return;
  try {
    await api.patch(`/api/admin/users/${person.id}`, { name: trimmed });
    await refetch();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido renombrar.');
  }
}

async function deletePerson(person: AdminPerson): Promise<void> {
  const confirmed = window.confirm(`¿Eliminar a ${person.name}? Esto borrará también sus tapas y votos.`);
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/users/${person.id}`);
    await refetch();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido eliminar al participante.');
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-participants">
      <h1 class="admin-participants__title">
        Participantes
      </h1>
      <p
        v-if="isLoading"
        class="admin-participants__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-participants__status admin-participants__status--error">
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
      <table
        v-else-if="data"
        class="admin-table"
      >
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Pinchos</th>
            <th>Votos</th>
            <th>Última actividad</th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in data.people"
            :key="person.id"
          >
            <td>{{ person.name }}</td>
            <td>{{ entryLabels(person) }}</td>
            <td>{{ person.votedCount }} / {{ person.voteLimit }} — {{ person.hasFinishedVoting ? 'Completo' : 'Pendiente' }}</td>
            <td>{{ formatRelativeTime(person.lastSeen) }}</td>
            <td>
              <button
                class="admin-table__edit"
                type="button"
                aria-label="Editar"
                @click="renamePerson(person)"
              >
                <Icon
                  name="pencil"
                  :size="18"
                />
              </button>
            </td>
            <td>
              <button
                class="admin-table__delete"
                type="button"
                aria-label="Eliminar"
                @click="deletePerson(person)"
              >
                <Icon
                  name="trash"
                  :size="18"
                />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.admin-participants {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.admin-participants__title {
  font-size: 1.4rem;
  margin: 0;
  text-align: center;
  border-bottom: 1px solid var(--color-title);
  padding: 0.8rem 0.5rem 0.5rem 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.admin-participants__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-participants__status--error {
  color: var(--color-danger);
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

.admin-table button {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.admin-table__edit {
  color: var(--color-bronze) !important;
}

.admin-table__delete {
  color: var(--color-danger) !important;
}
</style>
