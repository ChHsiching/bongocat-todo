<script setup lang="ts">
import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TodoPriority } from '@/plugins/todo'

import ResizeHandles from '@/components/ResizeHandles/index.vue'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import '@/plugins/todo/styles/handdrawn.css'
import { useDeviceStore, useTodoStore } from '@/plugins/todo'
import MiniInput from '@/plugins/todo/components/MiniInput/index.vue'
import TodoPanel from '@/plugins/todo/components/TodoPanel/index.vue'
import { hideWindow, showWindow } from '@/plugins/window'

const todoStore = useTodoStore()
const deviceStore = useDeviceStore()
const { t } = useI18n()
const appWindow = getCurrentWebviewWindow()

const visibleTodos = computed(() => todoStore.visibleTodos)

const FADE_MS = 200
const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** Default main panel size (matching the todo window's width/height in tauri.conf.json). */
const FULL_SIZE = new PhysicalSize(380, 560)
/**
 * Mini window physical size (including shadow allowance); the same 380×130 basis as MiniInput's SVG viewBox.
 * After T6 added the priority + date controls it was widened to the main panel's width (380), keeping the 130 height (two-row layout).
 */
const MINI_SIZE = new PhysicalSize(380, 130)
/** Height threshold: below it the mode is mini (mini 110 << 200 << panel 560). */
const MINI_HEIGHT_MAX = 200

// ── issue #19: the panel mode is drag-resizable (logical px constraints) ──
// Do not statically configure minHeight/maxHeight in tauri.conf.json: it would clamp the mini mode's programmatic setSize(380×130).
// Set dynamically when the panel opens, cleared before entering mini (see applyPanelConstraints / clearPanelConstraints).
// show goes through showWindow (reusing App.vue's SHOW_WINDOW handler → the Rust show_window
// command, not calling core:window:show directly, avoiding a new capability grant).
const PANEL_MIN_WIDTH = 380
/**
 * Height floor 280: the measured minimum to fully show "header area + section label + one todo
 * + footer create area", and far above the mini mode threshold of 200, ruling out a false mini
 * detection mid-drag.
 */
const PANEL_MIN_HEIGHT = 280
/** Width ceiling 720: per the W3C "Requirements for Chinese Text Layout", body line length is 17–40 characters; at 17px font size 720 ≈ 40 chars, taking the upper bound. */
const PANEL_MAX_WIDTH = 720
/** No meaningful height ceiling (no typographic basis to pick a number); 8K height is a fallback meaning "unlimited". */
const PANEL_MAX_HEIGHT = 8192

const mode = ref<'mini' | 'panel'>('panel')
const miniKey = ref(0)

function classifyByHeight(height: number) {
  mode.value = height < MINI_HEIGHT_MAX ? 'mini' : 'panel'
}

/**
 * issue #19: set true for the duration of a programmatic setSize so onResized's persistence
 * skips that wave of events (programmatic sizes must not be written back to the store, otherwise
 * "restore size" and "record size" fight each other).
 * The covered duration > the persistence debounce (300ms); the last event during a drag is unaffected.
 */
let programmaticResize = false
let programmaticTimer: ReturnType<typeof setTimeout> | undefined

function markProgrammaticResize() {
  programmaticResize = true
  if (programmaticTimer)
    clearTimeout(programmaticTimer)
  programmaticTimer = setTimeout(() => {
    programmaticResize = false
  }, 500)
}

let persistTimer: ReturnType<typeof setTimeout> | undefined

function schedulePersistPanelSize() {
  if (persistTimer)
    clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    if (programmaticResize)
      return
    const [size, scale] = await Promise.all([appWindow.outerSize(), appWindow.scaleFactor()])
    const logical = size.toLogical(scale)
    if (mode.value === 'panel') {
      todoStore.setPanelSize({ width: Math.round(logical.width), height: Math.round(logical.height) })
    } else if (mode.value === 'mini') {
      // Height fixed at 130 by the single-axis lock; record width only
      todoStore.setMiniWidth(Math.round(logical.width))
    }
  }, 300)
}

async function applyPanelConstraints() {
  await appWindow.setResizable(true)
  await appWindow.setMinSize(new LogicalSize(PANEL_MIN_WIDTH, PANEL_MIN_HEIGHT))
  await appWindow.setMaxSize(new LogicalSize(PANEL_MAX_WIDTH, PANEL_MAX_HEIGHT))

  const stored = todoStore.panelSize
  const scale = await appWindow.scaleFactor()
  const logical = stored
    ? {
        width: Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, stored.width)),
        height: Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, stored.height)),
      }
    : { width: FULL_SIZE.width / scale, height: FULL_SIZE.height / scale }
  const target = new PhysicalSize(Math.round(logical.width * scale), Math.round(logical.height * scale))

  markProgrammaticResize()
  await appWindow.setSize(target)
  return target
}

onMounted(async () => {
  appWindow.setTitle(t('plugins.todo.labels.windowTitle'))

  const outer = await appWindow.outerSize()
  classifyByHeight(outer.height)

  appWindow.onResized(async () => {
    const size = await appWindow.outerSize()
    classifyByHeight(size.height)
    schedulePersistPanelSize()
  })
})

