<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { TodoPriority } from '@/plugins/todo'

import { PRIORITIES } from '@/plugins/todo/utils/priority'

import InkDot from '../InkDot/index.vue'

/**
 * Priority picker (PriorityPicker / T6): three ink dots, click to select.
 *
 * Used at todo-creation entry points (the main panel's create area + the mini window),
 * complementing TodoItem's "click the existing ink dot to cycle" — here it is an explicit
 * three-way choice (clearer), there an in-place cycle (more compact).
 *
 * Visual: three ink dots in a row; the selected one gets a hand-drawn wavy underline (pink-ink
 * emphasis); unselected ones are semi-transparent. emit `update:priority` (v-model).
 *
 * @see docs/designs/todo-panel-exploration/panel.html ink dot path source of truth
 */
const { modelValue } = defineProps<{
  modelValue: TodoPriority
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TodoPriority]
}>()

const { t } = useI18n()

function priorityLabel(p: TodoPriority): string {
  switch (p) {
    case 'high':
      return t('plugins.todo.labels.priorityHigh')
    case 'low':
      return t('plugins.todo.labels.priorityLow')
    case 'medium':
    default:
      return t('plugins.todo.labels.priorityMedium')
  }
}

function select(p: TodoPriority) {
  if (p !== modelValue)
    emit('update:modelValue', p)
}
</script>

<template>
  <div
    :aria-label="t('plugins.todo.labels.priorityPickerLabel')"
    class="picker"
    role="radiogroup"
  >
    <button
      v-for="p in PRIORITIES"
      :key="p"
      :aria-checked="p === modelValue"
      :aria-label="priorityLabel(p)"
      class="dot-btn"
      :class="{ selected: p === modelValue }"
      :title="priorityLabel(p)"
      type="button"
      @click="select(p)"
    >
      <InkDot :priority="p" />
      <!-- Selected marker: hand-drawn wavy underline (pink-ink emphasis color) -->
      <svg
        v-if="p === modelValue"
        class="selected-mark"
        viewBox="0 0 16 4"
      >
        <path
          d="M 1 2 Q 4 0.5 8 2 Q 12 3.5 15 1.5"
          fill="none"
          stroke="var(--pink-deep)"
          stroke-linecap="round"
          stroke-width="1.5"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: inline-flex;
  align-items: flex-end;
  gap: 10px;
}

/* Single ink dot button: transparent background, hover scale-up feedback. */
.dot-btn {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 1px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  opacity: 0.45;
  transition:
    opacity 0.2s,
    transform 0.2s;
}

/* Selected state is opaque + explicitly marked with the hand-drawn wavy underline. */
.dot-btn.selected {
  opacity: 1;
}

.dot-btn:hover {
  opacity: 1;
  transform: scale(1.2);
}

/* Hand-drawn wavy underline: centered below the selected level. */
.selected-mark {
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 16px;
  height: 4px;
  transform: translateX(-50%);
}
</style>
