<script setup lang="ts">
/**
 * Mail list item (MailItem): hand-drawn style, visuals follow mail-list.html.
 *
 * Three states (styling decided by the status + meta passed by the parent):
 * - unread: a red-ink dot marker on the left (reusing the todo ink-dot style SVG path).
 * - read: an envelope icon on the left + muted colors + meta showing "Read, archived in N minutes".
 * - archived: an envelope icon on the left (even fainter) + opacity 0.7 + an "Archived" tag + the absolute date.
 *
 * Clicking triggers action (mail list=mark read + jump to webmail; archive=jump to webmail).
 * Right-side action buttons (T5a): archive (mail list only, controlled by showArchive) + delete (both lists).
 * Delete double-confirm, inline variant: one click turns it into a red-highlighted "Confirm delete?" plus a 700ms forced reaction dead zone
 * (clicks inside the dead zone are ignored, preventing an accidental double-click from deleting outright); clicking again within 3.3s after
 * the dead zone deletes, otherwise it auto-reverts.
 * All linework is SVG; never use CSS borders.
 *
 * @see docs/designs/phase2-exploration/mail-list.html
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MailNotification } from '../../stores/mailNotification'

import { minutesUntilArchive } from '../../utils/retention'

const props = defineProps<{
  /** Mail data. */
  mail: MailNotification
  /** Status override (defaults to mail.status; the parent may pass read/archived to force the style). */
  status?: 'unread' | 'read' | 'archived'
  /** Provider name shown in the meta area (e.g. "Gmail" / "QQ Mail"), resolved by the parent. */
  providerName?: string | null
  /** Relative time shown in the meta area (e.g. "2 minutes ago" / "yesterday"), formatted by the parent. */
  timeLabel?: string
  /** Absolute date shown in the meta area (e.g. "2026.8.3"), passed by both lists, displayed alongside the relative time. */
  dateLabel?: string
  /** Whether to show the archive button (the mail list passes true; the archive list omits it / passes false). */
  showArchive?: boolean
}>()

const emit = defineEmits<{
  /** Click the mail item (the parent decides mark read + jump to webmail). */
  action: [id: string]
  /** Click the archive button (the parent calls mailNotificationStore.archive(id)). */
  archive: [id: string]
  /** Click the delete button (after double-confirm; the parent calls mailNotificationStore.purge(id)). */
  delete: [id: string]
}>()

const { t } = useI18n()

/** The status actually displayed: props.status takes priority, otherwise mail.status. */
const effectiveStatus = computed(() => props.status ?? props.mail.status)

/** Remaining minutes until an already-read mail is archived (based on readAt + current time). */
const minutesLeft = computed(() =>
  props.mail.readAt ? minutesUntilArchive(props.mail.readAt, Date.now()) : 0,
)

// ── Delete double-confirm (inline variant + forced reaction dead zone) ──
// Dead zone 700ms: a reaction dead zone right after the confirm state appears; clicks inside it are ignored (prevents an accidental double-click delete).
// After that a 3.3s confirm window; on timeout (4s total) it auto-reverts to the normal state.
const DEADZONE_MS = 700
const CONFIRM_WINDOW_MS = 3300
const confirmingDelete = ref(false)
/** Whether currently in the reaction dead zone (clicks are ignored inside it; visually grayed out to hint "please wait a moment"). */
const inDeadzone = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

/** First delete click: enter the confirm state + start the dead zone; after the dead zone ends, enter the confirmable window. */
function armConfirm(): void {
  confirmingDelete.value = true
  inDeadzone.value = true
  if (confirmTimer) {
    clearTimeout(confirmTimer)
  }
  // Dead zone over: clickable to confirm
  confirmTimer = setTimeout(() => {
    inDeadzone.value = false
    // Then start the confirmable window timer
    confirmTimer = setTimeout(() => {
      confirmingDelete.value = false
      inDeadzone.value = false
      confirmTimer = undefined
    }, CONFIRM_WINDOW_MS)
  }, DEADZONE_MS)
}