useTauriListen(LISTEN_KEY.SHOW_TODO_FULL, async () => {
  const panelTarget = await applyPanelConstraints()

  const monitors = await availableMonitors()
  const catWindow = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
  let x = monitors[0]?.position.x ?? 0
  let y = (monitors[0]?.position.y ?? 0) + 40

  if (catWindow) {
    const catPos = await catWindow.outerPosition()
    const catSize = await catWindow.outerSize()
    const monitor = monitors.find(m =>
      catPos.x >= m.position.x && catPos.x < m.position.x + m.size.width
      && catPos.y >= m.position.y && catPos.y < m.position.y + m.size.height,
    ) ?? monitors[0]

    if (monitor) {
      x = catPos.x + Math.round(catSize.width / 2 - panelTarget.width / 2)
      y = catPos.y - panelTarget.height - 8
      if (y < monitor.position.y)
        y = catPos.y + catSize.height + 8
      x = Math.max(monitor.position.x, Math.min(x, monitor.position.x + monitor.size.width - panelTarget.width))
      y = Math.max(monitor.position.y, Math.min(y, monitor.position.y + monitor.size.height - panelTarget.height))
    }
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  mode.value = 'panel'
  shown.value = false
  showWindow(WINDOW_LABEL.TODO)
  await nextTick()
  shown.value = true
})

useTauriListen(LISTEN_KEY.SHOW_TODO_MINI, async () => {
  const monitors = await availableMonitors()
  let x: number
  let y: number

  const catWindow = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
  if (catWindow) {
    const catPos = await catWindow.outerPosition()
    const catSize = await catWindow.outerSize()
    x = catPos.x + Math.round(catSize.width * 0.6)
    y = catPos.y - MINI_SIZE.height - 8
  } else {
    x = monitors[0]?.position.x ?? 0
    y = (monitors[0]?.position.y ?? 0) + 40
  }

  const monitor = monitors.find((m) => {
    const { position, size } = m
    return x >= position.x && x < position.x + size.width
      && y >= position.y && y < position.y + size.height
  }) ?? monitors[0]

  if (monitor) {
    const maxX = monitor.position.x + monitor.size.width - MINI_SIZE.width
    const maxY = monitor.position.y + monitor.size.height - MINI_SIZE.height
    const minY = monitor.position.y
    x = Math.max(monitor.position.x, Math.min(x, maxX))
    if (y < minY) {
      const catWindow2 = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
      const catBottom = catWindow2 ? (await catWindow2.outerPosition()).y + (await catWindow2.outerSize()).height : minY + 100
      y = catBottom + 8
    }
    y = Math.min(y, maxY)
  }

  // issue #19: mini is horizontally resizable (the author's approach) — single-axis constraint:
  // height min=max=130 locks the vertical axis (below the panel's minHeight and clear of the
  // 200 mode threshold); horizontal 380-720 matches the panel
  await appWindow.setResizable(true)
  await appWindow.setMinSize(new LogicalSize(PANEL_MIN_WIDTH, MINI_SIZE.height))
  await appWindow.setMaxSize(new LogicalSize(PANEL_MAX_WIDTH, MINI_SIZE.height))
  const miniScale = await appWindow.scaleFactor()
  const miniW = todoStore.miniWidth
    ? Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, todoStore.miniWidth))
    : MINI_SIZE.width / miniScale
  const miniTarget = new PhysicalSize(Math.round(miniW * miniScale), MINI_SIZE.height)

  await appWindow.setPosition(new PhysicalPosition(x - (miniTarget.width - MINI_SIZE.width) / 2, y))
  markProgrammaticResize()
  await appWindow.setSize(miniTarget)
  miniKey.value++
  mode.value = 'mini'
  shown.value = false
  showWindow(WINDOW_LABEL.TODO)
  await nextTick()
  shown.value = true
})

function handleCreate(title: string, dueDate: number | undefined, priority: TodoPriority) {
  todoStore.createTodo(title, deviceStore.deviceId, Date.now(), dueDate, priority)
}

function handleChangePriority(id: string, priority: TodoPriority) {
  todoStore.updateTodo(id, { priority })
}

function handleToggle(id: string) {
  todoStore.toggleTodo(id)
}

function handleRemove(id: string) {
  todoStore.softDeleteTodo(id)
}

function handleClose() {
  if (hideTimer)
    clearTimeout(hideTimer)
  shown.value = false
  hideTimer = setTimeout(() => hideWindow(WINDOW_LABEL.TODO), FADE_MS)
}
</script>

<template>
  <div
    class="todo-handdrawn fade h-screen w-screen overflow-hidden p-3"
    :class="{ 'fade-shown': shown }"
  >
    <!-- Resize handles hugging the paper's visible border: panel uses all 8 directions; mini
         is single-axis horizontal E/W only, with percentage insets following the monolithic
         SVG's proportional border (at 380 ≈7%/8%≈27/30px) -->
    <ResizeHandles v-if="mode === 'panel'" />
    <!-- Mini band handle: the whole transparent strip from the border line to the window edge
         is grabbable (eliminating the "void" dead zone); the inner boundary = the affine border
         position + 2px, never entering the paper's content area -->
    <ResizeHandles
      v-else
      band
      :directions="['East', 'West']"
      inset-left="calc(5% + 4px)"
      inset-right="calc(4.56% + 11.2px)"
    />
    <TodoPanel
      v-if="mode === 'panel'"
      :todos="visibleTodos"
      @change-priority="handleChangePriority"
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

<style scoped>
.fade {
  opacity: 0;
  transition: opacity 200ms ease;
}

.fade.fade-shown {
  opacity: 1;
}
</style>
