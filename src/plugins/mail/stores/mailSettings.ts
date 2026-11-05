import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Mail global settings store (non-sensitive, persisted).
 *
 * - Holds the proxy config (routes IMAP connections through an HTTP CONNECT proxy to bypass
 *   the TUN system stack's unstable forwarding of non-standard ports).
 * - Holds the three notification setting toggles (T3): bubble master switch / bubble auto-dismiss / unread-only notifications.
 *
 * Reuses `@tauri-store/pinia` persistence. New fields must take legacy data migration into account (see the pitfalls list).
 */
export const useMailSettingsStore = defineStore('mailSettings', () => {
  /**
   * HTTP CONNECT proxy address (e.g. `127.0.0.1:7890`).
   * Empty string = no proxy, direct connection.
   */
  const proxy = ref('')

  /**
   * Master switch for new-mail bubble notifications.
   * - true (default): pop a desktop-pet bubble when a new mail arrives.
   * - false: fully silent; new mails only enter the local notification history (visible in the mail list), no bubble.
   */
  const bubbleEnabled = ref(true)

  /**
   * Whether the bubble auto-dismisses.
   * - false (default): stays until the user manually closes/clicks it (finalized design behavior).
   * - true: auto-dismisses (future T7 will wire the auto-dismiss timer; currently just the switch state).
   */
  const bubbleAutoDismiss = ref(false)

  /**
   * Notify only unread mails.
   * - true: only pop bubbles for mails with "local status=unread"; no bubble for already-read mails (avoids repeated disturbance).
   * - false (default): pop for all new mails (under the current implementation everything upsertMail creates is unread,
   *   so this switch effectively only affects future edge cases like "an already-read mail being re-pushed").
   */
  const unreadOnly = ref(false)

  function setProxy(value: string) {
    proxy.value = value.trim()
  }

  function setBubbleEnabled(value: boolean) {
    bubbleEnabled.value = value
  }

  function setBubbleAutoDismiss(value: boolean) {
    bubbleAutoDismiss.value = value
  }

  function setUnreadOnly(value: boolean) {
    unreadOnly.value = value
  }

  /**
   * Follow-up to issue #19: user-resized panel sizes for the two mail windows
   * (mail-list / mail-archive) (logical px, null = untouched, use the default 400×560).
   * Stored in logical px so they don't drift across monitor changes / scale changes.
   */
  const listPanelSize = ref<{ width: number, height: number } | null>(null)
  const archivePanelSize = ref<{ width: number, height: number } | null>(null)

  const setListPanelSize = (size: { width: number, height: number } | null) => {
    listPanelSize.value = size
  }

  const setArchivePanelSize = (size: { width: number, height: number } | null) => {
    archivePanelSize.value = size
  }

  return {
    proxy,
    bubbleEnabled,
    bubbleAutoDismiss,
    unreadOnly,
    listPanelSize,
    archivePanelSize,
    setListPanelSize,
    setArchivePanelSize,
    setProxy,
    setBubbleEnabled,
    setBubbleAutoDismiss,
    setUnreadOnly,
  }
})
