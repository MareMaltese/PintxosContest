<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';

const route = useRoute();
const router = useRouter();

const canGoBack = ref(false);

function updateCanGoBack(): void {
  const state = window.history.state as { back?: string | null } | null;
  canGoBack.value = Boolean(state?.back);
}

updateCanGoBack();
watch(() => route.fullPath, updateCanGoBack);

const showBack = computed(() => canGoBack.value && route.name !== 'tiebreak');

function goBack(): void {
  router.back();
}

function goToGallery(): void {
  router.push({ name: 'gallery' });
}

function goToMyEntries(): void {
  router.push({ name: 'my-entries' });
}
</script>

<template>
  <nav class="nav-footer">
    <button
      v-if="showBack"
      class="nav-footer__button nav-footer__back"
      type="button"
      @click="goBack"
    >
      <Icon
        name="arrow-left"
        :size="22"
      />
      <span>ATRÁS</span>
    </button>
    <span
      v-else
      class="nav-footer__spacer"
    />

    <button
      class="nav-footer__button nav-footer__gallery"
      type="button"
      @click="goToGallery"
    >
      <Icon
        name="grid-nine"
        :size="22"
      />
      <span>TODOS LOS PINCHOS</span>
    </button>

    <button
      class="nav-footer__button nav-footer__mine"
      type="button"
      @click="goToMyEntries"
    >
      <Icon
        name="pincho"
        :size="22"
      />
      <span>MIS PINCHOS</span>
    </button>
  </nav>
</template>

<style scoped>
.nav-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  padding: var(--space-2) var(--space-1);
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
}

.nav-footer__button,
.nav-footer__spacer {
  flex: 1;
}

.nav-footer__button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-1);
}

.nav-footer__button span {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
