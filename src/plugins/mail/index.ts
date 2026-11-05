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

interface SetupMailPluginArgs {
  mailAccountStore: ReturnType<typeof useMailAccountStore>
  mailNotificationStore: ReturnType<typeof useMailNotificationStore>
  mailSettingsStore: ReturnType<typeof useMailSettingsStore>
  menuBus: ReturnType<typeof useMenuBusStore>
  t: ReturnType<typeof useI18n>['t']
  windowLabel: string
}

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
  await listen<NewMailPayload>(MAIL_EVENT.NEW_MAIL, ({ payload }) => {
    const inserted = mailNotificationStore.upsertMail(payload, payload.uid)
    if (!mailSettingsStore.bubbleEnabled) {
      return
    }
    if (mailSettingsStore.unreadOnly && inserted.status !== 'unread') {
      return
    }
    emit(LISTEN_KEY.SHOW_BUBBLE, { ...payload, type: 'mail' })
  })

  await listen<ConnectionStatusPayload>(MAIL_EVENT.CONNECTION_STATUS, ({ payload }) => {
    mailAccountStore.setStatus(payload.accountId, payload.status)
  })

  await listen<LastSeenUidPayload>(MAIL_EVENT.LAST_SEEN_UID, ({ payload }) => {
    mailAccountStore.setLastSeenUid(payload.accountId, payload.lastSeenUid)
  })

  setInterval(() => {
    mailNotificationStore.tickRetention()
  }, RETENTION_TICK_MS)

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

export async function testAndSaveAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  input: { address: string, imapHost: string, imapPort: number, username: string, password: string },
  proxy: string | null,
): Promise<void> {
  await mailTestConnection(input.imapHost, input.imapPort, input.username, input.password, proxy)

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
    mailAccountStore.removeAccount(account.id)
    throw err
  }

  mailAccountStore.setStatus(account.id, 'connecting')
  try {
    await mailConnect(account.id, account.imapHost, account.imapPort, account.username, proxy, 0)
  } catch (err) {
    mailAccountStore.setStatus(account.id, 'error')
    throw err
  }
}

export async function removeAccount(
  mailAccountStore: ReturnType<typeof useMailAccountStore>,
  mailNotificationStore: ReturnType<typeof useMailNotificationStore>,
  accountId: string,
): Promise<void> {
  const account = mailAccountStore.getAccount(accountId)
  if (!account) {
    return
  }

  await mailDisconnect(accountId).catch(() => {
    // Disconnect failure does not block the deletion flow (the task may have already exited on its own)
  })
  await mailDeletePassword(accountId, account.username)
  mailNotificationStore.removeByAccount(accountId)
  mailAccountStore.removeAccount(accountId)
}

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
