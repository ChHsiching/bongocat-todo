import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 邮件全局设置 store（非敏感，持久化）。
 *
 * 目前只持代理配置（让 IMAP 连接走 HTTP CONNECT 代理，绕开 TUN system stack
 * 对非标端口转发不稳定的问题）。复用 `@tauri-store/pinia` 持久化。
 */
export const useMailSettingsStore = defineStore('mailSettings', () => {
  /**
   * HTTP CONNECT 代理地址（如 `127.0.0.1:7890`）。
   * 空串 = 不用代理，直连。
   */
  const proxy = ref('')

  function setProxy(value: string) {
    proxy.value = value.trim()
  }

  return {
    proxy,
    setProxy,
  }
})
