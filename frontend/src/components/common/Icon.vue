<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });

const svgIcons = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const pngIcons = import.meta.glob('../../assets/icons/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const svg = computed(() => {
  const entry = Object.entries(svgIcons).find(([path]) => path.endsWith(`/${props.name}.svg`));
  return entry?.[1] ?? '';
});

const pngUrl = computed(() => {
  const entry = Object.entries(pngIcons).find(([path]) => path.endsWith(`/${props.name}.png`));
  return entry?.[1] ?? null;
});
</script>

<template>
  <img
    v-if="pngUrl"
    :src="pngUrl"
    :alt="name"
    class="icon"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
  <!-- eslint-disable vue/no-v-html -- svg content comes from our own bundled assets, never user input -->
  <span
    v-else
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
  object-fit: contain;
}

.icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
