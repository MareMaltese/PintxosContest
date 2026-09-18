<script setup lang="ts">
import { ref, watch } from 'vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';
import Icon from './Icon.vue';

const contest = useContestStore();
const session = useSessionStore();

const showModal = ref(false);
let previousPhase = contest.phase;

watch(
  () => contest.phase,
  (phase) => {
    if (session.user && previousPhase === 'REGISTRATION' && phase === 'VOTING') {
      showModal.value = true;
    }
    previousPhase = phase;
  }
);

function dismiss(): void {
  showModal.value = false;
}
</script>

<template>
  <div
    v-if="showModal"
    class="voting-started-modal"
    @click="dismiss"
  >
    <div
      class="voting-started-modal__card"
      @click.stop
    >
      <Icon
        name="hand-coins"
        :size="72"
      />
      <h2 class="voting-started-modal__title">
        ¡Ya ha empezado!
      </h2>
      <p class="voting-started-modal__subtitle">
        ¡Hagan sus votaciones!
      </p>
      <button
        class="button button--primary voting-started-modal__dismiss"
        type="button"
        @click="dismiss"
      >
        Vale
      </button>
    </div>
  </div>
</template>

<style scoped>
.voting-started-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-5);
}

.voting-started-modal__card {
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
  color: var(--color-bronze);
}

.voting-started-modal__title {
  font-size: 1.6rem;
  margin: var(--space-2) 0 0;
  color: var(--color-text);
}

.voting-started-modal__subtitle {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
}
</style>
