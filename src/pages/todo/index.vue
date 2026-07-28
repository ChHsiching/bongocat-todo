<script setup lang="ts">
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors, cursorPosition } from '@tauri-apps/api/window'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import { useDeviceStore, useTodoStore } from '@/plugins/todo'
import '@/plugins/todo/styles/handdrawn.css'
import MiniInput from '@/plugins/todo/components/MiniInput/index.vue'
import TodoPanel from '@/plugins/todo/components/TodoPanel/index.vue'
import { hideWindow } from '@/plugins/window'

const todoStore = useTodoStore()
const deviceStore = useDeviceStore()
const { t } = useI18n()
const appWindow = getCurrentWebviewWindow()

const visibleTodos = computed(() => todoStore.visibleTodos)

/** 主面板尺寸（与 tauri.conf.json 的 todo 窗口 width/height 一致）。 */
const FULL_SIZE = new PhysicalSize(380, 560)
/** 迷你窗物理尺寸（含阴影余量），MiniInput 的 SVG viewBox 280×110 同口径。 */
const MINI_SIZE = new PhysicalSize(280, 110)
/** 高度阈值：低于此值判定为 mini 形态（mini 110 << 200 << panel 560）。 */
const MINI_HEIGHT_MAX = 200

/**
 * 当前窗口形态：panel（主面板 380×560）/ mini（迷你输入窗 280×110）。
 *
 * 同一 WINDOW_LABEL.TODO 窗口在不同尺寸下渲染不同组件（见 D2「快速新建复用同一 label」）。
 * 初值按 mount 时的 outerSize 判定；onResized 重判保证 setSize 后形态即时切换。
 */
const mode = ref<'mini' | 'panel'>('panel')
/**
 * mini 形态每次打开自增的 key，强制 MiniInput 重新挂载以复位三态（saved 后再开要回到输入态）。
 * panel 形态不需要此机制（TodoPanel 无需复位）。
 */
const miniKey = ref(0)

function classifyByHeight(height: number) {
  mode.value = height < MINI_HEIGHT_MAX ? 'mini' : 'panel'
}

onMounted(async () => {
  appWindow.setTitle(t('plugins.todo.labels.windowTitle'))

  const outer = await appWindow.outerSize()
  classifyByHeight(outer.height)

  appWindow.onResized(async () => {
    const size = await appWindow.outerSize()
    classifyByHeight(size.height)
  })
})

/** 主面板形态打开：先 setSize 再 show，避免 1 帧 resize 闪烁。 */
useTauriListen(LISTEN_KEY.SHOW_TODO_FULL, async () => {
  await appWindow.setSize(FULL_SIZE)
  mode.value = 'panel'
  await appWindow.show()
  await appWindow.setFocus()
})

/**
 * 迷你窗形态打开：定位到光标附近（边界 clamp 不溢出屏幕）→ setSize → show → focus。
 * miniKey 自增强制 MiniInput 重新挂载，复位 idle 态。
 */
useTauriListen(LISTEN_KEY.SHOW_TODO_MINI, async () => {
  const cursor = await cursorPosition()
  const monitors = await availableMonitors()

  // 找光标所在显示器，做边界 clamp
  const monitor = monitors.find((m) => {
    const { position, size } = m
    return cursor.x >= position.x
      && cursor.x < position.x + size.width
      && cursor.y >= position.y
      && cursor.y < position.y + size.height
  })

  let x = cursor.x
  let y = cursor.y

  if (monitor) {
    const maxX = monitor.position.x + monitor.size.width - MINI_SIZE.width
    const maxY = monitor.position.y + monitor.size.height - MINI_SIZE.height
    x = Math.max(monitor.position.x, Math.min(x, maxX))
    y = Math.max(monitor.position.y, Math.min(y, maxY))
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  await appWindow.setSize(MINI_SIZE)
  miniKey.value++
  mode.value = 'mini'
  await appWindow.show()
  await appWindow.setFocus()
})

function handleCreate(title: string, dueDate?: number) {
  todoStore.createTodo(title, deviceStore.deviceId, Date.now(), dueDate)
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
      v-if="mode === 'panel'"
      :todos="visibleTodos"
      @close="handleClose"
      @create="handleCreate"
      @remove="handleRemove"
      @toggle="handleToggle"
    />
    <MiniInput
      v-else
      :key="miniKey"
      @close="handleClose"
      @create="handleCreate"
    />
  </div>
</template>
