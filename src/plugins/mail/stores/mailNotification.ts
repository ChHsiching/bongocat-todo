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
 * 邮件本地状态（纯本地，绝不向邮箱服务端发 IMAP STORE/MOVE——D5-actual 零写约束）。
 *
 * - `unread`：刚被气泡提醒的新邮件（默认状态）。
 * - `read`：用户点过气泡/列表项（标本地已读），5 分钟后归档。
 * - `archived`：已归档（转入归档列表），30 天后从列表清理。
 */
export type MailNotificationStatus = 'unread' | 'read' | 'archived'

/** 本地通知历史中的一封邮件（信封元数据 + 本地状态）。 */
export interface MailNotification {
  /** 本地唯一 id（nanoid，与邮箱 UID 无关，同一封邮件可能因补推出现多条——靠 uidKey 去重）。 */
  id: string
  /** 源账号 id（关联 mailAccountStore.accounts[*].id）。 */
  accountId: string
  /** 邮箱 UID（离线补发去重用，`<accountId>:<uid>` 唯一）。0 表示未知（不应出现，防御）。 */
  uid: number
  /** 发件人（解析自 IMAP ENVELOPE.from，可能是 `mailbox@host` 或显示名）。 */
  from: string
  /** 主题（MIME decoded）。 */
  subject: string
  /** 到达时间戳（ms，来自 Rust 推送）。 */
  arrivedAt: number
  /** 本地状态。 */
  status: MailNotificationStatus
  /** 标记已读的时间戳（status=read/archived 时有）。 */
  readAt?: number
  /** 归档时间戳（status=archived 时有）。 */
  archivedAt?: number
}

/**
 * 邮件本地通知历史 store（D9 本地通知中心）。
 *
 * 被「气泡」「邮件列表」「归档邮件」三处窗口共同读写——每个窗口都是独立 webview，
 * 各自调 `$tauri.start()` 加载同一份落盘 JSON。写操作通过 saveOnChange 落盘后，
 * 其他窗口需重开或由 event 通知刷新（当前不跨窗口实时同步，T5 范围内可接受）。
 *
 * 状态机：unread → read（点击）→ archived（5min 后 / 24h 超时）。归档 30 天后清理。
 * **绝不向邮箱服务端写**（已读/归档全是本地状态，D5-actual）。
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D9
 */
export const useMailNotificationStore = defineStore('mailNotification', () => {
  /** 所有邮件（未读 + 已读 + 归档）。UI 通过 getters 分组展示。 */
  const notifications = ref<MailNotification[]>([])

  /** 按 `<accountId>:<uid>` 去重的 Map（upsertMail 用）。 */
  function uidKey(accountId: string, uid: number): string {
    return `${accountId}:${uid}`
  }

  /** 已存在的 uidKey → notification.id（O(1) 查重）。 */
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
   * 新邮件到达：upsert 到 notifications。
   *
   * 去重：同 `<accountId>:<uid>` 已存在则**不覆盖**（保留用户的已读/归档状态——
   * 离线补发场景下用户可能已先在列表里点过）。payload 不带 uid（Rust NewMailPayload 没有）
   * 时 uid=0，跳过去重（每次都新增）——当前调用方在 setupMailPlugin 里补 uid 后再调。
   *
   * @returns 新建/已存在的 MailNotification；新建时 status='unread'。
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
   * 标记本地已读（status: unread → read，记 readAt）。
   *
   * 已读/归档的邮件再次调用无副作用（幂等）。**不向邮箱服务端发 STORE**（D5-actual）。
   */
  function markRead(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status !== 'unread') {
      return
    }
    n.status = 'read'
    n.readAt = now
  }

  /** 手动归档（status → archived，记 archivedAt）。已归档再调无副作用。 */
  function archive(id: string, now: number = Date.now()) {
    const n = notifications.value.find(x => x.id === id)
    if (!n || n.status === 'archived') {
      return
    }
    n.status = 'archived'
    n.archivedAt = now
  }

  /** 从列表彻底移除（清理 30 天归档项用）。 */
  function purge(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  /**
   * 清空某账号的所有通知历史（删除账号时级联清理用）。
   *
   * 删除账号时调用：从本地通知历史移除该账号下所有未读/已读/归档邮件，
   * 避免「账号已删但邮件列表里还挂着孤儿项」。不影响其他账号。
   */
  function removeByAccount(accountId: string) {
    notifications.value = notifications.value.filter(n => n.accountId !== accountId)
  }

  /**
   * 留存规则 tick：扫描所有邮件，按 24h/5min/30 天时限迁移状态。
   *
   * 由 setupMailPlugin 在 main 窗口每分钟调一次（单 timer，避免每封邮件各自计时）。
   * 纯本地状态迁移，零副作用到邮箱服务端。
   *
   * @returns {changed} 是否有变化（UI 可据此刷新）。
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

    // 清理 30 天以上归档项
    const before = notifications.value.length
    notifications.value = notifications.value.filter(
      n => !(n.status === 'archived' && n.archivedAt && shouldPurgeArchived(n.archivedAt, now)),
    )
    if (notifications.value.length !== before) {
      changed = true
    }

    return { changed }
  }

  // ── UI getters（邮件列表 / 归档窗口按状态分组消费）──

  /** 邮件列表窗口展示的项：未读 + 已读（不含归档）。 */
  const activeMails = computed(() =>
    notifications.value
      .filter(n => n.status === 'unread' || n.status === 'read')
      .sort((a, b) => b.arrivedAt - a.arrivedAt),
  )

  /** 归档窗口展示的项（按归档时间倒序）。 */
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
