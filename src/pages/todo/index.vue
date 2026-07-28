<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { WINDOW_LABEL } from '@/constants'
import '@/plugins/todo/styles/handdrawn.css'
import { useDeviceStore, useTodoStore } from '@/plugins/todo'
import TodoPanel from '@/plugins/todo/components/TodoPanel/index.vue'
import { hideWindow } from '@/plugins/window'
import { useGeneralStore } from '@/stores/general'

const todoStore = useTodoStore()
const deviceStore = useDeviceStore()
const generalStore = useGeneralStore()
const { t } = useI18n()
const appWindow = getCurrentWebviewWindow()

const visibleTodos = computed(() => todoStore.visibleTodos)

onMounted(() => {
  appWindow.setTitle(t('plugins.todo.labels.windowTitle'))
})

// todo 窗口是独立 webview（独立 document），preference 窗口里的 .dark class 切换不会到达这里。
// 在此自行根据 generalStore.appearance.isDark 同步 .dark，供 handdrawn.css 的暗色变量覆盖生效。
watch(() => generalStore.appearance.isDark, (isDark) => {
  document.documentElement.classList.toggle('dark', !!isDark)
}, { immediate: true })

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
  <div
    class="todo-handdrawn h-screen w-screen overflow-auto p-3"
    data-tauri-drag-region
  >
    <TodoPanel
      :todos="visibleTodos"
      @close="handleClose"
      @create="handleCreate"
      @remove="handleRemove"
      @toggle="handleToggle"
    />
  </div>
</template>
