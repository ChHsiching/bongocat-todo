import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Todo 插件的设备标识 store。
 *
 * deviceId 是 Phase 2 同步的设备标识，Phase 1 仅用于给新建的 todo 打设备戳。
 * 幂等生成：持久化加载后若已有值则不覆盖，没有则生成一个。
 *
 * 持久化复用 `@tauri-store/pinia` 的 `saveOnChange`（与 cat/general 同构），
 * 由组件在挂载时调 `$tauri.start()` 加载已落盘的值后再调 `init()`。
 */
export const useDeviceStore = defineStore('todoDevice', () => {
  const deviceId = ref('')

  /** 加载持久化数据后确保 deviceId 存在；已存在则不覆盖（幂等）。 */
  const init = () => {
    if (deviceId.value) {
      return
    }

    deviceId.value = nanoid()
  }

  return {
    deviceId,
    init,
  }
})
