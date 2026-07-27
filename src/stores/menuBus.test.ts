import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'

import { useMenuBusStore } from './menuBus'

describe('useMenuBusStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registerItems 追加新菜单项到 items', () => {
    const menuBus = useMenuBusStore()

    menuBus.registerItems([
      {
        id: 'todo',
        label: () => '待办',
        action: () => {},
      },
    ])

    expect(menuBus.items).toHaveLength(1)
    expect(menuBus.items[0].id).toBe('todo')
    expect(menuBus.items[0].label()).toBe('待办')
  })

  it('registerItems 按 id 去重，后登记覆盖先登记', () => {
    const menuBus = useMenuBusStore()
    const first = vi.fn()
    const second = vi.fn()

    menuBus.registerItems([
      {
        id: 'todo',
        label: () => '旧',
        action: first,
      },
    ])

    menuBus.registerItems([
      {
        id: 'todo',
        label: () => '新',
        action: second,
      },
    ])

    expect(menuBus.items).toHaveLength(1)
    expect(menuBus.items[0].label()).toBe('新')
    expect(menuBus.items[0].action).toBe(second)
  })

  it('多次 registerItems 不同 id 累加', () => {
    const menuBus = useMenuBusStore()

    menuBus.registerItems([{ id: 'a', label: () => 'A', action: () => {} }])
    menuBus.registerItems([{ id: 'b', label: () => 'B', action: () => {} }])

    expect(menuBus.items.map(item => item.id)).toEqual(['a', 'b'])
  })

  it('覆盖同 id 时保留其他项，仅替换目标', () => {
    const menuBus = useMenuBusStore()

    menuBus.registerItems([
      { id: 'a', label: () => 'A', action: () => {} },
      { id: 'b', label: () => 'B', action: () => {} },
    ])

    menuBus.registerItems([{ id: 'a', label: () => 'A-new', action: () => {} }])

    expect(menuBus.items.map(item => item.id)).toEqual(['a', 'b'])
    expect(menuBus.items[0].label()).toBe('A-new')
    expect(menuBus.items[1].label()).toBe('B')
  })

  it('内容未变时返回稳定引用（watch 不无谓触发）', () => {
    const menuBus = useMenuBusStore()
    const spy = vi.fn()

    const item = { id: 'a', label: () => 'A', action: () => {} }

    menuBus.registerItems([item])

    watch(() => menuBus.items, spy, { deep: false })

    // 再次登记相同的同一对象——引用未变，watch 不应触发
    menuBus.registerItems([item])

    expect(spy).not.toHaveBeenCalled()
  })

  it('内容变化时引用更新（watch 触发）', async () => {
    const menuBus = useMenuBusStore()
    const spy = vi.fn()

    menuBus.registerItems([{ id: 'a', label: () => 'A', action: () => {} }])

    watch(() => menuBus.items, spy, { deep: false })

    menuBus.registerItems([{ id: 'a', label: () => 'A-updated', action: () => {} }])

    await nextTick()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(menuBus.items[0].label()).toBe('A-updated')
  })

  it('空初始状态下 items 为空数组', () => {
    const menuBus = useMenuBusStore()

    expect(menuBus.items).toEqual([])
  })
})
