import type { useI18n } from 'vue-i18n'

import { emit } from '@tauri-apps/api/event'

import type { MenuItemDescriptor, useMenuBusStore } from '@/stores/menuBus'

import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'

import type { useMailAccountStore } from './stores/mailAccount'
import type { useMailNotificationStore } from './stores/mailNotification'
import type { useMailSettingsStore } from './stores/mailSettings'

import {
  mailConnect,
  mailDeletePassword,
  mailDisconnect,
  mailStorePassword,
  mailTestConnection,
} from './commands'

export type { MailAccount, MailAccountStatus } from './stores/mailAccount'
export { useMailAccountStore } from './stores/mailAccount'
export { useMailNotificationStore } from './stores/mailNotification'
export type { MailNotification, MailNotificationStatus } from './stores/mailNotification'
export { useMailSettingsStore } from './stores/mailSettings'

/** Rust 推给前端的「新邮件」事件 payload（`mail://new-mail`）。 */
export interface NewMailPayload {
  accountId: string
  /** 邮箱 UID（离线补发去重用，`<accountId>:<uid>` 唯一）。 */
  uid: number
  from: string
  subject: string
  arrivedAt: number
}

/**
 * 桌宠气泡 payload（`show-bubble` event）。判别联合：邮件气泡复用 NewMailPayload 字段，
 * todo 气泡（T6）只带标题 + 到期时间戳。bubble 窗口按 `type` 字面量分支渲染。
 *
 * 邮件 emit 时把 NewMailPayload 与 `{ type: 'mail' }` 交叉，得到带 type 字面量的变体；
 * todo emit 直接构造 `{ type: 'todo', ... }`。
 */
export type BubblePayload = (NewMailPayload & { type: 'mail' }) | { type: 'todo', id: string, title: string, dueDate: number }

/** Rust 推给前端的「连接状态」事件 payload（`mail://connection-status`）。 */
export interface ConnectionStatusPayload {
  accountId: string
  status: 'connected' | 'connecting' | 'error'
  message?: string
}

/** Rust 推给前端的「最新已见 UID」事件 payload（`mail://last-seen-uid`）。 */
export interface LastSeenUidPayload {
  accountId: string
  lastSeenUid: number
}

/** Tauri event 名（Rust 端 emit 用的字符串，两端必须一致）。 */
export const MAIL_EVENT = {
  NEW_MAIL: 'mail://new-mail',
  CONNECTION_STATUS: 'mail://connection-status',
  LAST_SEEN_UID: 'mail://last-seen-uid',
} as const

/** setupMailPlugin 的入参：调用方在 setup 顶层实例化好的 store + i18n t 函数。 */
interface SetupMailPluginArgs {
  mailAccountStore: ReturnType<typeof useMailAccountStore>
  mailNotificationStore: ReturnType<typeof useMailNotificationStore>
  mailSettingsStore: ReturnType<typeof useMailSettingsStore>
  menuBus: ReturnType<typeof useMenuBusStore>
  t: ReturnType<typeof useI18n>['t']
  /** 当前窗口 label（用于把全局副作用限定到 main 窗口，避免多窗口重复监听）。 */
  windowLabel: string
}

/** 留存规则 tick 间隔（1 分钟扫描一次 24h/5min 超时归档 + 30 天清理）。 */
const RETENTION_TICK_MS = 60 * 1000

/**
 * 安装邮件插件：注册 Tauri event 监听（新邮件 → 入历史 + 弹气泡；连接状态 → 更新 store；
 * last-seen-uid → 持久化补发基线）+ 启动留存规则 tick。
 *
 * 必须在 App.vue 的 onMounted 里、stores `$tauri.start()` 之后调用（store 才加载已落盘数据）。
 * 监听只在 **main 窗口** 启动（App.vue 在 main/preference/todo/bubble 多窗口都挂载，
 * 否则多窗口重复监听会触发多次弹气泡 + 多份留存 timer）。main 是 app 生命周期所有者。
 *
 * 新邮件到达时同时：①upsert 到 mailNotification store（进历史列表）；②emit SHOW_BUBBLE
 * 给 bubble 窗口弹气泡。两步独立（bubble 窗口是独立 webview，读不到 main 的 store 变更）。
 *
 * ⚠️ store 实例化必须由调用方在 setup 顶层完成（跨 async 边界 Pinia inject 会失效，
 * 报 "Must be called at the top of a setup function" code:26），本函数只接收已实例化的 store。
 */
