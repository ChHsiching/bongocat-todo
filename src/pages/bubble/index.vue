<script setup lang="ts">
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { BubblePayload } from '@/plugins/mail'

import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import Bubble from '@/plugins/mail/components/Bubble/index.vue'
import FoldHint from '@/plugins/mail/components/FoldHint/index.vue'
import { useMailAccountStore } from '@/plugins/mail/stores/mailAccount'
import { useMailNotificationStore } from '@/plugins/mail/stores/mailNotification'
import { computeBubbleOverflow } from '@/plugins/mail/utils/overflow'
import { matchProvider, resolveWebmailUrl } from '@/plugins/mail/utils/providers'
import { hideWindow, showWindow } from '@/plugins/window'
import '@/plugins/mail/styles/bubble.css'

const appWindow = getCurrentWebviewWindow()

/**
 * 渐隐渐显：根元素 opacity 过渡（与 todo 面板同构）。
 * 打开：show 后下一帧置 true；关闭：先置 false 跑渐隐，再 hideWindow。
 */
const FADE_MS = 200

/** 气泡窗口固定宽（360px，对齐 todo 面板）；高度按内容自适应。 */
const BUBBLE_WIDTH = 360

/** 堆叠间距。 */
const STACK_GAP = 10
/** 窗口上下安全留白（避免气泡顶/底边贴窗口边）。 */
const PADDING_Y = 8
/** 窗口无内容时的初始高度（showWindow 前的占位，实际高度由 measureHeight 校正）。 */
const FALLBACK_HEIGHT = 80

/**
 * 队列：所有未处理的新邮件（按到达顺序）。展示前 3 条 + 折入提示行。
 * 用 Map 而非数组，方便按 id 关闭单条；顺序按到达顺序（push 末尾 = 最新）。
 */
interface BubbleItem {
  /** 到达时间戳 + 自增 seq 组合的唯一 key（同秒到达多条时不撞）。 */
  key: string
  payload: BubblePayload
}
const queue = ref<BubbleItem[]>([])

let seq = 0

const overflow = computed(() => computeBubbleOverflow(queue.value.length))
const shownItems = computed(() => queue.value.slice(0, overflow.value.shown))

/** store 必须在 setup 顶层实例化（跨 async 边界 inject 失效，见 CONTEXT.md 踩坑清单）。 */
const mailAccountStore = useMailAccountStore()
const mailNotificationStore = useMailNotificationStore()
const { t } = useI18n()

// bubble 是独立 webview，store 实例与 main 窗口各自独立。必须在此窗口也调
// $tauri.start() 加载持久化的账号数据，否则 accounts 为空 → provider 识别失败（sourceLabel
// 拿不到 address）。加载后 accounts 变化触发响应式重渲染。
// mailNotification store 也在此加载：点击邮件时按 <accountId>:<uid> 匹配本地通知历史，
// 调 markRead 标本地已读（5 分钟后归档由 main 窗口的 tickRetention 处理）。
onMounted(async () => {
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
})

/** 气泡来源标签：邮件按账号邮箱识别 provider 名（如「新邮件 · Gmail」），todo 用「待办到期」。 */
function sourceLabel(payload: BubblePayload): string {
  if (payload.type === 'todo') {
    return t('plugins.todo.labels.bubbleSource')
  }
  const account = mailAccountStore.getAccount(payload.accountId)
  const preset = account ? matchProvider(account.address) : null
  const providerName = preset?.displayName ?? null
  return providerName
    ? t('plugins.mail.labels.bubbleSourceProvider', { provider: providerName })
    : t('plugins.mail.labels.bubbleSourceDefault')
}

const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** wrapper 元素 ref，用于测量真实渲染高度（驱动窗口尺寸，不再用估值常量）。 */
const wrapperEl = ref<HTMLElement | null>(null)

/**
 * 测量 wrapper 真实内容高度（含所有气泡 + fold-hint + padding + gap）。
 *
 * 关键：气泡内容（文字换行）高度不确定，必须从 DOM 读 scrollHeight，不能用估值常量。
 * 否则窗口设矮了 → 内容溢出 + 出滚动条（用户报告的 bug）。
 */
async function measureHeight(): Promise<number> {
  await nextTick()
  const el = wrapperEl.value
  if (!el) {
    return FALLBACK_HEIGHT
  }
  const h = Math.ceil(el.scrollHeight)
  return h > 0 ? h : FALLBACK_HEIGHT
}

/**
 * 弹气泡：收到 SHOW_BUBBLE → 追加到队列 → 按真实内容高度重设窗口尺寸 → 定位到桌宠正上方
 * （clamp + 翻边复用 todo 面板逻辑）→ show → 渐显。
 *
 * 单条/多条复用同一路径：第一条到达 show 窗口，后续只追加 + 重排尺寸/定位。
 */
