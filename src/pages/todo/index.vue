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

/**
 * 渐隐渐显：根元素 opacity 过渡。
 * - 打开：show 后下一帧置 true，CSS 从 opacity:0 → 1（渐显）。
 * - 关闭：先置 false 跑渐隐，FADE_MS 后再 hideWindow（窗口真正隐藏）。
 * panel / mini 两形态共用同一套。
 */
const FADE_MS = 200
const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** 主面板默认尺寸（与 tauri.conf.json 的 todo 窗口 width/height 一致）。 */
const FULL_SIZE = new PhysicalSize(380, 560)
/**
 * 迷你窗物理尺寸（含阴影余量），MiniInput 的 SVG viewBox 380×130 同口径。
 * T6 加优先级 + 日期控件后加宽到与主面板同宽（380），保持 130 高（两行布局）。
 */
const MINI_SIZE = new PhysicalSize(380, 130)
/** 高度阈值：低于此值判定为 mini 形态（mini 110 << 200 << panel 560）。 */
const MINI_HEIGHT_MAX = 200

// ── issue #19：panel 形态可拖拽调整大小（logical px 约束） ──
// 勿在 tauri.conf.json 静态配置 minHeight/maxHeight：会钳死 mini 形态的程序化 setSize(380×130)。
// panel 打开时动态设置、进 mini 前清空（见 applyPanelConstraints / clearPanelConstraints）。
/** 宽度下限 = 默认宽（MiniInput/PaperPanel 的 viewBox 基准）。 */
const PANEL_MIN_WIDTH = 380
/**
 * 高度下限 280：完整显示「标题区 + 分区标签 + 一条待办 + 底部新建」的实测最小值，
 * 且远高于 mini 形态阈值 200，杜绝拖拽中掉进 mini 误判。
 */
const PANEL_MIN_HEIGHT = 280
/** 宽度上限 720：依 W3C《中文排版需求》正文行长 17–40 字，17px 字号下 720 ≈ 40 字取上沿。 */
const PANEL_MAX_WIDTH = 720
/** 高度不设实质上限（无排版学依据不拍数字），用 8K 高度兜底表达「不限制」。 */
const PANEL_MAX_HEIGHT = 8192

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

/**
 * issue #19：程序化 setSize 期间置 true，让 onResized 的持久化跳过这一波事件
 * （程序化尺寸不该写回 store，否则「恢复尺寸」和「记录尺寸」互相打架）。
 * 覆盖时长 > 持久化 debounce（300ms），拖拽中最后一次事件不受影响。
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

/** 持久化 debounce 定时器：拖拽中每帧 resize 都会重置，最后一次事件后 300ms 才落库。 */
let persistTimer: ReturnType<typeof setTimeout> | undefined

/**
 * issue #19：用户拖拽结束后把 panel 尺寸存入 store（logical）。
 * 仅 panel 形态、非程序化 resize 时记录；恢复时按当前 scaleFactor 换算 physical。
 */
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
      // 高度恒 130 单轴锁，只记宽度
      todoStore.setMiniWidth(Math.round(logical.width))
    }
  }, 300)
}

