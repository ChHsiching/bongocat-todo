import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Device identity store for the todo plugin.
 *
 * deviceId is the device identity for Phase 2 sync; in Phase 1 it only stamps newly
 * created todos with the device. Idempotent generation: after persisted data loads,
 * an existing value is kept; if absent, one is generated.
 *
 * Persistence reuses `@tauri-store/pinia`'s `saveOnChange` (isomorphic with cat/general);
 * the component calls `$tauri.start()` on mount to load persisted values, then calls `init()`.
 */
export const useDeviceStore = defineStore('todoDevice', () => {
  const deviceId = ref('')

  /** Ensure deviceId exists after persisted data is loaded; an existing value is not overwritten (idempotent). */
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
