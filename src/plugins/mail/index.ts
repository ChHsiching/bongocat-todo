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

/** Payload of the "new mail" event Rust pushes to the frontend (`mail://new-mail`). */
export interface NewMailPayload {
  accountId: string
  /** Mail UID (used for offline catch-up dedup, unique per `<accountId>:<uid>`). */
  uid: number
  from: string
  subject: string
  arrivedAt: number
}

/**
 * Desktop-pet bubble payload (`show-bubble` event). Discriminated union: mail bubbles reuse the NewMailPayload fields,
 * while todo bubbles (T6) carry only a title + due timestamp. The bubble window branches rendering on the `type` literal.
 *
 * Mail emits intersect NewMailPayload with `{ type: 'mail' }` to get the variant carrying the type literal;
 * todo emits construct `{ type: 'todo', ... }` directly.
 */
export type BubblePayload = (NewMailPayload & { type: 'mail' }) | { type: 'todo', id: string, title: string, dueDate: number }

/** Payload of the "connection status" event Rust pushes to the frontend (`mail://connection-status`). */
export interface ConnectionStatusPayload {
  accountId: string
  status: 'connected' | 'connecting' | 'error'
  message?: string
}

/** Payload of the "latest seen UID" event Rust pushes to the frontend (`mail://last-seen-uid`). */
export interface LastSeenUidPayload {
  accountId: string
  lastSeenUid: number
}

/** Tauri event names (strings the Rust side emits; both ends must stay in sync). */
export const MAIL_EVENT = {
  NEW_MAIL: 'mail://new-mail',
  CONNECTION_STATUS: 'mail://connection-status',
  LAST_SEEN_UID: 'mail://last-seen-uid',
} as const

/** setupMailPlugin args: stores + the i18n t function instantiated by the caller at the top of setup. */
interface SetupMailPluginArgs {
  mailAccountStore: ReturnType<typeof useMailAccountStore>
  mailNotificationStore: ReturnType<typeof useMailNotificationStore>
  mailSettingsStore: ReturnType<typeof useMailSettingsStore>
  menuBus: ReturnType<typeof useMenuBusStore>
  t: ReturnType<typeof useI18n>['t']
  /** Current window label (used to scope global side effects to the main window, avoiding duplicate listeners across windows). */
  windowLabel: string
}

/** Retention rule tick interval (scan once per minute for 24h/5min timeout archiving + 30-day purge). */
const RETENTION_TICK_MS = 60 * 1000

/**
 * Install the mail plugin: register Tauri event listeners (new mail → add to history + pop a bubble; connection status → update store;
 * last-seen-uid → persist the catch-up baseline) + start the retention rule tick.
 *
 * Must be called in App.vue's onMounted, after stores' `$tauri.start()` (so stores have loaded persisted data).
 * Listeners start only in the **main window** (App.vue mounts in all of main/preference/todo/bubble windows;
 * otherwise duplicate listeners across windows would pop bubbles multiple times + run multiple retention timers).
 * The main window owns the app lifecycle.
 *
 * On new mail arrival, do both: ① upsert into the mailNotification store (enter the history list); ② emit SHOW_BUBBLE
 * to the bubble window to pop a bubble. The two steps are independent (the bubble window is a separate webview and cannot read the main store's changes).
 *
 * ⚠️ Store instantiation must be done by the caller at the top of setup (Pinia inject fails across async boundaries,
 * throwing "Must be called at the top of a setup function" code:26); this function only receives already-instantiated stores.
 */
