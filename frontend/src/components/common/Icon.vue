<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });

const icons = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const svg = computed(() => {
  const entry = Object.entries(icons).find(([path]) => path.endsWith(`/${props.name}.svg`));
  return entry?.[1] ?? '';
});
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- svg content comes from our own bundled assets, never user input -->
  <span
    class="icon"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
    v-html="svg"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.icon {
  display: inline-flex;
  flex-shrink: 0;
  color: inherit;
}

.icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
