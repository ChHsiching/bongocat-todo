import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDeviceStore = defineStore('todoDevice', () => {
  const deviceId = ref('')

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