useTauriListen<BubblePayload>(LISTEN_KEY.SHOW_BUBBLE, async ({ payload }) => {
  // 到达时间戳：邮件用 arrivedAt，todo 用 dueDate；+ 自增 seq 保证同秒多条不撞 key
  const arriveTs = payload.type === 'mail' ? payload.arrivedAt : payload.dueDate
  queue.value.push({ key: `${arriveTs}-${seq++}`, payload })
  shown.value = true

  await layoutAndShow()
})

/** 子组件（Bubble/FoldHint）内容高度变化（文字换行）→ 重排窗口尺寸。 */
function onChildResize() {
  layoutAndShow()
}

/** 按真实内容高度重设窗口尺寸 + 定位（clamp + 翻边），然后确保窗口可见。 */
async function layoutAndShow() {
  const height = await measureHeight()
  const size = new PhysicalSize(BUBBLE_WIDTH, height)
  await appWindow.setSize(size)

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
      x = catPos.x + Math.round(catSize.width / 2 - BUBBLE_WIDTH / 2)
      // 垂直：猫正上方留 8px
      y = catPos.y - height - 8
      // 上方放不下 → 翻到猫下方
      if (y < monitor.position.y) {
        y = catPos.y + catSize.height + 8
      }
      // clamp 到屏内
      x = Math.max(
        monitor.position.x,
        Math.min(x, monitor.position.x + monitor.size.width - BUBBLE_WIDTH),
      )
      y = Math.max(
        monitor.position.y,
        Math.min(y, monitor.position.y + monitor.size.height - height),
      )
    }
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  showWindow(WINDOW_LABEL.BUBBLE)
  await nextTick()
  shown.value = true
}

/**
 * 点击气泡 → 按 type 分发：邮件标本地已读 + 打开 webmail；todo 打开 todo 面板。都随后关闭。
 *
 * 邮件：按 <accountId>:<uid> 匹配 mailNotification store 中的通知历史，调 markRead
 * （纯本地状态，**不向邮箱发 STORE**，D5-actual 零写约束）。5 分钟后归档由 tickRetention
 * 扫描处理——@tauri-store/pinia 默认开启跨窗口 state-change 同步（DEFAULT_SYNC=true），
 * 本窗口的 markRead 会 patchSelf 到 main 窗口的内存副本，main 的 tickRetention 能读到 readAt。
 * mail-list 窗口也各自跑 tickRetention 作为兜底（幂等，多窗口同时跑不冲突）。
 *
 * todo：emit SHOW_TODO_FULL 打开 todo 面板（与「待办」右键菜单同入口）。
 */
async function handleAction(item: BubbleItem) {
  if (item.payload.type === 'todo') {
    emit(LISTEN_KEY.SHOW_TODO_FULL)
    closeItem(item.key)
    return
  }
  const mail = item.payload
  const account = mailAccountStore.getAccount(mail.accountId)
  const url = account
    ? resolveWebmailUrl(account.address, account.imapHost)
    : null
  if (url) {
    openUrl(url).catch(() => {
      // 打开失败不阻塞关闭流程
    })
  }
  // 标本地已读：按 accountId+uid 匹配 mailNotification 项
  const match = mailNotificationStore.notifications.find(
    n => n.accountId === mail.accountId && n.uid === mail.uid,
  )
  if (match) {
    mailNotificationStore.markRead(match.id)
  }
  closeItem(item.key)
}

/** 点 × 关闭单条（只消失，不跳转）。 */
function closeItem(key: string) {
  queue.value = queue.value.filter(i => i.key !== key)
  if (queue.value.length === 0) {
    scheduleHide()
  } else {
    // 还有气泡，重排尺寸/定位
    layoutAndShow()
  }
}

/** 点折入提示「还有 N 条，查看邮件列表」→ 打开邮件列表窗口 + 关闭气泡。 */
function openMailList() {
  emit(LISTEN_KEY.SHOW_MAIL_LIST)
  scheduleHide()
}

/** 队列空时：先渐隐再 hideWindow。 */
function scheduleHide() {
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
  shown.value = false
  hideTimer = setTimeout(() => {
    hideWindow(WINDOW_LABEL.BUBBLE)
  }, FADE_MS)
}
</script>

<template>
  <div
    ref="wrapperEl"
    class="bubble-handdrawn bubble-window fade w-screen flex flex-col items-center overflow-hidden"
    :class="{ 'fade-shown': shown }"
    :style="{ gap: `${STACK_GAP}px`, paddingTop: `${PADDING_Y}px`, paddingBottom: `${PADDING_Y}px` }"
  >
    <Bubble
      v-for="item in shownItems"
      :key="item.key"
      :source="sourceLabel(item.payload)"
      :subtitle="item.payload.type === 'todo' ? t('plugins.todo.labels.bubbleDueBody') : item.payload.subject"
      :title="item.payload.type === 'todo' ? item.payload.title : item.payload.from"
      :type="item.payload.type"
      :urgent="item.payload.type === 'todo'"
      @action="handleAction(item)"
      @close="closeItem(item.key)"
      @resize="onChildResize"
    />
    <FoldHint
      v-if="overflow.overflow > 0"
      :count="overflow.overflow"
      @click="openMailList"
      @resize="onChildResize"
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
