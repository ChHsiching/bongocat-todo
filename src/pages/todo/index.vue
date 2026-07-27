<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { Checkbox, Flex, Input } from 'antdv-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { WINDOW_LABEL } from '@/constants'
import { useDeviceStore, useTodoStore } from '@/plugins/todo'
import { hideWindow } from '@/plugins/window'

const todoStore = useTodoStore()
const deviceStore = useDeviceStore()
const { t } = useI18n()
const appWindow = getCurrentWebviewWindow()

const newTitle = ref('')
const visibleTodos = computed(() => todoStore.visibleTodos)

onMounted(() => {
  appWindow.setTitle(t('plugins.todo.labels.windowTitle'))
})

function handleAdd() {
  const title = newTitle.value.trim()

  if (!title) {
    return
  }

  todoStore.createTodo(title, deviceStore.deviceId)
  newTitle.value = ''
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
  <Flex
    class="h-screen flex-col gap-4 p-6"
    data-tauri-drag-region
    vertical
  >
    <!-- 占位横幅：T1 tracer bullet，视觉占位，T2 精化为手绘风 -->
    <div
      class="px-4 py-2 text-orange-7 bg-orange-1 text-sm rounded-lg dark:text-orange-2 dark:bg-orange-3"
    >
      {{ t('plugins.todo.labels.placeholderBanner') }}
    </div>

    <Flex
      align="center"
      class="gap-2"
      justify="space-between"
    >
      <h1 class="font-bold text-xl">
        {{ t('plugins.todo.labels.windowTitle') }}
      </h1>

      <button
        class="bg-gray-2 px-3 py-1 text-sm rounded-md dark:bg-gray-7 hover:bg-gray-3 dark:hover:bg-gray-6"
        @click="handleClose"
      >
        {{ t('plugins.todo.labels.closeButton') }}
      </button>
    </Flex>

    <Flex
      align="center"
      class="gap-2"
    >
      <Input
        v-model:value="newTitle"
        class="flex-1"
        :placeholder="t('plugins.todo.labels.inputPlaceholder')"
        @press-enter="handleAdd"
      />
      <button
        class="px-4 py-1.5 text-white bg-blue-5 rounded-md hover:bg-blue-6"
        @click="handleAdd"
      >
        {{ t('plugins.todo.labels.addButton') }}
      </button>
    </Flex>

    <Flex
      class="flex-1 gap-2 overflow-auto"
      vertical
    >
      <Flex
        v-for="todo in visibleTodos"
        :key="todo.id"
        align="center"
        class="gap-3 b-1 b-solid p-3 b-border-sec rounded-lg"
        justify="space-between"
      >
        <Flex
          align="center"
          class="gap-2"
        >
          <Checkbox
            :checked="todo.completed"
            @change="handleToggle(todo.id)"
          />

          <span :class="{ 'line-through opacity-50': todo.completed }">
            {{ todo.title }}
          </span>
        </Flex>

        <button
          class="text-red-5 text-sm hover:text-red-6"
          @click="handleRemove(todo.id)"
        >
          {{ t('plugins.todo.labels.deleteButton') }}
        </button>
      </Flex>

      <div
        v-if="visibleTodos.length === 0"
        class="py-8 text-center opacity-50 text-sm"
      >
        {{ t('plugins.todo.labels.emptyHint') }}
      </div>
    </Flex>
  </Flex>
</template>
