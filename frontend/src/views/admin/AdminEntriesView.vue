<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AdminNav from '../../components/admin/AdminNav.vue';
import { api, ApiError } from '../../services/api';

interface AdminEntry {
  id: string;
  number: number;
  creatorId: string;
  creatorName: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
  voteCount: number;
  gold: number;
  silver: number;
  bronze: number;
}

const entries = ref<AdminEntry[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

async function fetchEntries(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    entries.value = await api.get<AdminEntry[]>('/api/admin/entries');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar las tapas.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(fetchEntries);

async function editEntry(entry: AdminEntry): Promise<void> {
  const newName = window.prompt('Nombre de la tapa (vacío para quitar)', entry.name ?? '');
  if (newName === null) return;
  const newDescription = window.prompt('Descripción (vacío para quitar)', entry.description ?? '');
  if (newDescription === null) return;
  try {
    await api.patch(`/api/admin/entries/${entry.id}`, {
      name: newName.trim() || null,
      description: newDescription.trim() || null,
    });
    await fetchEntries();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido editar la tapa.');
  }
}

async function deleteEntry(entry: AdminEntry): Promise<void> {
  const confirmed = window.confirm(`¿Eliminar la tapa #${entry.number}? Esto no se puede deshacer.`);
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/entries/${entry.id}`);
    await fetchEntries();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido eliminar la tapa.');
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-entries">
      <h1 class="admin-entries__title">
        Tapas
      </h1>

      <p
        v-if="isLoading"
        class="admin-entries__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-entries__status admin-entries__status--error">
          {{ error }}
        </p>
        <button
          class="button button--secondary"
          type="button"
          @click="fetchEntries"
        >
          Reintentar
        </button>
      </template>
      <table
        v-else
        class="admin-table"
      >
        <thead>
          <tr>
            <th>Nº</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Creador</th>
            <th>Favoritos</th>
            <th>Oro</th>
            <th>Plata</th>
            <th>Bronce</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in entries"
            :key="entry.id"
          >
            <td>#{{ String(entry.number).padStart(2, '0') }}</td>
            <td>{{ entry.name ?? '—' }}</td>
            <td>{{ entry.description ?? '—' }}</td>
            <td>{{ entry.creatorName }}</td>
            <td>{{ entry.voteCount }}</td>
            <td>{{ entry.gold }}</td>
            <td>{{ entry.silver }}</td>
            <td>{{ entry.bronze }}</td>
            <td>
              <button
                class="admin-table__edit"
                type="button"
                @click="editEntry(entry)"
              >
                Editar
              </button>
              <button
                class="admin-table__delete"
                type="button"
                @click="deleteEntry(entry)"
              >
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.admin-entries {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.admin-entries__title {
  font-size: 1.4rem;
  margin: 0;
  text-align: center;
  border-bottom: 1px solid var(--color-title);
  padding: 0.8rem 0.5rem 0.5rem 0.5rem;
  background: var(--color-surface);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.admin-entries__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-entries__status--error {
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

.admin-table__delete {
  color: var(--color-danger) !important;
}
</style>
