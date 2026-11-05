import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Account connection status (frontend-only, driven by the Rust `mail://connection-status` event). */
export type MailAccountStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * Mail account configuration (**non-sensitive**, safe to persist in plaintext).
 *
 * ⚠️ Never put passwords in this struct — they go to the OS keyring (Rust `mail_store_password` / `mail_get_password`).
 */
export interface MailAccount {
  /** Unique id (nanoid) */
  id: string
  /** Mail address (user input, e.g. alice@gmail.com) */
  address: string
  /** IMAP server host (e.g. imap.gmail.com) */
  imapHost: string
  /** IMAP port (usually 993 for IMAPS) */
  imapPort: number
  /** IMAP login username (usually = mail address) */
  username: string
  /** Provider domain (extracted from the part after `@` in the mail address, used for provider auto-detection since T3) */
  providerDomain: string
  /** Whether listening is enabled (pauses the account without deleting it) */
  enabled: boolean
  /** Connection status (frontend-only, driven by Rust events) */
  status: MailAccountStatus
  /**
   * The largest IMAP UID already pushed (persisted, used for offline catch-up).
   *
   * - 0 means not initialized yet (on first connect Rust seeds it with the current max INBOX UID, skipping existing mails).
   * - When non-zero, it becomes the catch-up baseline on reconnect: Rust `fetch_new_envelopes(lastSeenUid)`
   *   re-pushes mails that arrived while offline (UID > lastSeenUid) to the frontend. No mails are missed across app restarts.
   * - Continuously updated by the Rust `mail://last-seen-uid` event (emitted after each batch of new mails is pushed).
   *
   * @see docs/adr/0002-phase2-mail-and-bubble.md D5-actual (offline catch-up, #15 comment)
   */
  lastSeenUid: number
}

/**
 * Mail account configuration store (array structure, multi-account).
 *
 * - Persistence: reuses `@tauri-store/pinia` `saveOnChange`, same pattern as the todo store.
 *   Call `$tauri.start()` on component mount, then it is ready to use after loading.
 * - **No passwords stored here**: passwords go to the keyring (Rust commands); pinia only holds non-sensitive IMAP config.
 * - T4 (ticket #14) lifted the single-account limit and supports N accounts on simultaneous IDLE watch; the Rust `ConnectionManager`
 *   manages each connection independently by accountId (disconnecting one does not affect the others).
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D2 / D4
 */
export const useMailAccountStore = defineStore('mailAccount', () => {
  /** The list of bound accounts. */
  const accounts = ref<MailAccount[]>([])

  /** Extract the provider domain from a mail address (the part after `@`). Returns an empty string when there is no `@`. */
  function extractDomain(address: string): string {
    const at = address.lastIndexOf('@')
    return at >= 0 ? address.slice(at + 1).toLowerCase() : ''
  }

  /**
   * Append a new account to the array.
   *
   * Data layer only: builds the MailAccount and pushes it. Password storage + connection setup are done
   * by the caller after a successful push, via serial calls to `mailStorePassword` + `mailConnect`
   * (see the setupMailPlugin flow in mail/index.ts).
   * Multi-account: no count limit; each account has its own independent IDLE task on the Rust side (they do not affect each other).
   *
   * @returns The newly created MailAccount.
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

  /** Find an account by id. */
  function getAccount(id: string): MailAccount | undefined {
    return accounts.value.find(a => a.id === id)
  }

  /** Update an account's connection status (called when driven by the Rust `mail://connection-status` event). */
  function setStatus(id: string, status: MailAccountStatus) {
    const account = getAccount(id)
    if (account) {
      account.status = status
    }
  }

  /**
   * Toggle an account's enabled state (the switch in the settings page account list).
   *
   * Only changes this field; it does not directly open/close connections — the caller (settings page)
   * decides between mailConnect/mailDisconnect based on the returned new state.
   * Turning off then on again is effectively "pause listening": account config + keyring password are both kept, only the IDLE task is stopped.
   */
  function setEnabled(id: string, enabled: boolean) {
    const account = getAccount(id)
    if (account) {
      account.enabled = enabled
    }
  }

  /**
   * Update an account's lastSeenUid (called when driven by the Rust `mail://last-seen-uid` event).
   *
   * Monotonically increasing only (a new uid smaller than the stored one means stale/out-of-order data, do not regress). Persisted to disk by saveOnChange.
   * Legacy data compatibility: lastSeenUid may be undefined (accounts created before T5); write directly when it is undefined.
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
   * Data migration: backfill the lastSeenUid default value (0) for legacy accounts created before T5.
   *
   * Old persisted JSON lacks the lastSeenUid field, so after `$tauri.start()` loads it the property is undefined,
   * which means `account.lastSeenUid ?? 0` passes 0 to Rust (falling back to the old T1 behavior of skipping existing mails).
   * This method fills undefined with 0 so saveOnChange writes the field into JSON and later setLastSeenUid calls can increment normally.
   *
   * Must be called once after `$tauri.start()` and before `setupMailPlugin` calls `mailConnect`. Idempotent.
   */
  function migrateLastSeenUid() {
    for (const account of accounts.value) {
      if (account.lastSeenUid === undefined) {
        account.lastSeenUid = 0
      }
    }
  }

  /** Remove an account from the array (password cleanup + disconnect are done by the caller via Rust commands before removal). */
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
