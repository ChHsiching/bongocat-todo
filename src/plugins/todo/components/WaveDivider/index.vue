<script setup lang="ts">
/**
 * Hand-drawn wavy divider (WaveDivider): a `Q 25 1 50 3 T 98 3` wave, not a straight line.
 * Used as the underline of section labels. preserveAspectRatio="none" stretches it horizontally to fill the container.
 * SVG path lifted from docs/designs/todo-panel-exploration/panel.html.
 */
</script>

<template>
  <svg
    class="wave-divider"
    preserveAspectRatio="none"
    viewBox="0 0 100 6"
  >
    <path
      d="M 2 3 Q 25 1 50 3 T 98 3"
      fill="none"
      stroke="var(--ink-faint)"
      stroke-linecap="round"
      stroke-width="1.5"
    />
  </svg>
</template>

<style scoped>
.wave-divider {
  flex: 1;
  height: 6px;
}
</style>
