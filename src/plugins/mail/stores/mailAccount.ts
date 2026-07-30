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
}

/**
 * 邮件账号配置 store（数组结构，从一开始支持多账号）。
 *
 * - 持久化：复用 `@tauri-store/pinia` 的 `saveOnChange`，与 todo store 同构。
 *   组件挂载时调 `$tauri.start()` 加载后即可用。
 * - **不存密码**：密码走 keyring（Rust 命令），pinia 只持非敏感的 IMAP 配置。
 * - 单账号阶段（T1/T4 前）：`addAccount` 限制 `accounts` 长度为 1，第二个直接拒绝。
 *   多账号阶段（T4）放开限制即可，不返工数据模型。
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D2 / D4
 */
export const useMailAccountStore = defineStore('mailAccount', () => {
  /** 已绑定的账号列表（单账号阶段长度 ≤ 1）。 */
  const accounts = ref<MailAccount[]>([])

  /** 从邮箱地址提取服务商域名（`@` 后段）。无 `@` 时返回空串。 */
  function extractDomain(address: string): string {
    const at = address.lastIndexOf('@')
    return at >= 0 ? address.slice(at + 1).toLowerCase() : ''
  }

  /**
   * 新增账号到数组（单账号阶段限制长度 1）。
   *
   * 只负责数据层：构造 MailAccount 并 push。密码存储 + 建立连接由调用方在 push 成功后
   * 串行调 `mailStorePassword` + `mailConnect`（见 mail/index.ts 的 setupMailPlugin 流程）。
   *
   * @returns 新建的 MailAccount；已达单账号上限时抛错（调用方 catch 显示给用户）。
   */
  function addAccount(input: {
    address: string
    imapHost: string
    imapPort: number
    username: string
  }): MailAccount {
    if (accounts.value.length >= MAX_ACCOUNTS) {
      throw new Error(`已达单账号上限（${MAX_ACCOUNTS}），多账号支持即将推出`)
    }

    const account: MailAccount = {
      id: nanoid(),
      address: input.address.trim(),
      imapHost: input.imapHost.trim(),
      imapPort: input.imapPort,
      username: input.username.trim(),
      providerDomain: extractDomain(input.address),
      enabled: true,
      status: 'idle',
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

  /** 从数组移除账号（密码清理 + 断开连接由调用方在移除前调 Rust 命令完成）。 */
  function removeAccount(id: string) {
    accounts.value = accounts.value.filter(a => a.id !== id)
  }

  return {
    accounts,
    addAccount,
    getAccount,
    setStatus,
    removeAccount,
  }
})

/** 单账号阶段允许的最大账号数（多账号阶段 T4 放开后调大或移除判断）。 */
export const MAX_ACCOUNTS = 1
