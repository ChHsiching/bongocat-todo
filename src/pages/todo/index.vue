<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { WINDOW_LABEL } from '@/constants'
import '@/plugins/todo/styles/handdrawn.css'
import { useDeviceStore, useTodoStore } from '@/plugins/todo'
import TodoPanel from '@/plugins/todo/components/TodoPanel/index.vue'
import { hideWindow } from '@/plugins/window'

const todoStore = useTodoStore()
const deviceStore = useDeviceStore()
const { t } = useI18n()
const appWindow = getCurrentWebviewWindow()

const visibleTodos = computed(() => todoStore.visibleTodos)

onMounted(() => {
  appWindow.setTitle(t('plugins.todo.labels.windowTitle'))
})

function handleCreate(title: string) {
  todoStore.createTodo(title, deviceStore.deviceId)
}

function handleToggle(id: string) {
  todoStore.toggleTodo(id)
}

function handleRemove(id: string) {
  todoStore.removeTodo(id)
}

function handleClose() {
  hideWindow(WINDOW_LABEL.TODO)
}
</script>

<template>
  <div class="todo-handdrawn h-screen w-screen overflow-hidden p-3">
    <TodoPanel
      :todos="visibleTodos"
      @close="handleClose"
      @create="handleCreate"
      @remove="handleRemove"
      @toggle="handleToggle"
    />
  </div>
</template>
