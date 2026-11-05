<script setup lang="ts">
/**
 * Hand-drawn checkbox (HandCheckbox): an irregular square whose four corner arcs all differ (mimicking hand drawing).
 * - Unchecked: white fill + brown ink border.
 * - Checked: pink fill + deep pink border + hand-drawn check mark (two curved strokes).
 * SVG path lifted from docs/designs/todo-panel-exploration/panel.html.
 */
defineProps<{
  checked?: boolean
}>()
</script>

<template>
  <svg
    class="hand-checkbox"
    viewBox="0 0 24 24"
  >
    <!-- Hand-drawn irregular outer border (four corner arcs all differ) -->
    <path
      d="M 3.5 5.5 Q 3 3.5 5.5 3.2 Q 11 2.8 18.5 3.5 Q 21 3.8 20.8 6 Q 21 11 20.5 18 Q 20.5 21 18 21.2 Q 12 21.5 5.5 20.8 Q 3 20.5 3.2 18 Q 3 12 3.5 5.5 Z"
      :fill="checked ? 'var(--pink)' : 'var(--paper)'"
      :stroke="checked ? 'var(--pink-deep)' : 'var(--ink-soft)'"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2.2"
    />
    <!-- Checked: hand-drawn check mark (two curved strokes) -->
    <path
      v-if="checked"
      d="M 6 12 Q 8 15 9 16 Q 13 10 16 7"
      fill="none"
      stroke="#fff"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2.8"
    />
  </svg>
</template>

<style scoped>
.hand-checkbox {
  width: 100%;
  height: 100%;
  transition: all 0.2s;
}
</style>
