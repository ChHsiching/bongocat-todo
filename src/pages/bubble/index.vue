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

const FADE_MS = 200

const MIN_BUBBLE_WIDTH = 360

const STACK_GAP = 10
const PADDING_Y = 8
const FALLBACK_HEIGHT = 80

// Array queue: FIFO order, tail = newest.
interface BubbleItem {
  key: string
  payload: BubblePayload
}
const queue = ref<BubbleItem[]>([])

let seq = 0

const overflow = computed(() => computeBubbleOverflow(queue.value.length))
const shownItems = computed(() => queue.value.slice(0, overflow.value.shown))

const naturalWidths = ref<Record<string, number>>({})

const bubbleWidth = computed(() => {
  let w = MIN_BUBBLE_WIDTH
  for (const item of shownItems.value) {
    const nw = naturalWidths.value[item.key]
    if (nw && nw > w) {
      w = nw
    }
  }
  return w
})

const mailAccountStore = useMailAccountStore()
const mailNotificationStore = useMailNotificationStore()
const { t } = useI18n()

// bubble is an independent webview; its store instances are separate from the main window's. This window must also call
// $tauri.start() to load the persisted account data, otherwise accounts is empty → provider detection fails (sourceLabel
// cannot get the address). After loading, account changes trigger reactive re-renders.
// The mailNotification store is loaded here too: on mail click, the local notification history is matched by <accountId>:<uid>
// and markRead marks it read locally (archiving after 5 minutes is handled by the main window's tickRetention).
onMounted(async () => {
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
})

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

const wrapperEl = ref<HTMLElement | null>(null)

/**
 * Measure the wrapper's real content height (all bubbles + fold-hint + padding + gap included).
 *
 * Key point: bubble content height (text wrapping) is indeterminate, so scrollHeight must be read from the DOM instead of using an estimate constant.
 * Otherwise a too-short window → content overflows + a scrollbar appears (the user-reported bug).
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

useTauriListen<BubblePayload>(LISTEN_KEY.SHOW_BUBBLE, async ({ payload }) => {
  const arriveTs = payload.type === 'mail' ? payload.arrivedAt : payload.dueDate
  queue.value.push({ key: `${arriveTs}-${seq++}`, payload })
  shown.value = true

  await layoutAndShow()
})

function onChildResize(key: string, naturalWidth?: number) {
  if (naturalWidth && naturalWidth > 0) {
    naturalWidths.value[key] = naturalWidth
  }
  layoutAndShow()
}

async function layoutAndShow() {
  const height = await measureHeight()
  const width = bubbleWidth.value
  const size = new PhysicalSize(width, height)
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
      x = catPos.x + Math.round(catSize.width / 2 - width / 2)
      y = catPos.y - height - 8
      // Clamp into the screen (y at minimum hugs the screen top; x does not overflow left/right)
      x = Math.max(
        monitor.position.x,
        Math.min(x, monitor.position.x + monitor.size.width - width),
      )
      y = Math.max(monitor.position.y, y)
    }
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  showWindow(WINDOW_LABEL.BUBBLE)
  await nextTick()
  shown.value = true
}

/**
 * Bubble click → dispatch by type: mail marks read locally + opens webmail; todo opens the todo panel. Both then close.
 *
 * Mail: matches the notification history in the mailNotification store by <accountId>:<uid> and calls markRead
 * (purely local state, **never sends STORE to the mailbox**, the D5-actual zero-write constraint). Archiving after 5 minutes is handled
 * by the tickRetention scan — @tauri-store/pinia enables cross-window state-change sync by default (DEFAULT_SYNC=true), so this window's
 * markRead patchSelves into the main window's in-memory copy and the main's tickRetention can read readAt.
 * The mail-list window also runs its own tickRetention as a fallback (idempotent, no conflict across windows running simultaneously).
 *
 * todo: emits SHOW_TODO_FULL to open the todo panel (same entry as the "todo" context menu).
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
    })
  }
  const match = mailNotificationStore.notifications.find(
    n => n.accountId === mail.accountId && n.uid === mail.uid,
  )
  if (match) {
    mailNotificationStore.markRead(match.id)
  }
  closeItem(item.key)
}

function closeItem(key: string) {
  queue.value = queue.value.filter(i => i.key !== key)
  delete naturalWidths.value[key]
  if (queue.value.length === 0) {
    scheduleHide()
  } else {
    // Bubbles remain, re-layout size/position
    layoutAndShow()
  }
}

function openMailList() {
  emit(LISTEN_KEY.SHOW_MAIL_LIST)
  scheduleHide()
}

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
      :width="bubbleWidth"
      @action="handleAction(item)"
      @close="closeItem(item.key)"
      @resize="(h: number, nw: number) => onChildResize(item.key, nw)"
    />
    <FoldHint
      v-if="overflow.overflow > 0"
      :count="overflow.overflow"
      @click="openMailList"
      @resize="() => layoutAndShow()"
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
