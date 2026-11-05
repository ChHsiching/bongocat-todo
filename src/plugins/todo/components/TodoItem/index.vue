<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Todo, TodoPriority } from '@/plugins/todo'

import { nextPriority } from '@/plugins/todo/utils/priority'

import HandCheckbox from '../HandCheckbox/index.vue'
import HandClock from '../HandClock/index.vue'
import InkDot from '../InkDot/index.vue'

/**
 * Todo item (TodoItem): composes HandCheckbox + InkDot + HandClock + title/meta.
 * - Priority ink dot: renders red/orange/blue per todo.priority; since T6 clicking the dot
 *   cycles the priority (low→med→high→low).
 * - Due label: since T6 a relative phrase coexists with the exact time (e.g. "Tomorrow 14:30",
 *   "Today 09:00", "Overdue 7/28 14:30").
 * - Due visuals: with a dueDate that is today/overdue, HandClock enters the urgent state
 *   (red stroke) + red text.
 * - emit toggle/remove/changePriority for the parent to operate the store.
 */
const { todo } = defineProps<{
  todo: Todo
}>()

const emit = defineEmits<{
  changePriority: [id: string, priority: TodoPriority]
  remove: [id: string]
  toggle: [id: string]
}>()

const { t } = useI18n()

const priorityLabel = computed(() => {
  switch (todo.priority) {
    case 'high':
      return t('plugins.todo.labels.priorityHigh')
    case 'low':
      return t('plugins.todo.labels.priorityLow')
    case 'medium':
    default:
      return t('plugins.todo.labels.priorityMedium')
  }
})

/** Zero-pad to two digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Due label (T6): a relative phrase coexists with the exact time.
 * - Today, not yet due: `Today 14:30`
 * - Today, overdue: `Overdue 14:30` (the time has passed, accurate to the minute)
 * - Tomorrow: `Tomorrow 14:30`
 * - Overdue on an earlier day: `Overdue 7/28 14:30`
 * - Further out: `7/30 14:30` (falls back to month/day + HH:mm when relative words run out)
 *
 * Overdue detection is accurate to the minute (`dueDate < now`), no longer compared by whole
 * day — avoiding the perceived issue of "due today 10:15, now 10:20, still showing a blue 'Today'".
 *
 * Every dueDate carries a time (the timestamp MiniInput builds is accurate to the minute),
 * so HH:mm is always displayed.
 */
const dueLabel = computed<null | string>(() => {
  if (!todo.dueDate)
    return null

  const due = new Date(todo.dueDate)
  const hm = `${pad2(due.getHours())}:${pad2(due.getMinutes())}`
  const md = `${due.getMonth() + 1}/${due.getDate()}`

  const now = Date.now()
  const overdue = todo.dueDate < now

  // Overdue shows "Overdue" first: today past the time also shows "Overdue HH:mm" (no month/day — unnecessary for today)
  if (overdue) {
    const today = startOfDay(now)
    const dueDay = startOfDay(todo.dueDate)
    return dueDay < today
      ? `${t('plugins.todo.labels.dueOverdueShort')} ${md} ${hm}`
      : `${t('plugins.todo.labels.dueOverdueShort')} ${hm}`
  }

  const today = startOfDay(now)
  const dueDay = startOfDay(todo.dueDate)
  const diffDays = Math.round((dueDay - today) / 86400000)

  if (diffDays === 0)
    return `${t('plugins.todo.labels.dueTodayShort')} ${hm}`
  if (diffDays === 1)
    return `${t('plugins.todo.labels.dueTomorrow')} ${hm}`
  return `${md} ${hm}`
})

/** Due needs highlighting (today or overdue). */
const isUrgent = computed(() => {
  if (!todo.dueDate)
    return false
  return todo.dueDate <= Date.now()
})

/** Overdue (the time has passed, accurate to the minute) shows a red warning; before the time, a blue hint. */
const isOverdue = computed(() => {
  if (!todo.dueDate)
    return false
  return todo.dueDate < Date.now()
})

/** Click the ink dot to cycle the priority. */
function cyclePriority() {
  emit('changePriority', todo.id, nextPriority(todo.priority))
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
</script>

<template>
  <div
    class="todo-item"
    :class="{ done: todo.completed }"
  >
    <div
      class="checkbox-wrap"
      @click="emit('toggle', todo.id)"
    >
      <HandCheckbox :checked="todo.completed" />
    </div>

    <div class="todo-main">
      <div class="todo-title">
        {{ todo.title }}
      </div>

      <div class="todo-meta">
        <span
          class="pri"
          :class="todo.priority"
        >
          <InkDot
            :clickable="!todo.completed"
            :priority="todo.priority"
            @click="!todo.completed && cyclePriority()"
          />
          {{ priorityLabel }}
        </span>

        <span
          v-if="dueLabel"
          class="due"
          :class="{ 'urgent': !todo.completed && isOverdue, 'due-soon': !todo.completed && isUrgent && !isOverdue }"
        >
          <HandClock :urgent="!todo.completed && isOverdue" />
          {{ dueLabel }}
        </span>
      </div>
    </div>

    <!-- Delete: hand-drawn style trash can (same as the mail list's delete button), shown/hidden on hover -->
    <button
      class="remove-btn"
      :title="t('plugins.todo.labels.deleteButton')"
      type="button"
      @click="emit('remove', todo.id)"
    >
      <svg
        fill="none"
        height="16"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="16"
      >
        <!-- Hand-drawn trash can: lid line + handle + can body + two vertical grooves (replicated from MailItem) -->
        <path d="M 4 7 Q 8 6.5 12 7 Q 16 7.5 20 7" />
        <path d="M 10 5 Q 12 4 14 5" />
        <path d="M 6 8 Q 5.5 8 5.7 9 L 7 19 Q 7.2 20 8.2 20 L 15.8 20 Q 16.8 20 17 19 L 18.3 9 Q 18.5 8 18 8" />
        <path d="M 10 11 Q 9.8 14 9.5 17" />
        <path d="M 14 11 Q 14.2 14 14.5 17" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px;
  position: relative;
  cursor: pointer;
  border-radius: 14px;
  transition: background 0.2s;
}

.todo-item:hover {
  background: color-mix(in srgb, var(--pink) 8%, transparent);
}

/* Use a softer pink for hover in dark mode */
html.dark .todo-item:hover {
  background: color-mix(in srgb, var(--pink) 14%, transparent);
}

.checkbox-wrap {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
}

.todo-main {
  flex: 1;
  min-width: 0;
}

.todo-title {
  font-size: 17px;
  line-height: 1.6;
  word-break: break-word;
  font-weight: 700;
  color: var(--ink);
}

.todo-item.done .todo-title {
  color: var(--ink-faint);
  text-decoration: line-through;
  text-decoration-color: var(--ink-faint);
}

.todo-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 13px;
}

.pri {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.pri.high {
  color: var(--red-ink);
}

.pri.medium {
  color: var(--orange);
}

.pri.low {
  color: var(--blue);
}

.due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-soft);
  font-weight: 600;
}

.due.due-soon {
  color: var(--blue);
}

.due.urgent {
  color: var(--red-ink);
}

.remove-btn {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 2px;
  background: none;
  border: none;
  color: var(--ink-faint);
  cursor: pointer;
  opacity: 0;
  transition:
    color 0.2s,
    opacity 0.2s;
  font-family: inherit;
}

.todo-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  color: var(--red-ink);
}
</style>
