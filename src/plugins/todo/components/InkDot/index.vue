<script setup lang="ts">
import { computed } from 'vue'

import type { TodoPriority } from '@/plugins/todo'

/**
 * `clickable`: when true it renders as a hand-drawn style button (hover scale-up + pointer),
 * emitting `click` on click (the parent decides the cycle or select logic). Defaults to false
 * for a pure display state, leaving TodoItem's existing display usage unaffected.
 */
const {
  clickable = false,
  priority,
} = defineProps<{
  priority: TodoPriority
  clickable?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const color = computed(() => {
  switch (priority) {
    case 'high':
      return 'var(--red-ink)'
    case 'low':
      return 'var(--blue)'
    case 'medium':
    default:
      return 'var(--orange)'
  }
})

function onClick() {
  emit('click')
}
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="ink-dot"
    :class="{ 'is-clickable': clickable }"
    :type="clickable ? 'button' : undefined"
    @click="clickable && onClick()"
  >
    <svg
      viewBox="0 0 14 14"
    >
      <path
        d="M 7 2 Q 11 2 12 5 Q 13 7 12 9 Q 11 12 7 12 Q 3 12 2 9 Q 1 7 2 5 Q 3 2 7 2 Z"
        :fill="color"
        opacity="0.25"
      />
      <path
        d="M 7 3.5 Q 9.5 3.5 10.5 5.5 Q 11 7 10 8.5 Q 9 10.5 7 10.5 Q 5 10.5 4 8.5 Q 3 7 3.5 5.5 Q 4.5 3.5 7 3.5 Z"
        :fill="color"
      />
      <ellipse
        cx="5.5"
        cy="5.5"
        :fill="color"
        opacity="0.5"
        rx="1.2"
        ry="0.8"
      />
    </svg>
  </component>
</template>

<style scoped>
.ink-dot {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.ink-dot svg {
  width: 100%;
  height: 100%;
}

.ink-dot.is-clickable {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.2s ease;
}

.ink-dot.is-clickable:hover {
  transform: scale(1.3);
}

.ink-dot.is-clickable:active {
  transform: scale(1.15);
}
</style>
