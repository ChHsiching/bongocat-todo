<script setup lang="ts">
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { availableMonitors } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ResizeHandles from '@/components/ResizeHandles/index.vue'
import { useResizablePanel } from '@/composables/useResizablePanel'
import { useTauriListen } from '@/composables/useTauriListen'
import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'
import MailItem from '@/plugins/mail/components/MailItem/index.vue'
import MailPanel from '@/plugins/mail/components/MailPanel/index.vue'
import { useMailAccountStore } from '@/plugins/mail/stores/mailAccount'
import { useMailNotificationStore } from '@/plugins/mail/stores/mailNotification'
import { useMailSettingsStore } from '@/plugins/mail/stores/mailSettings'
import { matchProvider, resolveWebmailUrl } from '@/plugins/mail/utils/providers'
import { absoluteDate, relativeTime } from '@/plugins/mail/utils/timeFormat'
import WaveDivider from '@/plugins/todo/components/WaveDivider/index.vue'
import { hideWindow, showWindow } from '@/plugins/window'
import '@/plugins/mail/styles/bubble.css'

const appWindow = getCurrentWebviewWindow()

const FADE_MS = 200
const PANEL_SIZE = new PhysicalSize(400, 560)

const { applyConstraints } = useResizablePanel({
  min: { width: 400, height: 320 },
  max: { width: 720, height: 8192 },
  fallback: { width: PANEL_SIZE.width, height: PANEL_SIZE.height },
  restore: () => mailSettingsStore.listPanelSize,
  persist: size => mailSettingsStore.setListPanelSize(size),
})

const mailAccountStore = useMailAccountStore()
const mailSettingsStore = useMailSettingsStore()
const mailNotificationStore = useMailNotificationStore()
const { t } = useI18n()

const shown = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  // Independent webview; each must load its own persisted stores (see the CONTEXT.md T2 pitfalls list)
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
  // issue #19: panel size persistence depends on this window starting mailSettings (previously it missed the start,
  // so persist wrote into an unstarted store, saveOnChange silently skipped it, and the file never reached disk)
  await mailSettingsStore.$tauri.start()
  appWindow.setTitle(t('plugins.mail.labels.mailListTitle'))

  // Refresh the relative time copy every minute + run the retention rules (mails markRead'd in this window get archived after 5 minutes).
  // Cross-window sync: @tauri-store/pinia patches started stores in other windows in under a second (verified live); the local tickRetention below stays as an idempotent fallback.
  // The main window's tickRetention runs on its own in-memory copy and cannot see this window's markRead;
  // therefore this window must also run its own tickRetention so read mails are archived after 5 minutes (idempotent, no conflict across windows running simultaneously).
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

const unreadMails = computed(() =>
  mailNotificationStore.activeMails.filter(m => m.status === 'unread'),
)

const readMails = computed(() =>
  mailNotificationStore.activeMails.filter(m => m.status === 'read'),
)

function providerName(accountId: string): string | null {
  const account = mailAccountStore.getAccount(accountId)
  return account ? (matchProvider(account.address)?.displayName ?? null) : null
}

function timeLabel(mail: { arrivedAt: number }): string {
  return relativeTime(mail.arrivedAt, now.value)
}

function dateLabel(mail: { arrivedAt: number }): string {
  return absoluteDate(mail.arrivedAt)
}

useTauriListen(LISTEN_KEY.SHOW_MAIL_LIST, async () => {
  const panelTarget = await applyConstraints()

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
      x = catPos.x + Math.round(catSize.width / 2 - panelTarget.width / 2)
      y = catPos.y - panelTarget.height - 8
      if (y < monitor.position.y) {
        y = catPos.y + catSize.height + 8
      }
      x = Math.max(
        monitor.position.x,
        Math.min(x, monitor.position.x + monitor.size.width - panelTarget.width),
      )
      y = Math.max(
        monitor.position.y,
        Math.min(y, monitor.position.y + monitor.size.height - panelTarget.height),
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
 * Click a mail → mark read locally + jump to webmail.
 *
 * Read is a purely local state (no STORE sent to the mailbox, D5-actual). Archiving after 5 minutes is handled
 * by the retention tick — this window runs its own local tick as a fallback (idempotent, coexists with the
 * main window's timer), so mails read here still get archived.
 */
function handleAction(id: string) {
  const mail = mailNotificationStore.notifications.find(n => n.id === id)
  if (!mail) {
    return
  }
  mailNotificationStore.markRead(id)

  const account = mailAccountStore.getAccount(mail.accountId)
  const url = account ? resolveWebmailUrl(account.address, account.imapHost) : null
  if (url) {
    openUrl(url).catch(() => {
    })
  }
}

function handleArchive(id: string) {
  mailNotificationStore.archive(id)
}

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
    <!-- Resize handles hugging the sticker's visible border (insets calibrated against the MailPanel baseline L20/R22/T18/B19) -->
    <ResizeHandles
      :inset-bottom="19"
      :inset-left="20"
      :inset-right="22"
      :inset-top="18"
    />
    <MailPanel>
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
            <path d="M 6 6 Q 9.5 13 19 19" />
            <path d="M 18 6 Q 8.5 10 5 18" />
          </svg>
        </button>
      </div>

      <div class="panel-scroll">
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
