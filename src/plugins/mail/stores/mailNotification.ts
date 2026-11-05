import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { NewMailPayload } from '../index'

import {
  shouldArchiveRead,
  shouldArchiveUnread,
  shouldPurgeArchived,
} from '../utils/retention'

/**
 * Mail local status (frontend-only; never sends IMAP STORE/MOVE to the mail server — D5-actual zero-write constraint).
 *
 * - `unread`: a new mail just announced by a bubble notification (default state).
 * - `read`: the user clicked the bubble/list item (marked read locally), archived after 5 minutes.
 * - `archived`: archived (moved into the archive list), purged from the list after 30 days.
 */
export type MailNotificationStatus = 'unread' | 'read' | 'archived'

/** A single mail in the local notification history (envelope metadata + local status). */
export interface MailNotification {
  /** Locally unique id (nanoid, unrelated to the mail UID; the same mail may appear multiple times due to re-pushes — deduplicated by uidKey). */
  id: string
  /** Source account id (links to mailAccountStore.accounts[*].id). */
  accountId: string
  /** Mail UID (used for offline catch-up dedup, unique per `<accountId>:<uid>`). 0 means unknown (should not happen, defensive). */
  uid: number
  /** Sender (parsed from IMAP ENVELOPE.from, may be `mailbox@host` or a display name). */
  from: string
  /** Subject (MIME decoded). */
  subject: string
  /** Arrival timestamp (ms, pushed from Rust). */
  arrivedAt: number
  /** Local status. */
  status: MailNotificationStatus
  /** Timestamp when marked read (present when status=read/archived). */
  readAt?: number
  /** Archive timestamp (present when status=archived). */
  archivedAt?: number
}

/**
 * Mail local notification history store (D9 local notification center).
 *
 * Read/written jointly by the "bubble", "mail list" and "archived mail" windows — each window is an independent webview
 * that calls `$tauri.start()` to load the same persisted JSON. After a write is persisted via saveOnChange,
 * other windows need to be reopened or notified via an event to refresh (no cross-window realtime sync for now, acceptable within T5 scope).
 *
 * State machine: unread → read (click) → archived (after 5min / 24h timeout). Archived items are purged after 30 days.
 * **Never writes to the mail server** (read/archived are purely local states, D5-actual).
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D9
 */
export const useMailNotificationStore = defineStore('mailNotification', () => {
  /** All mails (unread + read + archived). The UI renders them grouped via getters. */
  const notifications = ref<MailNotification[]>([])

  /** Dedup key by `<accountId>:<uid>` (used by upsertMail). */
  function uidKey(accountId: string, uid: number): string {
    return `${accountId}:${uid}`
  }

  /** Existing uidKey → notification.id (O(1) duplicate lookup). */
  const byUid = computed(() => {
    const m = new Map<string, string>()
    for (const n of notifications.value) {
      if (n.uid > 0) {
        m.set(uidKey(n.accountId, n.uid), n.id)
      }
    }
    return m
  })

  /**
   * New mail arrived: upsert into notifications.
   *
   * Dedup: if the same `<accountId>:<uid>` already exists, **do not overwrite** (preserve the user's read/archived state —
   * in the offline catch-up scenario the user may have already clicked it in the list). When the payload has no uid
   * (Rust NewMailPayload lacks it), uid=0 and dedup is skipped (append every time) — the current caller fills in the uid
   * in setupMailPlugin before calling.
   *
   * @returns The newly created or existing MailNotification; newly created ones get status='unread'.
   */
  function upsertMail(mail: NewMailPayload, uid: number): MailNotification {
    if (uid > 0) {
      const existingId = byUid.value.get(uidKey(mail.accountId, uid))
      if (existingId) {
        const existing = notifications.value.find(n => n.id === existingId)
        if (existing) {
          return existing
        }
      }
    }

    const notification: MailNotification = {
      id: nanoid(),
      accountId: mail.accountId,
      uid,
      from: mail.from,
      subject: mail.subject,
      arrivedAt: mail.arrivedAt,
      status: 'unread',
    }
    notifications.value.push(notification)
    return notification
  }

  /**
   * Mark read locally (status: unread → read, records readAt).
   *
   * Calling again on already-read/archived mails has no side effect (idempotent). **Never sends STORE to the mail server** (D5-actual).
   */
  function markRead(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status !== 'unread') {
      return
    }
    n.status = 'read'
    n.readAt = now
  }

  /** Archive manually (status → archived, records archivedAt). Calling again on archived mails has no side effect. */
  function archive(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status === 'archived') {
      return
    }
    n.status = 'archived'
    n.archivedAt = now
  }

  /** Remove from the list entirely (used to purge 30-day-old archived items). */
  function purge(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  /**
   * Clear all notification history of an account (cascade cleanup when deleting an account).
   *
   * Called on account deletion: removes all unread/read/archived mails of that account from the local notification history,
   * avoiding "the account is deleted but orphan items still hang in the mail list". Does not affect other accounts.
   */
  function removeByAccount(accountId: string) {
    notifications.value = notifications.value.filter(n => n.accountId !== accountId)
  }

  /**
   * Retention rule tick: scans all mails and transitions states per the 24h/5min/30-day deadlines.
   *
   * Called once per minute by setupMailPlugin in the main window (a single timer, avoiding per-mail timers).
   * Purely local state transitions, zero side effects on the mail server.
   *
   * @returns {changed} Whether anything changed (the UI can refresh accordingly).
   */
  function tickRetention(now: number = Date.now()): { changed: boolean } {
    let changed = false

    for (const n of notifications.value) {
      if (n.status === 'unread' && shouldArchiveUnread(n.arrivedAt, now)) {
        n.status = 'archived'
        n.archivedAt = now
        changed = true
      } else if (n.status === 'read' && n.readAt && shouldArchiveRead(n.readAt, now)) {
        n.status = 'archived'
        n.archivedAt = now
        changed = true
      }
    }

    // Purge archived items older than 30 days
    const before = notifications.value.length
    notifications.value = notifications.value.filter(
      n => !(n.status === 'archived' && n.archivedAt && shouldPurgeArchived(n.archivedAt, now)),
    )
    if (notifications.value.length !== before) {
      changed = true
    }

    return { changed }
  }

  // ── UI getters (consumed grouped by status in the mail list / archive windows) ──

  /** Items shown in the mail list window: unread + read (archived excluded). */
  const activeMails = computed(() =>
    notifications.value
      .filter(n => n.status === 'unread' || n.status === 'read')
      .sort((a, b) => b.arrivedAt - a.arrivedAt),
  )

  /** Items shown in the archive window (newest archived first). */
  const archivedMails = computed(() =>
    notifications.value
      .filter(n => n.status === 'archived')
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
  )

  return {
    notifications,
    upsertMail,
    markRead,
    archive,
    purge,
    removeByAccount,
    tickRetention,
    activeMails,
    archivedMails,
  }
})
