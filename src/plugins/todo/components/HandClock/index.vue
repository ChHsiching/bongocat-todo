<script setup lang="ts">
import { computed } from 'vue'

/**
 * Hand-drawn clock (HandClock): an irregular outer circle (Q curves, not circle) + curved hour/minute hands + a solid center dot.
 * The stroke turns red when urgent (visual due hint).
 * SVG path lifted from docs/designs/todo-panel-exploration/panel.html.
 */
const { urgent } = defineProps<{
  urgent?: boolean
}>()

const stroke = computed(() => urgent ? 'var(--red-ink)' : 'var(--ink-soft)')
</script>

<template>
  <svg
    class="clock-icon"
    fill="none"
    :stroke="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
    viewBox="0 0 14 14"
  >
    <!-- Hand-drawn clock outer ring (irregular circle) -->
    <path d="M 7 1.5 Q 10.5 1.5 12 4 Q 13 5.5 12.5 7.5 Q 12 11 9 12 Q 7 12.5 5 12 Q 2 11 1.5 8 Q 1 6 2 4.5 Q 3 2 7 1.5 Z" />
    <!-- Hand-drawn hour + minute hands (curved) -->
    <path d="M 7 7 Q 7 5 7.5 4" />
    <path d="M 7 7 Q 9 7 10 6.5" />
    <!-- Center dot -->
    <circle
      cx="7"
      cy="7"
      :fill="stroke"
      r="0.6"
      stroke="none"
    />
  </svg>
</template>

<style scoped>
.clock-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>
