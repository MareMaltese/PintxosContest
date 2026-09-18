<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { SESSION_REQUIRED_ROUTES, NO_FOOTER_ROUTES } from './router/routeGroups';
import NavFooter from './components/common/NavFooter.vue';
import VotingStartedModal from './components/common/VotingStartedModal.vue';
import ResultsRevealedModal from './components/common/ResultsRevealedModal.vue';
import ContestFinishedModal from './components/common/ContestFinishedModal.vue';

const route = useRoute();
const showFooter = computed(
  () => SESSION_REQUIRED_ROUTES.includes(route.name as string) && !NO_FOOTER_ROUTES.includes(route.name as string)
);
</script>

<template>
  <div
    class="app-content"
    :class="{ 'app-content--with-footer': showFooter }"
  >
    <router-view />
  </div>
  <NavFooter v-if="showFooter" />
  <VotingStartedModal />
  <ResultsRevealedModal />
  <ContestFinishedModal />
</template>

<style scoped>
.app-content--with-footer {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
</style>
