import { emit } from '@tauri-apps/api/event'

import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'

import type { useMailAccountStore } from './stores/mailAccount'

import {
  mailConnect,
  mailDeletePassword,
  mailDisconnect,
  mailStorePassword,
  mailTestConnection,
} from './commands'

export type { MailAccount, MailAccountStatus } from './stores/mailAccount'
export { useMailAccountStore } from './stores/mailAccount'
export { useMailSettingsStore } from './stores/mailSettings'

/** Rust 推给前端的「新邮件」事件 payload（`mail://new-mail`）。 */
export interface NewMailPayload {
  accountId: string
  from: string
  subject: string
  arrivedAt: number
}

/** Rust 推给前端的「连接状态」事件 payload（`mail://connection-status`）。 */
export interface ConnectionStatusPayload {
  accountId: string
  status: 'connected' | 'connecting' | 'error'
  message?: string
}

/** Tauri event 名（Rust 端 emit 用的字符串，两端必须一致）。 */
export const MAIL_EVENT = {
  NEW_MAIL: 'mail://new-mail',
  CONNECTION_STATUS: 'mail://connection-status',
} as const

/** setupMailPlugin 的入参：调用方在 setup 顶层实例化好的 store + i18n t 函数。 */
interface SetupMailPluginArgs {
  mailAccountStore: ReturnType<typeof useMailAccountStore>
  mailSettingsStore: ReturnType<typeof useMailSettingsStore>
  /** 当前窗口 label（用于把全局副作用限定到 main 窗口，避免多窗口重复监听）。 */
  windowLabel: string
}

/**
 * 安装邮件插件：注册 Tauri event 监听（新邮件 → 弹气泡；连接状态 → 更新 store）。
 *
 * 必须在 App.vue 的 onMounted 里、stores `$tauri.start()` 之后调用（store 才加载已落盘数据）。
 * 监听只在 **main 窗口** 启动（App.vue 在 main/preference/todo/bubble 多窗口都挂载，
 * 否则多窗口重复监听会触发多次弹气泡）。main 是 app 生命周期所有者。
 *
 * ⚠️ store 实例化必须由调用方在 setup 顶层完成（跨 async 边界 Pinia inject 会失效，
 * 报 "Must be called at the top of a setup function" code:26），本函数只接收已实例化的 store。
 *
 * @returns 一个 unlisten 函数数组（目前未使用，预留 hot-reload 清理）；tracer bullet 阶段监听随 app 生命周期存活。
 */
export async function setupMailPlugin({ mailAccountStore, mailSettingsStore, windowLabel }: SetupMailPluginArgs) {
  if (windowLabel !== WINDOW_LABEL.MAIN) {
    return
  }

  const { listen } = await import('@tauri-apps/api/event')

  // 新邮件 → emit SHOW_BUBBLE（bubble 窗口监听此事件弹气泡 + 定位）
  listen<NewMailPayload>(MAIL_EVENT.NEW_MAIL, ({ payload }) => {
    emit(LISTEN_KEY.SHOW_BUBBLE, payload)
  })

  // 连接状态 → 更新 store（驱动账号列表 UI 的状态展示）
  listen<ConnectionStatusPayload>(MAIL_EVENT.CONNECTION_STATUS, ({ payload }) => {
    mailAccountStore.setStatus(payload.accountId, payload.status)
  })

  // app 启动后，对已持久化的账号自动重连（store 在 $tauri.start() 后已加载）
  const proxy = mailSettingsStore.proxy || null
  for (const account of mailAccountStore.accounts) {
    if (account.enabled) {
      mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy).catch(
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

  // 4. 启动 IDLE 监听
  mailAccountStore.setStatus(account.id, 'connecting')
  try {
    await mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy)
  } catch (err) {
    // 连接失败：密码已存 keyring，保留账号（用户可在列表里看到 error 状态重试）
    mailAccountStore.setStatus(account.id, 'error')
    throw err
  }
}

/** 删除账号：断开监听 → 删 keyring 密码 → 移出 store。任一步失败抛错。 */
export async function removeAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  accountId: string,
): Promise<void> {
  const account = mailAccountStore.getAccount(accountId)
  if (!account) {
    return
  }

  // 顺序：先断开（停止 task）→ 删密码（keyring）→ 移出 store
  await mailDisconnect(accountId).catch(() => {
    // 断开失败不阻塞删除流程（task 可能已自行退出）
  })
  await mailDeletePassword(accountId, account.username)
  mailAccountStore.removeAccount(accountId)
}
