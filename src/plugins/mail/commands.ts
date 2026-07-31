import { invoke } from '@tauri-apps/api/core'

/** Rust `mail_*` 命令的统一前缀（见 build.rs 的 COMMANDS）。 */
const COMMAND = {
  TEST_CONNECTION: 'plugin:mail|mail_test_connection',
  CONNECT: 'plugin:mail|mail_connect',
  DISCONNECT: 'plugin:mail|mail_disconnect',
  STORE_PASSWORD: 'plugin:mail|mail_store_password',
  DELETE_PASSWORD: 'plugin:mail|mail_delete_password',
}

/**
 * 测试 IMAP 连接（不保存任何东西，仅验证能登录 + 选 INBOX）。
 *
 * 前端「测试并保存」按钮先调本命令，成功后才调 `mailStorePassword` + `mailConnect`。
 * 失败时 Rust 返回的 Err(String) 会作为 reject 抛出。
 */
export function mailTestConnection(
  imapHost: string,
  imapPort: number,
  username: string,
  password: string,
  proxy: string | null,
): Promise<void> {
  return invoke(COMMAND.TEST_CONNECTION, { imapHost, imapPort, username, password, proxy })
}

/** 启动某账号的 IDLE 监听（Rust 从 keyring 取密码，spawn task）。 */
export function mailConnect(
  accountId: string,
  imapHost: string,
  imapPort: number,
  username: string,
  proxy: string | null,
): Promise<void> {
  return invoke(COMMAND.CONNECT, { accountId, imapHost, imapPort, username, proxy })
}

/** 断开某账号的 IDLE 监听（取消 task）。 */
export function mailDisconnect(accountId: string): Promise<void> {
  return invoke(COMMAND.DISCONNECT, { accountId })
}

/** 存邮箱密码到 keyring（key = `bongocat-todo/mail/<accountId>`，Rust 端拼接）。 */
export function mailStorePassword(
  accountId: string,
  username: string,
  password: string,
): Promise<void> {
  return invoke(COMMAND.STORE_PASSWORD, { accountId, username, password })
}

/** 从 keyring 删邮箱密码（删除账号时调用，幂等）。 */
export function mailDeletePassword(accountId: string, username: string): Promise<void> {
  return invoke(COMMAND.DELETE_PASSWORD, { accountId, username })
}
