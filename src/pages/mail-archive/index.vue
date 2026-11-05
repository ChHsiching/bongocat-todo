<script setup lang="ts">
/**
 * Archived mail window (T5, D9).
 *
 * An independent companion window (WINDOW_LABEL.MAIL_ARCHIVE) with a hand-drawn paper container, showing archived mails
 * (fainter styling with opacity 0.7 + an "Archived" tag). Click → jump to webmail (archived items are not marked read, idempotent).
 *
 * Independent webview; stores are not inherited from the main window — onMounted must call `$tauri.start()` to load persisted data.
 * Positioning reuses the todo panel's clamp + edge flip.
 *
 * Archiving is purely local state; **never send IMAP MOVE to the mail server** (D5-actual zero-write constraint).
 *
 * @see docs/designs/phase2-exploration/mail-list.html ② Archived mail
 * @see ADR 0002 D9
 */
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

// Follow-up to issue #19: resizable (constraints + restore + persistence); min height estimated from "header area + one mail + footer"
const { applyConstraints } = useResizablePanel({
  min: { width: 400, height: 320 },
  max: { width: 720, height: 8192 },
  fallback: { width: PANEL_SIZE.width, height: PANEL_SIZE.height },
  restore: () => mailSettingsStore.archivePanelSize,
  persist: size => mailSettingsStore.setArchivePanelSize(size),
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
  await mailAccountStore.$tauri.start()
  await mailNotificationStore.$tauri.start()
  // issue #19: panel size persistence depends on this window starting mailSettings (previously it missed the start,
  // so persist wrote into an unstarted store, saveOnChange silently skipped it, and the file never reached disk)
  await mailSettingsStore.$tauri.start()
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

/** Archived mails (newest archived first). */
const archivedMails = computed(() => mailNotificationStore.archivedMails)

function providerName(accountId: string): string | null {
  const account = mailAccountStore.getAccount(accountId)
  return account ? (matchProvider(account.address)?.displayName ?? null) : null
}

function timeLabel(mail: { archivedAt?: number }): string {
  return mail.archivedAt ? relativeTime(mail.archivedAt, now.value) : ''
}

/** Absolute date (year.month.day), shown alongside the relative time in the archive list meta. Uses the arrival time. */
function dateLabel(mail: { arrivedAt: number }): string {
  return absoluteDate(mail.arrivedAt)
}

useTauriListen(LISTEN_KEY.SHOW_MAIL_ARCHIVE, async () => {
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
  showWindow(WINDOW_LABEL.MAIL_ARCHIVE)
  await nextTick()
  shown.value = true
  now.value = Date.now()
})

/** Click an archived mail → jump to webmail (archived items are not marked read, idempotent). */
function handleAction(id: string) {
  const mail = mailNotificationStore.notifications.find(n => n.id === id)
  if (!mail) {
    return
  }
  const account = mailAccountStore.getAccount(mail.accountId)
  const url = account ? resolveWebmailUrl(account.address, account.imapHost) : null
  if (url) {
    openUrl(url).catch(() => {
      // Open failure does not block
    })
  }
}

/** Delete button (after double-confirm): remove entirely from the store. */
function handleDelete(id: string) {
  mailNotificationStore.purge(id)
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
            <!-- Archive icon: box + top lid line (per the design) -->
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
            <!-- Hand-drawn ×: two smooth large crossing arcs, consistent with the todo panel -->
            <path d="M 6 6 Q 9.5 13 19 19" />
            <path d="M 18 6 Q 8.5 10 5 18" />
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
          :date-label="dateLabel(mail)"
          :mail="mail"
          :provider-name="providerName(mail.accountId)"
          :time-label="timeLabel(mail)"
          @action="handleAction"
          @delete="handleDelete"
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