/** Delete button click: ignored inside the dead zone; unconfirmed → enter confirm; confirmed → really delete. */
function onClickDelete(): void {
  if (confirmingDelete.value) {
    if (inDeadzone.value) {
      // Reaction dead zone: ignore the click, preventing the user from deleting outright via double-click
      return
    }
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = undefined
    }
    confirmingDelete.value = false
    inDeadzone.value = false
    emit('delete', props.mail.id)
  } else {
    armConfirm()
  }
}

onBeforeUnmount(() => {
  if (confirmTimer) {
    clearTimeout(confirmTimer)
  }
})
</script>

<template>
  <div
    class="mail-item"
    :class="effectiveStatus"
    @click="emit('action', mail.id)"
  >
    <!-- Unread: red-ink dot (reusing the todo ink-dot three-layer path) -->
    <svg
      v-if="effectiveStatus === 'unread'"
      class="unread-dot"
      viewBox="0 0 14 14"
    >
      <path
        d="M 7 2 Q 11 2 12 5 Q 13 7 12 9 Q 11 12 7 12 Q 3 12 2 9 Q 1 7 2 5 Q 3 2 7 2 Z"
        fill="#d4654a"
        opacity="0.25"
      />
      <path
        d="M 7 3.5 Q 9.5 3.5 10.5 5.5 Q 11 7 10 8.5 Q 9 10.5 7 10.5 Q 5 10.5 4 8.5 Q 3 7 3.5 5.5 Q 4.5 3.5 7 3.5 Z"
        fill="#d4654a"
      />
    </svg>
    <!-- Read/archived: envelope icon -->
    <div
      v-else
      class="mail-icon"
    >
      <svg
        fill="none"
        height="16"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="16"
      >
        <path d="M 4 5 Q 3 5 3 6 L 3 18 Q 3 19 4 19 L 20 19 Q 21 19 21 18 L 21 6 Q 21 5 20 5 Z" />
        <path d="M 4 6 L 12 12 L 20 6" />
      </svg>
    </div>

    <div class="mail-main">
      <div class="mail-from">
        {{ mail.from || '—' }}
      </div>
      <div class="mail-subject">
        {{ mail.subject || '—' }}
      </div>
      <!-- Meta two-column grid: left=provider/read hint/archived tag, right=relative + absolute date -->
      <div class="mail-meta">
        <div class="meta-left">
          <span v-if="providerName">{{ providerName }}</span>
          <span v-if="effectiveStatus === 'read'">{{ t('plugins.mail.labels.mailReadMinutesLater', { n: minutesLeft }) }}</span>
          <span
            v-else-if="effectiveStatus === 'archived'"
            class="archived-tag"
          >{{ t('plugins.mail.labels.mailArchivedTag') }}</span>
        </div>
        <div
          v-if="timeLabel || dateLabel"
          class="meta-right"
        >
          <span v-if="timeLabel">{{ timeLabel }}</span>
          <span v-if="timeLabel && dateLabel">·</span>
          <span v-if="dateLabel">{{ dateLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Right-side action buttons (appear on hover; forced visible in confirm-delete/dead-zone states) -->
    <div
      class="mail-actions"
      :class="{ 'is-confirming': confirmingDelete }"
    >
      <!-- Archive button: hand-drawn lidded box (mail list only; hidden in the confirm-delete state to focus on deleting) -->
      <button
        v-if="showArchive && !confirmingDelete"
        class="action-btn"
        :title="t('plugins.mail.labels.mailArchiveAction')"
        type="button"
        @click.stop="emit('archive', mail.id)"
      >
        <!-- Hand-drawn archive box: wavy lid line + box body + handle slot -->
        <svg
          fill="none"
          height="20"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
          viewBox="0 0 24 24"
          width="20"
        >
          <!-- Lid: hand-drawn wavy horizontal line -->
          <path d="M 4 7 Q 8 6 12 7 Q 16 8 20 7" />
          <!-- Box body: hand-drawn irregular rectangle (Q curves, not straight lines) -->
          <path d="M 5 8 Q 4 8 4.5 9.5 L 6 19 Q 6 20.5 7.5 20.5 L 16.5 20.5 Q 18 20.5 18 19 L 19.5 9.5 Q 20 8 19 8" />
          <!-- Handle slot: small arc on the lid -->
          <path d="M 10 6 Q 12 4.5 14 6" />
        </svg>
      </button>
      <!-- Delete button: normal state=hand-drawn trash bin, confirm state="Confirm delete?" red text, dead-zone state=grayed-out disabled look -->
      <button
        class="action-btn"
        :class="{ confirming: confirmingDelete && !inDeadzone, deadzone: confirmingDelete && inDeadzone }"
        :disabled="confirmingDelete && inDeadzone"
        :title="t('plugins.mail.labels.mailDeleteAction')"
        type="button"
        @click.stop="onClickDelete"
      >
        <span
          v-if="confirmingDelete"
          class="confirm-text"
        >{{ t('plugins.mail.labels.mailConfirmDelete') }}</span>
        <svg
          v-else
          fill="none"
          height="20"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
          viewBox="0 0 24 24"
          width="20"
        >
          <!-- Hand-drawn trash bin: lid horizontal line + handle + bin body + two vertical grooves -->
          <path d="M 4 7 Q 8 6.5 12 7 Q 16 7.5 20 7" />
          <path d="M 10 5 Q 12 4 14 5" />
          <path d="M 6 8 Q 5.5 8 5.7 9 L 7 19 Q 7.2 20 8.2 20 L 15.8 20 Q 16.8 20 17 19 L 18.3 9 Q 18.5 8 18 8" />
          <path d="M 10 11 Q 9.8 14 9.5 17" />
          <path d="M 14 11 Q 14.2 14 14.5 17" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mail-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px;
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.mail-item:hover {
  background: rgb(244 168 160 / 8%);
}

.unread-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  margin-top: 8px;
}

.mail-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: 50%;
  background: rgb(155 196 224 / 20%);
  color: var(--ink-soft);
}

