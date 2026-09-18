<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';
import Icon from './Icon.vue';

const contest = useContestStore();
const session = useSessionStore();

const showModal = ref(false);
let alreadyShown = false;

function checkAndShow(): void {
  if (alreadyShown) return;
  if (session.user && contest.phase === 'RESULTS') {
    showModal.value = true;
    alreadyShown = true;
  }
}

onMounted(checkAndShow);
watch(() => session.user, checkAndShow);

function dismiss(): void {
  showModal.value = false;
}
</script>

<template>
  <div
    v-if="showModal"
    class="contest-finished-modal"
    @click="dismiss"
  >
    <div
      class="contest-finished-modal__card"
      @click.stop
    >
      <Icon
        name="seal-warning"
        :size="64"
      />
      <h2 class="contest-finished-modal__title">
        Las votaciones ya han finalizado
      </h2>
      <p class="contest-finished-modal__subtitle">
        Ya no puedes participar, pero puedes entrar a ver los resultados.
      </p>
      <button
        class="button button--primary contest-finished-modal__dismiss"
        type="button"
        @click="dismiss"
      >
        Vale
      </button>
    </div>
  </div>
</template>

<style scoped>
.contest-finished-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-5);
}

.contest-finished-modal__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 360px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-danger);
}

.contest-finished-modal__title {
  font-size: 1.4rem;
  margin: var(--space-2) 0 0;
  color: var(--color-text);
}

.contest-finished-modal__subtitle {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
}
</style>
