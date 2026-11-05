<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Todo, TodoPriority } from '@/plugins/todo'

import HandDateInput from '../HandDateInput/index.vue'
import PaperPanel from '../PaperPanel/index.vue'
import PawLogo from '../PawLogo/index.vue'
import PriorityPicker from '../PriorityPicker/index.vue'
import TodoItem from '../TodoItem/index.vue'
import WaveDivider from '../WaveDivider/index.vue'

/**
 * Todo panel body (TodoPanel).
 * - Header area: PawLogo + title + hand-drawn close X.
 * - Pending section: uncompleted todos, separated by a WaveDivider.
 * - Completed section: completed todos.
 * - "＋ New todo" button: clicking expands an inline hand-drawn style form (title + priority
 *   picker + date input); Enter saves.
 * - Empty-state hint.
 *
 * T6 input-control completion: the create area adds PriorityPicker (three levels, default
 * medium) + HandDateInput (reusing T5's handwritten digit boxes).
 *
 * Data operations are decoupled from the parent via props (todos)/emits
 * (toggle/remove/create/changePriority); the parent wires the store.
 */
const { todos } = defineProps<{
  todos: Todo[]
}>()

const emit = defineEmits<{
  changePriority: [id: string, priority: TodoPriority]
  close: []
  create: [title: string, dueDate: number | undefined, priority: TodoPriority]
  remove: [id: string]
  toggle: [id: string]
}>()

const { t } = useI18n()

/** Priority weights: high > medium > low. */
const priorityWeight: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

/** Sort: priority ascending → dueDate (missing goes last) → createdAt (earlier created first). */
function sortTodos(a: Todo, b: Todo): number {
  const pDiff = priorityWeight[a.priority] - priorityWeight[b.priority]
  if (pDiff !== 0)
    return pDiff
  if (a.dueDate !== undefined && b.dueDate !== undefined)
    return a.dueDate - b.dueDate
  if (a.dueDate !== undefined)
    return -1
  if (b.dueDate !== undefined)
    return 1
  return a.createdAt - b.createdAt
}

const pendingTodos = computed(() => todos.filter(todo => !todo.completed).sort(sortTodos))
const completedTodos = computed(() => todos.filter(todo => todo.completed).sort(sortTodos))

const showAddInput = ref(false)
const newTitle = ref('')
/** Priority of the new todo (default medium). */
const newPriority = ref<TodoPriority>('medium')
/** Due-date timestamp of the new todo (undefined when no date is filled). */
const newDueDate = ref<number | undefined>(undefined)
const addInputEl = ref<HTMLInputElement | null>(null)
const dateInputEl = ref<InstanceType<typeof HandDateInput> | null>(null)

async function focusAddInput() {
  await nextTick()
  addInputEl.value?.focus()
}

function handleAdd() {
  const title = newTitle.value.trim()
  if (!title)
    return
  emit('create', title, newDueDate.value, newPriority.value)
  resetAddForm()
}

function handleCancelAdd() {
  resetAddForm()
}

/** Enter in the date boxes: submit if the title has content, otherwise focus the title box. */
function handleDateEnter() {
  if (newTitle.value.trim()) {
    handleAdd()
  } else {
    focusAddInput()
  }
}

function resetAddForm() {
  newTitle.value = ''
  newPriority.value = 'medium'
  newDueDate.value = undefined
  dateInputEl.value?.reset()
  showAddInput.value = false
}
</script>

