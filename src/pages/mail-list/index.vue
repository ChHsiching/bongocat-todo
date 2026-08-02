<script setup lang="ts">
/**
 * 邮件列表窗口（T5，D9）。
 *
 * 独立伴随窗口（WINDOW_LABEL.MAIL_LIST），手绘风纸张容器（复用 MailPanel），
 * 展示未读 + 已读邮件。点击邮件 → 标本地已读 + 跳 webmail（5 分钟后归档由 store tick 处理）。
 *
 * 独立 webview，store 不继承 main 窗口——必须 onMounted 调 `$tauri.start()` 加载持久化数据。
 * 定位逻辑复用 todo 面板的 clamp + 翻边（锚点 main 窗口，贴猫正上方居中）。
 *
 * 已读/归档全是本地状态，**绝不向邮箱服务端发 IMAP STORE**（D5-actual 零写约束）。
 *
 * @see docs/designs/phase2-exploration/mail-list.html
 * @see ADR 0002 D9
 */
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import MailItem from '@/plugins/mail/components/MailItem/index.vue'
import MailPanel from '@/plugins/mail/components/MailPanel/index.vue'
import { useMailAccountStore } from '@/plugins/mail/stores/mailAccount'
import { useMailNotificationStore } from '@/plugins/mail/stores/mailNotification'
import { matchProvider, resolveWebmailUrl } from '@/plugins/mail/utils/providers'
import { absoluteDate, relativeTime } from '@/plugins/mail/utils/timeFormat'
import WaveDivider from '@/plugins/todo/components/WaveDivider/index.vue'
import { hideWindow, showWindow } from '@/plugins/window'
import '@/plugins/mail/styles/bubble.css'

const appWindow = getCurrentWebviewWindow()

const FADE_MS = 200
const PANEL_SIZE = new PhysicalSize(400, 560)

const mailAccountStore = useMailAccountStore()
const mailNotificationStore = useMailNotificationStore()
const { t } = useI18n()

const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** now tick：每分钟刷新相对时间文案（让「2 分钟前」滚动更新）。 */
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  // 独立 webview，必须各自加载持久化 store（见 CONTEXT.md T2 踩坑清单）
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
  appWindow.setTitle(t('plugins.mail.labels.mailListTitle'))

  // 每分钟刷新相对时间文案 + 跑留存规则（本窗口点了 markRead 的邮件 5 分钟后归档）。
  // 跨窗口同步说明：mailNotification store 持久化到 JSON，但各窗口内存 store 不实时同步。
  // main 窗口的 tickRetention 跑在它自己的内存副本上，看不到本窗口的 markRead；
  // 因此本窗口也需自己跑 tickRetention，确保已读邮件在 5 分钟后被归档（幂等，多窗口同时跑不冲突）。
  nowTimer = setInterval(() => {
    now.value = Date.now()
    mailNotificationStore.tickRetention(now.value)
  }, 60_000)
})

onBeforeUnmount(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
  }
})

/** 未读分组（status=unread）。 */
const unreadMails = computed(() =>
  mailNotificationStore.activeMails.filter(m => m.status === 'unread'),
)

/** 已读分组（status=read，5 分钟内会自动归档）。 */
const readMails = computed(() =>
  mailNotificationStore.activeMails.filter(m => m.status === 'read'),
)

/** 按 accountId 解析 provider 展示名（meta 区「Gmail」/「QQ 邮箱」用）。 */
function providerName(accountId: string): string | null {
  const account = mailAccountStore.getAccount(accountId)
  return account ? (matchProvider(account.address)?.displayName ?? null) : null
}

/** 相对时间（到达时间）。 */
function timeLabel(mail: { arrivedAt: number }): string {
  return relativeTime(mail.arrivedAt, now.value)
}

/** 绝对日期（年.月.日），meta 区与相对时间并列显示。 */
function dateLabel(mail: { arrivedAt: number }): string {
  return absoluteDate(mail.arrivedAt)
}

/**
 * 打开窗口：贴猫正上方居中 + clamp + 翻边，setSize → show → 渐显。
 * 复用 todo 面板 / bubble 的定位范式。
 */
useTauriListen(LISTEN_KEY.SHOW_MAIL_LIST, async () => {
  await appWindow.setSize(PANEL_SIZE)

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
      x = catPos.x + Math.round(catSize.width / 2 - PANEL_SIZE.width / 2)
      y = catPos.y - PANEL_SIZE.height - 8
      if (y < monitor.position.y) {
        y = catPos.y + catSize.height + 8
      }
      x = Math.max(
        monitor.position.x,
        Math.min(x, monitor.position.x + monitor.size.width - PANEL_SIZE.width),
      )
      y = Math.max(
        monitor.position.y,
        Math.min(y, monitor.position.y + monitor.size.height - PANEL_SIZE.height),
      )
    }
  }

  await appWindow.setPosition(new PhysicalPosition(x, y))
  shown.value = false
  showWindow(WINDOW_LABEL.MAIL_LIST)
  await nextTick()
  shown.value = true
  now.value = Date.now()
})

