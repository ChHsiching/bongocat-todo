<script setup lang="ts">
/**
 * 归档邮件窗口（T5，D9）。
 *
 * 独立伴随窗口（WINDOW_LABEL.MAIL_ARCHIVE），手绘风纸张容器，展示已归档邮件
 * （样式更淡 opacity 0.7 + 「已归档」标签）。点击 → 跳 webmail（归档项不标已读，幂等）。
 *
 * 独立 webview，store 不继承 main 窗口——必须 onMounted 调 `$tauri.start()` 加载持久化数据。
 * 定位逻辑复用 todo 面板的 clamp + 翻边。
 *
 * 归档全是本地状态，**绝不向邮箱服务端发 IMAP MOVE**（D5-actual 零写约束）。
 *
 * @see docs/designs/phase2-exploration/mail-list.html ② 归档邮件
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
import { relativeTime } from '@/plugins/mail/utils/timeFormat'
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

const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
  appWindow.setTitle(t('plugins.mail.labels.mailArchiveTitle'))

  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
  }
})

/** 已归档邮件（按归档时间倒序）。 */
const archivedMails = computed(() => mailNotificationStore.archivedMails)

function providerName(accountId: string): string | null {
  const account = mailAccountStore.getAccount(accountId)
  return account ? (matchProvider(account.address)?.displayName ?? null) : null
}

function timeLabel(mail: { archivedAt?: number }): string {
  return mail.archivedAt ? relativeTime(mail.archivedAt, now.value) : ''
}

useTauriListen(LISTEN_KEY.SHOW_MAIL_ARCHIVE, async () => {
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
  showWindow(WINDOW_LABEL.MAIL_ARCHIVE)
  await nextTick()
  shown.value = true
  now.value = Date.now()
})

/** 点击归档邮件 → 跳 webmail（归档项不标已读，幂等）。 */
function handleAction(id: string) {
  const mail = mailNotificationStore.notifications.find(n => n.id === id)
  if (!mail) {
    return
  }
  const account = mailAccountStore.getAccount(mail.accountId)
  const url = account ? resolveWebmailUrl(account.address, account.imapHost) : null
  if (url) {
    openUrl(url).catch(() => {
      // 打开失败不阻塞
    })
  }
}

function handleClose() {
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
  shown.value = false
  hideTimer = setTimeout(() => hideWindow(WINDOW_LABEL.MAIL_ARCHIVE), FADE_MS)
}
</script>

<template>
  <div
    class="bubble-handdrawn mail-archive-page fade h-screen w-screen overflow-hidden"
    :class="{ 'fade-shown': shown }"
  >
    <MailPanel>
      <div
        class="panel-header"
        data-tauri-drag-region
      >
        <div class="panel-title-row">
          <div class="panel-paw">
            <!-- 归档图标：盒子 + 顶盖横线（对照设计稿） -->
            <svg
              fill="none"
              height="30"
              stroke="#8a7560"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.2"
              viewBox="0 0 32 32"
              width="30"
            >
              <rect
                height="16"
                rx="2"
                width="20"
                x="6"
                y="10"
              />
              <path d="M 6 14 L 16 14" />
            </svg>
          </div>
          <span class="panel-title">{{ t('plugins.mail.labels.mailArchiveTitle') }}</span>
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

      <div class="panel-scroll">
        <div
          v-if="archivedMails.length"
          class="section-label"
        >
          <span>{{ t('plugins.mail.labels.mailArchiveSection') }} · {{ archivedMails.length }}</span>
          <WaveDivider />
        </div>
        <MailItem
          v-for="mail in archivedMails"
          :key="mail.id"
          :mail="mail"
          :provider-name="providerName(mail.accountId)"
          :time-label="timeLabel(mail)"
          @action="handleAction"
        />

        <div
          v-if="!archivedMails.length"
          class="empty-state"
        >
          {{ t('plugins.mail.labels.mailArchiveEmpty') }}
        </div>
      </div>

      <div class="panel-footer">
        {{ t('plugins.mail.labels.mailArchiveFooter') }}
      </div>
    </MailPanel>
  </div>
</template>

<style scoped>
.mail-archive-page {
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