<template>
  <PaperPanel>
    <!-- Header area (draggable to move the window; child elements use pointer-events:none to let drags pass through, the button alone restores them) -->
    <div
      class="panel-header"
      data-tauri-drag-region
    >
      <div class="panel-title-row">
        <PawLogo />
        <span class="panel-title">{{ t('plugins.todo.labels.windowTitle') }}</span>
      </div>
      <button
        class="panel-close"
        :title="t('plugins.todo.labels.closeButton')"
        type="button"
        @click="emit('close')"
      >
        <!-- Hand-drawn ×: two smooth crossing arcs, like one natural pen stroke -->
        <svg
          fill="none"
          height="22"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="22"
        >
          <!-- Top-left→bottom-right: a smooth wide arc, control point offset from the line toward bottom-left -->
          <path d="M 6 6 Q 9.5 13 19 19" />
          <!-- Top-right→bottom-left: a smooth wide arc, control point offset from the line toward top-left -->
          <path d="M 18 6 Q 8.5 10 5 18" />
        </svg>
      </button>
    </div>

    <!-- Middle scrollable area: list content scrolls here when it overflows, without breaking the ink frame -->
    <div class="panel-scroll">
      <!-- Pending section -->
      <div
        v-if="pendingTodos.length"
        class="section-label"
      >
        <span>{{ t('plugins.todo.labels.sectionPending') }} · {{ pendingTodos.length }}</span>
        <WaveDivider />
      </div>

      <div class="todo-list">
        <TodoItem
          v-for="todo in pendingTodos"
          :key="todo.id"
          :todo="todo"
          @change-priority="(id, priority) => emit('changePriority', id, priority)"
          @remove="emit('remove', $event)"
          @toggle="emit('toggle', $event)"
        />
      </div>

      <!-- Completed section -->
      <div
        v-if="completedTodos.length"
        class="section-label"
      >
        <span>{{ t('plugins.todo.labels.sectionCompleted') }}</span>
        <WaveDivider />
      </div>

      <div class="todo-list">
        <TodoItem
          v-for="todo in completedTodos"
          :key="todo.id"
          :todo="todo"
          @change-priority="(id, priority) => emit('changePriority', id, priority)"
          @remove="emit('remove', $event)"
          @toggle="emit('toggle', $event)"
        />
      </div>

      <!-- Empty state -->
      <div
        v-if="!todos.length"
        class="empty-hint"
      >
        {{ t('plugins.todo.labels.emptyHint') }}
      </div>
    </div>

    <!-- Footer create area (fixed, does not scroll with the list; blank areas drag to move the window) -->
    <div
      class="panel-footer"
      data-tauri-drag-region
    >
      <!-- Inline expanded input: title + priority + date -->
      <div
        v-if="showAddInput"
        class="add-form"
      >
        <input
          ref="addInputEl"
          v-model="newTitle"
          class="add-input"
          :placeholder="t('plugins.todo.labels.addTodoPlaceholder')"
          type="text"
          @keydown.enter.prevent="handleAdd"
          @keydown.esc.prevent="handleCancelAdd"
        >
        <div class="add-controls">
          <PriorityPicker v-model="newPriority" />
          <HandDateInput
            ref="dateInputEl"
            @change="newDueDate = $event"
            @enter="handleDateEnter"
          />
        </div>
        <div class="add-actions">
          <button
            class="confirm-btn"
            type="button"
            @click="handleAdd"
          >
            {{ t('plugins.todo.labels.confirmAddButton') }}
          </button>
          <button
            class="cancel-btn"
            type="button"
            @click="handleCancelAdd"
          >
            {{ t('plugins.todo.labels.cancelAddButton') }}
          </button>
        </div>
      </div>
      <!-- "＋ New todo" button -->
      <button
        v-else
        class="add-btn"
        type="button"
        @click="(showAddInput = true), focusAddInput()"
      >
        ＋ {{ t('plugins.todo.labels.addTodoButton') }}
      </button>
    </div>
  </PaperPanel>
</template>

<style scoped>
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

/* The title row also participates in dragging: child content does not intercept the mouse, letting the drag-region work */
.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.panel-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
}

.panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 8px;
  padding: 0;
  background: none;
  border: none;
  color: var(--ink-faint);
  cursor: pointer;
  transition: color 0.2s;
  font-family: inherit;
}

.panel-close:hover {
  color: var(--ink);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
}

.section-label:first-of-type {
  margin-top: 0;
}

.todo-list {
  display: flex;
  flex-direction: column;
}

/* Middle scroll area: overflow scrolls here inside the ink frame; scrollbar hidden */
.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Hide the scrollbar (webkit + firefox) */
  scrollbar-width: none;
}

.panel-scroll::-webkit-scrollbar {
  display: none;
}

.empty-hint {
  padding: 32px 0;
  text-align: center;
  font-size: 14px;
  color: var(--ink-faint);
}

.panel-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

.add-btn {
  padding: 12px 28px;
  background: transparent;
  border: none;
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  transition: color 0.2s;
}

.add-btn:hover {
  color: var(--pink-deep);
}

/* Create form: title input + priority/date controls + confirm/cancel buttons. */
.add-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-input {
  width: 100%;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--pink) 8%, var(--paper));
  border: none;
  outline: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  box-sizing: border-box;
}

.add-input::placeholder {
  color: var(--ink-faint);
}

.add-input:focus {
  background: color-mix(in srgb, var(--pink) 14%, var(--paper));
}

/* Priority picker + date input in a row. */
.add-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.add-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.confirm-btn,
.cancel-btn {
  padding: 6px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  transition: color 0.2s;
}

.confirm-btn {
  color: var(--pink-deep);
}

.confirm-btn:hover {
  color: var(--red-ink);
}

.cancel-btn {
  color: var(--ink-faint);
}

.cancel-btn:hover {
  color: var(--ink-soft);
}
</style>