export async function setupMailPlugin({ mailAccountStore, mailNotificationStore, mailSettingsStore, menuBus, t, windowLabel }: SetupMailPluginArgs) {
  if (windowLabel !== WINDOW_LABEL.MAIN) {
    return
  }

  const { listen } = await import('@tauri-apps/api/event')

  // ⚠️ 必须先 await 所有 listen 注册完成，再发起 mailConnect。
  // 原因：离线补发的 fetch 在 Rust 连接建立后立即执行并 emit mail://new-mail，
  // 如果前端 listen 还没注册（listen 返回 Promise 但没 await），补发的邮件会被丢弃。
  // 新邮件 → ①upsert 到 mailNotification store（本地历史）②emit SHOW_BUBBLE（弹气泡，受设置开关控制）
  await listen<NewMailPayload>(MAIL_EVENT.NEW_MAIL, ({ payload }) => {
    const inserted = mailNotificationStore.upsertMail(payload, payload.uid)
    // 气泡总开关关闭 → 不弹气泡（邮件仍进本地历史，邮件列表可见）
    // unreadOnly 开启 + 该邮件已非 unread（补推时已存在的旧项）→ 不弹
    if (!mailSettingsStore.bubbleEnabled) {
      return
    }
    if (mailSettingsStore.unreadOnly && inserted.status !== 'unread') {
      return
    }
    emit(LISTEN_KEY.SHOW_BUBBLE, { ...payload, type: 'mail' })
  })

  // 连接状态 → 更新 store（驱动账号列表 UI 的状态展示）
  await listen<ConnectionStatusPayload>(MAIL_EVENT.CONNECTION_STATUS, ({ payload }) => {
    mailAccountStore.setStatus(payload.accountId, payload.status)
  })

  // last-seen-uid → 持久化到 mailAccount.lastSeenUid（离线补发基线，下次启动用）
  await listen<LastSeenUidPayload>(MAIL_EVENT.LAST_SEEN_UID, ({ payload }) => {
    mailAccountStore.setLastSeenUid(payload.accountId, payload.lastSeenUid)
  })

  // 留存规则 tick：每分钟扫描，迁移超时的未读/已读到归档 + 清理 30 天归档项
  setInterval(() => {
    mailNotificationStore.tickRetention()
  }, RETENTION_TICK_MS)

  // 向 menuBus 登记「邮件列表」+「归档邮件」两个右键菜单项（D9）。
  // action emit 专用事件，让 mail-list / mail-archive 页面在 show 前先定位 + setSize。
  const mailMenuItems: MenuItemDescriptor[] = [
    {
      id: 'mail-list',
      label: () => t('plugins.mail.labels.mailListMenu'),
      icon: 'i-solar:letter-unread-bold',
      action: () => emit(LISTEN_KEY.SHOW_MAIL_LIST),
    },
    {
      id: 'mail-archive',
      label: () => t('plugins.mail.labels.mailArchiveMenu'),
      icon: 'i-solar:archive-minimalistic-bold',
      action: () => emit(LISTEN_KEY.SHOW_MAIL_ARCHIVE),
    },
  ]
  menuBus.registerItems(mailMenuItems)

  // app 启动后，对已持久化的账号自动重连（store 在 $tauri.start() 后已加载）。
  // 先迁移旧账号数据（补 lastSeenUid 默认值），再传入持久化的 lastSeenUid 作为离线补发基线。
  mailAccountStore.migrateLastSeenUid()
  const proxy = mailSettingsStore.proxy || null
  for (const account of mailAccountStore.accounts) {
    if (account.enabled) {
      mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy, account.lastSeenUid ?? 0).catch(
        () => {
          // 连接失败已由 connection-status event 更新 status='error'，这里不重复处理
        },
      )
    }
  }
}

