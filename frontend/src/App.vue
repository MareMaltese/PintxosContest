<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { SESSION_REQUIRED_ROUTES } from './router/routeGroups';
import NavFooter from './components/common/NavFooter.vue';

const route = useRoute();
const showFooter = computed(() => SESSION_REQUIRED_ROUTES.includes(route.name as string));
</script>

<template>
  <div
    class="app-content"
    :class="{ 'app-content--with-footer': showFooter }"
  >
    <router-view />
  </div>
  <NavFooter v-if="showFooter" />
</template>

<style scoped>
.app-content--with-footer {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
</style>
