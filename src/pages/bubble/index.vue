<script setup lang="ts">
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { nextTick, ref } from 'vue'

import type { NewMailPayload } from '@/plugins/mail'

import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import Bubble from '@/plugins/mail/components/Bubble/index.vue'
import { hideWindow, showWindow } from '@/plugins/window'

const appWindow = getCurrentWebviewWindow()

/**
 * 渐隐渐显：根元素 opacity 过渡（与 todo 面板同构）。
 * 打开：show 后下一帧置 true；关闭：先置 false 跑渐隐，再 hideWindow。
 */
const FADE_MS = 200
const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** 气泡窗口尺寸（360×60，单条气泡够用；多气泡堆叠是 T2 的事）。 */
const BUBBLE_SIZE = new PhysicalSize(360, 60)

/** 当前展示的邮件（收到 SHOW_BUBBLE 时赋值；关闭时清空）。 */
const currentMail = ref<NewMailPayload | null>(null)

/**
 * 弹气泡：定位到桌宠正上方（水平居中对齐猫）→ show → 渐显。
 *
 * 定位逻辑照抄 todo 面板的 SHOW_TODO_FULL（锚点 main 窗口、水平居中、垂直正上方、
 * clamp 到屏内 + 上方放不下翻到下方）。
 */
useTauriListen<NewMailPayload>(LISTEN_KEY.SHOW_BUBBLE, async ({ payload }) => {
  currentMail.value = payload

  await appWindow.setSize(BUBBLE_SIZE)

  const monitors = await availableMonitors()
  const catWindow = await WebviewWindow.getByLabel(WINDOW_LABEL.MAIN)
  let x = monitors[0]?.position.x ?? 0
  let y = (monitors[0]?.position.y ?? 0) + 40

  if (catWindow) {
    const catPos = await catWindow.outerPosition()
    const catSize = await catWindow.outerSize()
    const monitor = monitors.find(
      m =>
        catPos.x >= m.position.x
        && catPos.x < m.position.x + m.size.width
        && catPos.y >= m.position.y
        && catPos.y < m.position.y + m.size.height,
    ) ?? monitors[0]

    if (monitor) {
      // 水平：气泡中心对齐猫中心
      x = catPos.x + Math.round(catSize.width / 2 - BUBBLE_SIZE.width / 2)
      // 垂直：猫正上方留 8px
      y = catPos.y - BUBBLE_SIZE.height - 8
      // 上方放不下 → 翻到猫下方
      if (y < monitor.position.y) {
        y = catPos.y + catSize.height + 8
      }
      // clamp 到屏内
      x = Math.max(
        monitor.position.x,
        Math.min(x, monitor.position.x + monitor.size.width - BUBBLE_SIZE.width),
      )
      y = Math.max(
        monitor.position.y,
        Math.min(y, monitor.position.y + monitor.size.height - BUBBLE_SIZE.height),
      )
    }
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  shown.value = false
  showWindow(WINDOW_LABEL.BUBBLE)
  await nextTick()
  shown.value = true
})

/** 关闭气泡（点击气泡体或 × 都触发）：先渐隐再 hideWindow，清空当前邮件。 */
function handleClose() {
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
  shown.value = false
  hideTimer = setTimeout(() => {
    hideWindow(WINDOW_LABEL.BUBBLE)
    currentMail.value = null
  }, FADE_MS)
}
</script>

<template>
  <div
    class="bubble-window fade h-screen w-screen flex items-center"
    :class="{ 'fade-shown': shown }"
  >
    <Bubble
      v-if="currentMail"
      :mail="currentMail"
      @close="handleClose"
    />
  </div>
</template>

<style scoped>
.bubble-window {
  background: transparent;
}

.fade {
  opacity: 0;
  transition: opacity 200ms ease;
}

.fade-shown {
  opacity: 1;
}
</style>