/** 「测试并保存」流程：先验证连通 → 存 keyring → 加 store → 启动监听。任一步失败抛错。 */
export async function testAndSaveAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  input: { address: string, imapHost: string, imapPort: number, username: string, password: string },
  proxy: string | null,
): Promise<void> {
  // 1. 测试连通（不保存任何东西）
  await mailTestConnection(input.imapHost, input.imapPort, input.username, input.password, proxy)

  // 2. 加到 store（生成 id；单账号阶段限制长度 1，超限抛错）
  const account = mailAccountStore.addAccount({
    address: input.address,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    username: input.username,
  })

  // 3. 存密码到 keyring（密码不进 store）
  try {
    await mailStorePassword(account.id, account.username, input.password)
  } catch (err) {
    // 密码存储失败，回滚刚加的 store 项
    mailAccountStore.removeAccount(account.id)
    throw err
  }

  // 4. 启动 IDLE 监听（新账号 lastSeenUid=0，Rust 用当前 INBOX 最大 UID 初始化基线）
  mailAccountStore.setStatus(account.id, 'connecting')
  try {
    await mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy, 0)
  } catch (err) {
    // 连接失败：密码已存 keyring，保留账号（用户可在列表里看到 error 状态重试）
    mailAccountStore.setStatus(account.id, 'error')
    throw err
  }
}

/**
 * 删除账号：断开监听 → 删 keyring 密码 → 清通知历史 → 移出 store。任一步失败抛错。
 *
 * 级联清理：① keyring 密码（`mail_delete_password`）；② mailNotification 该账号的
 * 所有通知历史（未读/已读/归档），避免账号删除后邮件列表里挂孤儿项。
 */
export async function removeAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  mailNotificationStore: ReturnType<typeof useMailNotificationStore>,
  accountId: string,
): Promise<void> {
  const account = mailAccountStore.getAccount(accountId)
  if (!account) {
    return
  }

  // 顺序：先断开（停止 task）→ 删密码（keyring）→ 清通知历史 → 移出 store
  await mailDisconnect(accountId).catch(() => {
    // 断开失败不阻塞删除流程（task 可能已自行退出）
  })
  await mailDeletePassword(accountId, account.username)
  mailNotificationStore.removeByAccount(accountId)
  mailAccountStore.removeAccount(accountId)
}

/**
 * 切换账号启用状态并建/断连接（设置页账号列表的开关）。
 *
 * - 开 → 连：从 keyring 取密码由 Rust 端处理，前端只传连接参数 + lastSeenUid 补发基线。
 * - 关 → 断：停 IDLE task。账号配置 + keyring 密码都保留（再开即恢复）。
 *
 * store 的 enabled 字段由本函数同步更新，调用方无需另 setEnabled。
 */
export async function toggleAccountEnabled(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  accountId: string,
  enabled: boolean,
  proxy: string | null,
): Promise<void> {
  const account = mailAccountStore.getAccount(accountId)
  if (!account) {
    return
  }
  mailAccountStore.setEnabled(accountId, enabled)
  if (enabled) {
    mailAccountStore.setStatus(accountId, 'connecting')
    try {
      await mailConnect(accountId, account.imapHost, account.imapPort, account.username, proxy, account.lastSeenUid ?? 0)
    } catch (err) {
      mailAccountStore.setStatus(accountId, 'error')
      throw err
    }
  } else {
    await mailDisconnect(accountId).catch(() => {
      // 断开失败不阻塞（task 可能已自行退出）
    })
    mailAccountStore.setStatus(accountId, 'idle')
  }
}
