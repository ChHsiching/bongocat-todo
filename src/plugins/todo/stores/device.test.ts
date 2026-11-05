import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDeviceStore } from './device'

describe('useDeviceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('init 在空状态时生成 deviceId', () => {
    const deviceStore = useDeviceStore()

    expect(deviceStore.deviceId).toBe('')

    deviceStore.init()

    expect(deviceStore.deviceId).toBeTruthy()
    expect(typeof deviceStore.deviceId).toBe('string')
    expect(deviceStore.deviceId.length).toBeGreaterThan(0)
  })

  it('deviceId 幂等：已存在时不覆盖', () => {
    const deviceStore = useDeviceStore()

    deviceStore.init()
    const firstId = deviceStore.deviceId

    // A second init must not overwrite
    deviceStore.init()

    expect(deviceStore.deviceId).toBe(firstId)
  })

  it('多次 init 同一实例返回同一 deviceId', () => {
    const deviceStore = useDeviceStore()

    deviceStore.init()
    const id1 = deviceStore.deviceId

    deviceStore.init()
    deviceStore.init()
    const id2 = deviceStore.deviceId

    expect(id1).toBe(id2)
  })

  it('不同 store 实例生成不同 deviceId', () => {
    // A new pinia instance = fresh persistence state
    setActivePinia(createPinia())
    const store1 = useDeviceStore()
    store1.init()

    setActivePinia(createPinia())
    const store2 = useDeviceStore()
    store2.init()

    expect(store1.deviceId).not.toBe(store2.deviceId)
  })
})
