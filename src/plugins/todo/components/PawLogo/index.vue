<script setup lang="ts">
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
