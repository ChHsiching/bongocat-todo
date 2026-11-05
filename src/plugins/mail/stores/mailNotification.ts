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
  accountId: string
  uid: number
  from: string
  subject: string
  arrivedAt: number
  status: MailNotificationStatus
  readAt?: number
  archivedAt?: number
}

/**
 * Mail local notification history store (D9 local notification center).
 *
 * Read/written jointly by the "bubble", "mail list" and "archived mail" windows — each window is an independent webview
 * that calls `$tauri.start()` to load the same persisted JSON. After a write is persisted via saveOnChange,
 * started stores in other windows receive patches in under a second (@tauri-store/pinia DEFAULT_SYNC, verified live 2026-11-05).
 *
 * State machine: unread → read (click) → archived (after 5min / 24h timeout). Archived items are purged after 30 days.
 * **Never writes to the mail server** (read/archived are purely local states, D5-actual).
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D9
 */
export const useMailNotificationStore = defineStore('mailNotification', () => {
  const notifications = ref<MailNotification[]>([])

  function uidKey(accountId: string, uid: number): string {
    return `${accountId}:${uid}`
  }

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

  function markRead(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status !== 'unread') {
      return
    }
    n.status = 'read'
    n.readAt = now
  }

  function archive(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status === 'archived') {
      return
    }
    n.status = 'archived'
    n.archivedAt = now
  }

  function purge(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  function removeByAccount(accountId: string) {
    notifications.value = notifications.value.filter(n => n.accountId !== accountId)
  }

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

    const before = notifications.value.length
    notifications.value = notifications.value.filter(
      n => !(n.status === 'archived' && n.archivedAt && shouldPurgeArchived(n.archivedAt, now)),
    )
    if (notifications.value.length !== before) {
      changed = true
    }

    return { changed }
  }

  const activeMails = computed(() =>
    notifications.value
      .filter(n => n.status === 'unread' || n.status === 'read')
      .sort((a, b) => b.arrivedAt - a.arrivedAt),
  )

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