export async function setupMailPlugin({ mailAccountStore, mailNotificationStore, mailSettingsStore, menuBus, t, windowLabel }: SetupMailPluginArgs) {
  if (windowLabel !== WINDOW_LABEL.MAIN) {
    return
  }

  const { listen } = await import('@tauri-apps/api/event')

  // ⚠️ All listen registrations must be awaited before issuing mailConnect.
  // Reason: the offline catch-up fetch runs immediately after the Rust connection is established and emits mail://new-mail;
  // if the frontend listen is not yet registered (listen returns a Promise that wasn't awaited), the caught-up mails get dropped.
  // New mail → ① upsert into the mailNotification store (local history) ② emit SHOW_BUBBLE (pop a bubble, controlled by the settings toggles)
  await listen<NewMailPayload>(MAIL_EVENT.NEW_MAIL, ({ payload }) => {
    const inserted = mailNotificationStore.upsertMail(payload, payload.uid)
    // Bubble master switch off → no bubble (the mail still enters local history, visible in the mail list)
    // unreadOnly on + the mail is no longer unread (an existing stale item being re-pushed) → no bubble
    if (!mailSettingsStore.bubbleEnabled) {
      return
    }
    if (mailSettingsStore.unreadOnly && inserted.status !== 'unread') {
      return
    }
    emit(LISTEN_KEY.SHOW_BUBBLE, { ...payload, type: 'mail' })
  })

  // Connection status → update the store (drives the status display in the account list UI)
  await listen<ConnectionStatusPayload>(MAIL_EVENT.CONNECTION_STATUS, ({ payload }) => {
    mailAccountStore.setStatus(payload.accountId, payload.status)
  })

  // last-seen-uid → persist into mailAccount.lastSeenUid (the offline catch-up baseline, used on next startup)
  await listen<LastSeenUidPayload>(MAIL_EVENT.LAST_SEEN_UID, ({ payload }) => {
    mailAccountStore.setLastSeenUid(payload.accountId, payload.lastSeenUid)
  })

  // Retention rule tick: scan every minute, transition timed-out unread/read mails to archived + purge 30-day-old archived items
  setInterval(() => {
    mailNotificationStore.tickRetention()
  }, RETENTION_TICK_MS)

  // Register the two context-menu items "mail list" + "archived mail" with menuBus (D9).
  // The actions emit dedicated events so the mail-list / mail-archive pages can position + setSize before show.
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

  // After app startup, auto-reconnect persisted accounts (the store is loaded after $tauri.start()).
  // First migrate legacy account data (backfill the lastSeenUid default), then pass the persisted lastSeenUid as the offline catch-up baseline.
  mailAccountStore.migrateLastSeenUid()
  const proxy = mailSettingsStore.proxy || null
  for (const account of mailAccountStore.accounts) {
    if (account.enabled) {
      mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy, account.lastSeenUid ?? 0).catch(
        () => {
          // Connection failure already set status='error' via the connection-status event; not handled again here
        },
      )
    }
  }
}

/** "Test and save" flow: verify connectivity first → store to keyring → add to store → start watching. Throws on any failure. */
export async function testAndSaveAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  input: { address: string, imapHost: string, imapPort: number, username: string, password: string },
  proxy: string | null,
): Promise<void> {
  // 1. Test connectivity (nothing is saved)
  await mailTestConnection(input.imapHost, input.imapPort, input.username, input.password, proxy)

  // 2. Add to the store (generates the id; during the single-account phase the length was capped at 1, over the cap it threw)
  const account = mailAccountStore.addAccount({
    address: input.address,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    username: input.username,
  })

  // 3. Store the password in the keyring (passwords never enter the store)
  try {
    await mailStorePassword(account.id, account.username, input.password)
  } catch (err) {
    // Password storage failed, roll back the store item just added
    mailAccountStore.removeAccount(account.id)
    throw err
  }

  // 4. Start the IDLE watch (a new account's lastSeenUid=0; Rust seeds the baseline with the current max INBOX UID)
  mailAccountStore.setStatus(account.id, 'connecting')
  try {
    await mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy, 0)
  } catch (err) {
    // Connection failed: the password is already in the keyring, keep the account (the user can see the error state in the list and retry)
    mailAccountStore.setStatus(account.id, 'error')
    throw err
  }
}

/**
 * Delete an account: stop watching → delete keyring password → clear notification history → remove from store. Throws on any failure.
 *
 * Cascade cleanup: ① keyring password (`mail_delete_password`); ② all of that account's
 * notification history in mailNotification (unread/read/archived), avoiding orphan items hanging in the mail list after account deletion.
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

  // Order: disconnect first (stop the task) → delete the password (keyring) → clear notification history → remove from store
  await mailDisconnect(accountId).catch(() => {
    // Disconnect failure does not block the deletion flow (the task may have already exited on its own)
  })
  await mailDeletePassword(accountId, account.username)
  mailNotificationStore.removeByAccount(accountId)
  mailAccountStore.removeAccount(accountId)
}

/**
 * Toggle an account's enabled state and open/close the connection (the switch in the settings page account list).
 *
 * - On → connect: fetching the password from the keyring is handled on the Rust side; the frontend only passes connection params + the lastSeenUid catch-up baseline.
 * - Off → disconnect: stop the IDLE task. Account config + keyring password are both kept (turning it back on resumes).
 *
 * The store's enabled field is updated by this function; the caller does not need a separate setEnabled.
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
      // Disconnect failure does not block (the task may have already exited on its own)
    })
    mailAccountStore.setStatus(accountId, 'idle')
  }
}
