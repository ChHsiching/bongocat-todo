<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Todo } from '@/plugins/todo'

import PaperPanel from '../PaperPanel/index.vue'
import PawLogo from '../PawLogo/index.vue'
import TodoItem from '../TodoItem/index.vue'
import WaveDivider from '../WaveDivider/index.vue'

/**
 * Todo 面板主体（TodoPanel）。
 * - 标题区：PawLogo + 标题 + 手绘关闭 X。
 * - 待办分组：未完成 todo，带 WaveDivider 分隔。
 * - 已完成分组：completed todo。
 * - 「＋ 新建待办」按钮：点击内联展开手绘风输入框，回车保存。
 * - 空状态提示。
 *
 * 数据操作通过 props（todos）/emits（toggle/remove/create）与父解耦，父负责接 store。
 */
const { todos } = defineProps<{
  todos: Todo[]
}>()

const emit = defineEmits<{
  close: []
  create: [title: string]
  remove: [id: string]
  toggle: [id: string]
}>()

const { t } = useI18n()

const pendingTodos = computed(() => todos.filter(todo => !todo.completed))
const completedTodos = computed(() => todos.filter(todo => todo.completed))

const showAddInput = ref(false)
const newTitle = ref('')
const addInputEl = ref<HTMLInputElement | null>(null)

async function focusAddInput() {
  await nextTick()
  addInputEl.value?.focus()
}

function handleAdd() {
  const title = newTitle.value.trim()
  if (!title)
    return
  emit('create', title)
  newTitle.value = ''
  showAddInput.value = false
}

function handleCancelAdd() {
  newTitle.value = ''
  showAddInput.value = false
}
</script>

<template>
  <PaperPanel>
    <!-- 标题区 -->
    <div class="panel-header">
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
        <!-- 手绘 ×（两条曲线交叉） -->
        <svg
          fill="none"
          height="22"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="22"
        >
          <path d="M 6 6 Q 9 9 12 12 Q 15 15 18 18" />
          <path d="M 18 6 Q 15 9 12 12 Q 9 15 6 18" />
        </svg>
      </button>
    </div>

    <!-- 待办分组 -->
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
        @remove="emit('remove', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>

    <!-- 已完成分组 -->
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
        @remove="emit('remove', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>

    <!-- 空状态 -->
    <div
      v-if="!todos.length"
      class="empty-hint"
    >
      {{ t('plugins.todo.labels.emptyHint') }}
    </div>

    <!-- 底部新建区 -->
    <div class="panel-footer">
      <!-- 内联展开输入 -->
      <div
        v-if="showAddInput"
        class="add-input-row"
      >
        <input
          ref="addInputEl"
          v-model="newTitle"
          class="add-input"
          :placeholder="t('plugins.todo.labels.addTodoPlaceholder')"
          type="text"
          @blur="handleCancelAdd"
          @keydown.enter.prevent="handleAdd"
          @keydown.esc.prevent="handleCancelAdd"
        >
      </div>
      <!-- 「＋ 新建待办」按钮 -->
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
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

.empty-hint {
  padding: 32px 0;
  text-align: center;
  font-size: 14px;
  color: var(--ink-faint);
}

.panel-footer {
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

.add-input-row {
  width: 100%;
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
  color: var(--ink);
}

.add-input::placeholder {
  color: var(--ink-faint);
}

.add-input:focus {
  background: color-mix(in srgb, var(--pink) 14%, var(--paper));
}
</style>
