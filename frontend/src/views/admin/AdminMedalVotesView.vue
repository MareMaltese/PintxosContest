<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminMedalVotes } from '../../composables/useAdminMedalVotes';

const { data, isLoading, error, refetch } = useAdminMedalVotes();
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-medal-votes">
      <h1 class="admin-medal-votes__title">
        Pinch-o-visión
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
      <table
        v-else-if="data"
        class="admin-table"
      >
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
            v-for="entry in data"
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
  padding: var(--space-6) 0 var(--space-3);
}

.admin-medal-votes__status--error {
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
</style>