/** panel 形态打开时套上尺寸约束 + 恢复用户上次的尺寸（无记录则默认 FULL_SIZE）。 */
async function applyPanelConstraints() {
  await appWindow.setResizable(true)
  await appWindow.setMinSize(new LogicalSize(PANEL_MIN_WIDTH, PANEL_MIN_HEIGHT))
  await appWindow.setMaxSize(new LogicalSize(PANEL_MAX_WIDTH, PANEL_MAX_HEIGHT))

  const stored = todoStore.panelSize
  const scale = await appWindow.scaleFactor()
  // 恢复值 clamp 到当前约束内（防换小屏/改约束后旧值越界）
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

/**
 * 主面板形态打开：贴猫正上方（水平居中对齐猫）→ setSize → show → 渐显。
 *
 * 锚点是猫（main 窗口）而非鼠标——和快速新建一致，跟随桌宠更符合直觉。
 * 水平：面板中心对齐猫中心，clamp 到屏内（不溢左右边）。
 * 垂直：在猫正上方留 8px 间距；上方放不下则翻到猫下方；最后 clamp 到屏内。
 * show 走 showWindow（复用 App.vue 的 SHOW_WINDOW handler → Rust show_window 命令，
 * 不直接调 core:window:show，避免新增 capability 权限）。
 */
useTauriListen(LISTEN_KEY.SHOW_TODO_FULL, async () => {
  // issue #19：套约束 + 恢复用户上次尺寸（含程序化标记），贴猫定位按恢复后的实际尺寸计算
  const panelTarget = await applyPanelConstraints()

  const monitors = await availableMonitors()
  const catWindow = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
  let x = monitors[0]?.position.x ?? 0
  let y = (monitors[0]?.position.y ?? 0) + 40

  if (catWindow) {
    const catPos = await catWindow.outerPosition()
    const catSize = await catWindow.outerSize()
    // 猫所在显示器（退化取第一块）
    const monitor = monitors.find(m =>
      catPos.x >= m.position.x && catPos.x < m.position.x + m.size.width
      && catPos.y >= m.position.y && catPos.y < m.position.y + m.size.height,
    ) ?? monitors[0]

    if (monitor) {
      // 水平：面板中心对齐猫中心
      x = catPos.x + Math.round(catSize.width / 2 - panelTarget.width / 2)
      // 垂直：猫正上方留 8px
      y = catPos.y - panelTarget.height - 8
      // 上方放不下 → 翻到猫下方
      if (y < monitor.position.y)
        y = catPos.y + catSize.height + 8
      // clamp 到屏内
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

/**
 * 迷你窗形态打开：定位到桌宠（main 窗口）上方偏右 → setSize → show。
 * miniKey 自增强制 MiniInput 重新挂载，复位 idle 态。
 *
 * 定位锚点改为桌宠而非光标——右键菜单弹出时光标位置距实际想要的迷你窗位置远，
 * 跟随桌宠更符合直觉（迷你窗像从猫身上冒出来）。垂直方向在桌宠正上方留 8px 间距，
 * 水平方向右移桌宠宽度的 60%（「上方偏右」）；若超出显示器右边界则翻到左侧偏左。
 */
useTauriListen(LISTEN_KEY.SHOW_TODO_MINI, async () => {
  const monitors = await availableMonitors()
  let x: number
  let y: number

  const catWindow = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
  if (catWindow) {
    const catPos = await catWindow.outerPosition()
    const catSize = await catWindow.outerSize()
    // 上方偏右：水平右移桌宠宽度的 60%，垂直在其上方留 8px。
    x = catPos.x + Math.round(catSize.width * 0.6)
    y = catPos.y - MINI_SIZE.height - 8
  } else {
    // 找不到 main 窗口时退化为第一块显示器的可视区左上角，保证不崩。
    x = monitors[0]?.position.x ?? 0
    y = (monitors[0]?.position.y ?? 0) + 40
  }

  // 边界 clamp：迷你窗不溢出桌宠所在显示器。若上方空间不足则翻到桌宠下方。
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
      // 上方放不下 → 翻到桌宠下方
      const catWindow2 = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
      const catBottom = catWindow2 ? (await catWindow2.outerPosition()).y + (await catWindow2.outerSize()).height : minY + 100
      y = catBottom + 8
    }
    y = Math.min(y, maxY)
  }

  // issue #19：mini 横向可调（作者方案）——单轴约束：高度 min=max=130 锁死竖直
  // （低于 panel 的 minHeight 且不碰 200 形态阈值），横向 380-720 与面板同口径
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
  todoStore.removeTodo(id)
}

function handleClose() {
  // 先跑渐隐，动画结束后再真正隐藏窗口
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
    <!-- 贴纸片可见边框的 resize 把手：panel 全 8 向；mini 单轴横向仅 E/W，
         inset 用百分比跟随 monolithic SVG 的等比边框（380 时 ≈7%/8%≈27/30px） -->
    <ResizeHandles v-if="mode === 'panel'" />
    <!-- mini 带状把手：边线到窗口边缘整条透明区可抓（消灭"虚空"死区），
         内界 = 仿射边框位置 + 2px，不进纸面内容区 -->
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
/* 渐隐渐显：opacity 过渡。.fade 初始 opacity:0，加 .fade-shown 后到 1。 */
.fade {
  opacity: 0;
  transition: opacity 200ms ease;
}

.fade.fade-shown {
  opacity: 1;
}
</style>