.mail-item.archived .mail-icon {
  background: rgb(196 181 160 / 15%);
  color: var(--ink-faint);
}

.mail-main {
  flex: 1;
  min-width: 0;
}

.mail-from {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--ink);
  word-break: break-word;
}

.mail-subject {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  word-break: break-word;
}

/* Meta two-column grid: keeps the archive list's provider · archived · relative · absolute from wrapping when squeezed */
.mail-meta {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 10px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-faint);
}

.meta-left {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-right {
  text-align: right;
  white-space: nowrap;
}

.mail-item.read .mail-from {
  font-weight: 600;
  color: var(--ink-soft);
}

.mail-item.read .mail-subject {
  color: var(--ink-faint);
}

.mail-item.archived {
  opacity: 0.7;
}

.archived-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-faint);
  background: rgb(196 181 160 / 20%);
}

/* ── Right-side action button area ── */
.mail-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.mail-item:hover .mail-actions {
  opacity: 1;
}

/* Confirm-delete/dead-zone states are forced visible (even when the mouse moves away) */
.mail-actions.is-confirming {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border: none;
  background: none;
  color: var(--ink-faint);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  border-radius: 8px;
  transition:
    color 0.2s,
    background 0.2s;
}

.action-btn:hover {
  color: var(--ink);
}

.action-btn.confirming {
  padding: 4px 10px;
  color: var(--red-ink);
  background: rgb(212 101 74 / 12%);
}

.action-btn.confirming:hover {
  background: rgb(212 101 74 / 20%);
}

/* Dead-zone state: grayed-out disabled look, hinting the user to "please wait" */
.action-btn.deadzone {
  padding: 4px 10px;
  color: var(--ink-faint);
  background: rgb(196 181 160 / 15%);
  cursor: not-allowed;
  opacity: 0.6;
}

.confirm-text {
  white-space: nowrap;
}
</style>
