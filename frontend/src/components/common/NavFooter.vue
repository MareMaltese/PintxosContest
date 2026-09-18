<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { useContestStore } from '../../stores/contest';

const route = useRoute();
const router = useRouter();
const contest = useContestStore();

const canGoBack = ref(false);

function updateCanGoBack(): void {
  const state = window.history.state as { back?: string | null } | null;
  canGoBack.value = Boolean(state?.back);
}

updateCanGoBack();
watch(() => route.fullPath, updateCanGoBack);

const showRanking = computed(() => contest.phase === 'RESULTS' && contest.votingMode === 'MEDALS');
const showBack = computed(() => !showRanking.value && canGoBack.value && route.name !== 'tiebreak');
const isGalleryActive = computed(() => route.name === 'gallery' || route.name === 'entry-detail');
const isMineActive = computed(() => route.name === 'my-entries' || route.name === 'edit-entry');

function goBack(): void {
  router.back();
}

function goToGallery(): void {
  router.push({ name: 'gallery' });
}

function goToMyEntries(): void {
  router.push({ name: 'my-entries' });
}

function goToRanking(): void {
  router.push({ name: 'medal-results' });
}
</script>

<template>
  <nav class="nav-footer">
    <button
      v-if="showRanking"
      class="nav-footer__button nav-footer__ranking"
      type="button"
      @click="goToRanking"
    >
      <Icon
        name="crown"
        :size="32"
      />
      <span>RANKING</span>
    </button>
    <button
      v-else-if="showBack"
      class="nav-footer__button nav-footer__back"
      type="button"
      @click="goBack"
    >
      <Icon
        name="arrow-left"
        :size="32"
      />
      <span>ATRÁS</span>
    </button>
    <span
      v-else
      class="nav-footer__spacer"
    />

    <button
      class="nav-footer__button nav-footer__gallery"
      :class="{ 'nav-footer__button--active': isGalleryActive }"
      type="button"
      @click="goToGallery"
    >
      <Icon
        name="grid-nine"
        :size="32"
      />
      <span>TODOS LOS PINCHOS</span>
    </button>

    <button
      class="nav-footer__button nav-footer__mine"
      :class="{ 'nav-footer__button--active': isMineActive }"
      type="button"
      @click="goToMyEntries"
    >
      <Icon
        name="pincho"
        :size="32"
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
  border-top: 1px solid var(--color-title);
  box-shadow: var(--shadow-md);
}

.nav-footer__button,
.nav-footer__spacer {
  flex: 1;
}

.nav-footer__button {
  padding: var(--space-2) var(--space-1);
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}

.nav-footer__button span {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.nav-footer__button--active {
  color: #fff;
  background: var(--color-title);
}

.nav-footer__button:active {
  color: var(--color-text);
}
</style>
