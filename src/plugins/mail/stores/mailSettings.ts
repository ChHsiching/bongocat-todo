import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 邮件全局设置 store（非敏感，持久化）。
 *
 * - 持代理配置（让 IMAP 连接走 HTTP CONNECT 代理，绕开 TUN system stack
 *   对非标端口转发不稳定的问题）。
 * - 持通知设置三开关（T3）：气泡总开关 / 气泡自动消失 / 仅未读邮件提醒。
 *
 * 复用 `@tauri-store/pinia` 持久化。新增字段需注意旧数据迁移（见踩坑清单）。
 */
export const useMailSettingsStore = defineStore('mailSettings', () => {
  /**
   * HTTP CONNECT 代理地址（如 `127.0.0.1:7890`）。
   * 空串 = 不用代理，直连。
   */
  const proxy = ref('')

  /**
   * 新邮件气泡提醒总开关。
   * - true（默认）：新邮件到达时弹桌宠气泡。
   * - false：完全静默，新邮件只进本地通知历史（邮件列表可见），不弹气泡。
   */
  const bubbleEnabled = ref(true)

  /**
   * 气泡是否自动消失。
   * - false（默认）：常驻直到用户手动关闭/点击（设计稿定稿行为）。
   * - true：自动消失（未来 T7 接自动消失计时，当前仅作开关状态）。
   */
  const bubbleAutoDismiss = ref(false)

  /**
   * 仅未读邮件提醒。
   * - true：只对「本地状态=unread」的邮件弹气泡；已读邮件不弹（避免重复打扰）。
   * - false（默认）：所有新邮件都弹（按当前实现，upsertMail 新建的都是 unread，
   *   此开关实际影响未来「已读邮件被补推」等边缘场景）。
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

  return {
    proxy,
    bubbleEnabled,
    bubbleAutoDismiss,
    unreadOnly,
    setProxy,
    setBubbleEnabled,
    setBubbleAutoDismiss,
    setUnreadOnly,
  }
})
