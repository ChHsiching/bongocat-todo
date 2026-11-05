<script setup lang="ts">
/**
 * Paw print logo (PawLogo): 4 circles + an ellipse drawn in SVG (a real paw shape), not an emoji.
 * SVG path lifted from docs/designs/todo-panel-exploration/panel.html.
 */
defineProps<{
  /** Size in px, default 34 (the design's header-area size) */
  size?: number
}>()
</script>

<template>
  <svg
    :height="size ?? 34"
    viewBox="0 0 34 34"
    :width="size ?? 34"
  >
    <ellipse
      cx="17"
      cy="23"
      fill="var(--pink)"
      rx="9"
      ry="6.5"
    />
    <circle
      cx="8"
      cy="15"
      fill="var(--pink)"
      r="3.2"
    />
    <circle
      cx="14"
      cy="10"
      fill="var(--pink)"
      r="3.2"
    />
    <circle
      cx="21"
      cy="10"
      fill="var(--pink)"
      r="3.2"
    />
    <circle
      cx="27"
      cy="15"
      fill="var(--pink)"
      r="3.2"
    />
  </svg>
</template>