/**
 * 点击邮件 → 标本地已读 + 跳 webmail。
 *
 * 已读是纯本地状态（不向邮箱发 STORE，D5-actual）。5 分钟后归档由 main 窗口的
 * tickRetention 定时器扫描处理，本窗口无需单独起 timer。
 */
function handleAction(id: string) {
  const mail = mailNotificationStore.notifications.find(n => n.id === id)
  if (!mail) {
    return
  }
  // 标本地已读（幂等：已读再点无副作用）
  mailNotificationStore.markRead(id)

  // 跳 webmail（按账号 address 匹配 provider，未命中回退 imapHost）
  const account = mailAccountStore.getAccount(mail.accountId)
  const url = account ? resolveWebmailUrl(account.address, account.imapHost) : null
  if (url) {
    openUrl(url).catch(() => {
      // 打开失败不阻塞
    })
  }
}

/** 归档按钮：直接归档（不点开跳浏览器）。幂等：已归档再调无副作用。 */
function handleArchive(id: string) {
  mailNotificationStore.archive(id)
}

/** 删除按钮（二次确认后）：从 store 彻底移除。 */
function handleDelete(id: string) {
  mailNotificationStore.purge(id)
}

function handleClose() {
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
  shown.value = false
  hideTimer = setTimeout(() => hideWindow(WINDOW_LABEL.MAIL_LIST), FADE_MS)
}
</script>

<template>
  <div
    class="bubble-handdrawn mail-list-page fade h-screen w-screen overflow-hidden"
    :class="{ 'fade-shown': shown }"
  >
    <MailPanel>
      <!-- 标题区（可拖拽移动窗口；子元素 pointer-events:none 让拖拽穿透） -->
      <div
        class="panel-header"
        data-tauri-drag-region
      >
        <div class="panel-title-row">
          <div class="panel-paw">
            <svg
              fill="none"
              height="32"
              viewBox="0 0 32 32"
              width="32"
            >
              <rect
                fill="none"
                height="17"
                rx="3"
                stroke="#4a3a2e"
                stroke-linejoin="round"
                stroke-width="2.2"
                width="24"
                x="4"
                y="8"
              />
              <path
                d="M 5 10 Q 16 18 27 10"
                fill="none"
                stroke="#4a3a2e"
                stroke-linecap="round"
                stroke-width="2.2"
              />
            </svg>
          </div>
          <span class="panel-title">{{ t('plugins.mail.labels.mailListTitle') }}</span>
        </div>
        <button
          class="panel-close"
          :title="t('plugins.mail.labels.bubbleClose')"
          type="button"
          @click="handleClose"
        >
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="2.5"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M 6 6 Q 9 9 12 12 Q 15 15 18 18" />
            <path d="M 18 6 Q 15 9 12 12 Q 9 15 6 18" />
          </svg>
        </button>
      </div>

      <!-- 可滚动列表区 -->
      <div class="panel-scroll">
        <!-- 未读分组 -->
        <div
          v-if="unreadMails.length"
          class="section-label"
        >
          <span>{{ t('plugins.mail.labels.mailListUnreadSection') }} · {{ unreadMails.length }}</span>
          <WaveDivider />
        </div>
        <MailItem
          v-for="mail in unreadMails"
          :key="mail.id"
          :date-label="dateLabel(mail)"
          :mail="mail"
          :provider-name="providerName(mail.accountId)"
          :show-archive="true"
          :time-label="timeLabel(mail)"
          @action="handleAction"
          @archive="handleArchive"
          @delete="handleDelete"
        />

        <!-- 已读分组 -->
        <div
          v-if="readMails.length"
          class="section-label"
        >
          <span>{{ t('plugins.mail.labels.mailListReadSection') }} · {{ readMails.length }}</span>
          <WaveDivider />
        </div>
        <MailItem
          v-for="mail in readMails"
          :key="mail.id"
          :date-label="dateLabel(mail)"
          :mail="mail"
          :provider-name="providerName(mail.accountId)"
          :show-archive="true"
          :time-label="timeLabel(mail)"
          @action="handleAction"
          @archive="handleArchive"
          @delete="handleDelete"
        />

        <!-- 空状态 -->
        <div
          v-if="!unreadMails.length && !readMails.length"
          class="empty-state"
        >
          {{ t('plugins.mail.labels.mailEmpty') }}
        </div>
      </div>

      <div class="panel-footer">
        {{ t('plugins.mail.labels.mailListFooter') }}
      </div>
    </MailPanel>
  </div>
</template>

<style scoped>
.mail-list-page {
  padding: 8px;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.panel-paw {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.panel-title {
  font-size: 20px;
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
  border: none;
  background: none;
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
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
}

.section-label:first-of-type {
  margin-top: 0;
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.panel-scroll::-webkit-scrollbar {
  display: none;
}

.empty-state {
  padding: 32px 20px;
  text-align: center;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-faint);
}

.panel-footer {
  flex-shrink: 0;
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-faint);
}

.fade {
  opacity: 0;
  transition: opacity 200ms ease;
}

.fade-shown {
  opacity: 1;
}
</style>
