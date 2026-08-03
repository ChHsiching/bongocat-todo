import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 账号连接状态（纯本地，由 Rust 通过 `mail://connection-status` event 驱动更新）。 */
export type MailAccountStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * 邮箱账号配置（**非敏感**，可明文持久化）。
 *
 * ⚠️ 密码绝不在此结构里——走 OS keyring（Rust `mail_store_password` / `mail_get_password`）。
 */
export interface MailAccount {
  /** 唯一 id（nanoid） */
  id: string
  /** 邮箱地址（用户输入，如 alice@gmail.com） */
  address: string
  /** IMAP 服务器地址（如 imap.gmail.com） */
  imapHost: string
  /** IMAP 端口（通常 993 for IMAPS） */
  imapPort: number
  /** IMAP 登录用户名（通常 = 邮箱地址） */
  username: string
  /** 服务商域名（从邮箱地址 `@` 后段提取，T3 起 provider 自动识别用） */
  providerDomain: string
  /** 是否启用监听（不删除账号，只暂停） */
  enabled: boolean
  /** 连接状态（纯本地，由 Rust event 驱动） */
  status: MailAccountStatus
  /**
   * 已推送过的最大 IMAP UID（持久化，用于离线补发）。
   *
   * - 0 表示尚未初始化（首次连接时 Rust 用当前 INBOX 最大 UID 初始化，跳过已有邮件）。
   * - 非 0 时重连作为补发基线：Rust `fetch_new_envelopes(lastSeenUid)` 把离线期间
   *   到达的新邮件（UID > lastSeenUid）补推给前端。app 关闭再打开也不漏邮件。
   * - 由 Rust `mail://last-seen-uid` event 持续更新（每推送一批新邮件后 emit）。
   *
   * @see docs/adr/0002-phase2-mail-and-bubble.md D5-actual（离线补发，#15 comment）
   */
  lastSeenUid: number
}

/**
 * 邮件账号配置 store（数组结构，支持多账号）。
 *
 * - 持久化：复用 `@tauri-store/pinia` 的 `saveOnChange`，与 todo store 同构。
 *   组件挂载时调 `$tauri.start()` 加载后即可用。
 * - **不存密码**：密码走 keyring（Rust 命令），pinia 只持非敏感的 IMAP 配置。
 * - T4（ticket #14）放开单账号限制，支持 N 个账号同时 IDLE 监听；Rust `ConnectionManager`
 *   按 accountId 独立管理每条连接（断开一个不影响其他）。
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D2 / D4
 */
export const useMailAccountStore = defineStore('mailAccount', () => {
  /** 已绑定的账号列表。 */
  const accounts = ref<MailAccount[]>([])

  /** 从邮箱地址提取服务商域名（`@` 后段）。无 `@` 时返回空串。 */
  function extractDomain(address: string): string {
    const at = address.lastIndexOf('@')
    return at >= 0 ? address.slice(at + 1).toLowerCase() : ''
  }

  /**
   * 新增账号到数组。
   *
   * 只负责数据层：构造 MailAccount 并 push。密码存储 + 建立连接由调用方在 push 成功后
   * 串行调 `mailStorePassword` + `mailConnect`（见 mail/index.ts 的 setupMailPlugin 流程）。
   * 多账号：不做数量限制，每个账号在 Rust 端有独立的 IDLE task（互不影响）。
   *
   * @returns 新建的 MailAccount。
   */
  function addAccount(input: {
    address: string
    imapHost: string
    imapPort: number
    username: string
  }): MailAccount {
    const account: MailAccount = {
      id: nanoid(),
      address: input.address.trim(),
      imapHost: input.imapHost.trim(),
      imapPort: input.imapPort,
      username: input.username.trim(),
      providerDomain: extractDomain(input.address),
      enabled: true,
      status: 'idle',
      lastSeenUid: 0,
    }

    accounts.value.push(account)
    return account
  }

  /** 按 id 查账号。 */
  function getAccount(id: string): MailAccount | undefined {
    return accounts.value.find(a => a.id === id)
  }

  /** 更新某账号的连接状态（由 Rust `mail://connection-status` event 驱动调用）。 */
  function setStatus(id: string, status: MailAccountStatus) {
    const account = getAccount(id)
    if (account) {
      account.status = status
    }
  }

  /**
   * 切换某账号的启用状态（设置页账号列表的开关）。
   *
   * 只改本字段，不直接建/断连接——调用方（设置页）按返回的新状态决定 mailConnect/mailDisconnect。
   * 关闭后再开相当于「暂停监听」：账号配置 + keyring 密码都保留，仅停止 IDLE task。
   */
  function setEnabled(id: string, enabled: boolean) {
    const account = getAccount(id)
    if (account) {
      account.enabled = enabled
    }
  }

  /**
   * 更新某账号的 lastSeenUid（由 Rust `mail://last-seen-uid` event 驱动调用）。
   *
   * 只单调递增（新 uid 比已存的小说明是旧数据/乱序，不回退）。持久化由 saveOnChange 落盘。
   * 兼容旧数据：lastSeenUid 可能是 undefined（T5 前创建的账号），当 undefined 时直接写入。
   */
  function setLastSeenUid(id: string, uid: number) {
    const account = getAccount(id)
    if (!account) {
      return
    }
    const current = account.lastSeenUid ?? 0
    if (uid > current) {
      account.lastSeenUid = uid
    }
  }

  /**
   * 数据迁移：给 T5 前创建的旧账号补 lastSeenUid 默认值（0）。
   *
   * 旧持久化 JSON 没有 lastSeenUid 字段，`$tauri.start()` 加载后该属性是 undefined，
   * 导致 `account.lastSeenUid ?? 0` 传给 Rust 的是 0（走 T1 旧行为跳过已有邮件）。
   * 本方法把 undefined 补成 0，让 saveOnChange 把字段写入 JSON，后续 setLastSeenUid 能正常递增。
   *
   * 必须在 `$tauri.start()` 之后、`setupMailPlugin` 调用 `mailConnect` 之前调一次。幂等。
   */
  function migrateLastSeenUid() {
    for (const account of accounts.value) {
      if (account.lastSeenUid === undefined) {
        account.lastSeenUid = 0
      }
    }
  }

  /** 从数组移除账号（密码清理 + 断开连接由调用方在移除前调 Rust 命令完成）。 */
  function removeAccount(id: string) {
    accounts.value = accounts.value.filter(a => a.id !== id)
  }

  return {
    accounts,
    addAccount,
    getAccount,
    setStatus,
    setEnabled,
    setLastSeenUid,
    migrateLastSeenUid,
    removeAccount,
  }
})
