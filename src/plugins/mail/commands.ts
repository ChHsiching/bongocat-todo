import { invoke } from '@tauri-apps/api/core'

/** Unified prefix for the Rust `mail_*` commands (see COMMANDS in build.rs). */
const COMMAND = {
  TEST_CONNECTION: 'plugin:mail|mail_test_connection',
  CONNECT: 'plugin:mail|mail_connect',
  DISCONNECT: 'plugin:mail|mail_disconnect',
  STORE_PASSWORD: 'plugin:mail|mail_store_password',
  DELETE_PASSWORD: 'plugin:mail|mail_delete_password',
}

/**
 * Test the IMAP connection (saves nothing; only verifies login + INBOX selection).
 *
 * The frontend "test and save" button calls this command first, then `mailStorePassword` + `mailConnect` on success.
 * On failure the Rust Err(String) is thrown as a rejection.
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

/**
 * Start an account's IDLE watch (Rust fetches the password from the keyring and spawns the task).
 *
 * `initialLastSeenUid` comes from mailAccount.lastSeenUid (persisted): when non-zero it serves as the offline catch-up baseline
 * and Rust fetches and re-pushes mails that arrived while offline (UID > lastSeenUid); when 0 it skips existing mails (T1 behavior).
 */
export function mailConnect(
  accountId: string,
  imapHost: string,
  imapPort: number,
  username: string,
  proxy: string | null,
  initialLastSeenUid: number,
): Promise<void> {
  return invoke(COMMAND.CONNECT, { accountId, imapHost, imapPort, username, proxy, initialLastSeenUid })
}

/** Stop an account's IDLE watch (cancels the task). */
export function mailDisconnect(accountId: string): Promise<void> {
  return invoke(COMMAND.DISCONNECT, { accountId })
}

/** Store the mailbox password in the keyring (key = `bongocat-todo/mail/<accountId>`, assembled on the Rust side). */
export function mailStorePassword(
  accountId: string,
  username: string,
  password: string,
): Promise<void> {
  return invoke(COMMAND.STORE_PASSWORD, { accountId, username, password })
}

/** Delete the mailbox password from the keyring (called on account deletion, idempotent). */
export function mailDeletePassword(accountId: string, username: string): Promise<void> {
  return invoke(COMMAND.DELETE_PASSWORD, { accountId, username })
}
