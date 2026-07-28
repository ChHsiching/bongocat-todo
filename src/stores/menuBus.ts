import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 菜单项描述数据，插件向 menuBus 登记，useAppMenu / useTray / 轮盘等消费。 */
export interface MenuItemDescriptor {
  /** 点击后的行为 */
  action: () => void
  /** 唯一 id，用于去重 */
  id: string
  /** 菜单显示文本，延迟求值以响应语言切换 */
  label: () => string
  /** 可选图标，用于 Phase 2 轮盘菜单 */
  icon?: string
}

/**
 * 菜单总线（D1）——插件向 UI 挂菜单的唯一通道。
 *
 * 设计：
 * - 插件启动时调 `registerItems([...])` 登记自己的菜单项描述数据。
 * - `items` 是响应式 ref，按 id 去重（后登记覆盖先登记）。
 * - 消费者（useAppMenu）每次构建菜单时读取最新值，因此 label 用 `() => t(...)`
 *   延迟求值以响应语言切换。
 *
 * @see docs/adr/0001-plugin-architecture-for-todo.md D1
 */
export const useMenuBusStore = defineStore('menuBus', () => {
  const items = ref<MenuItemDescriptor[]>([])

  /**
   * 登记菜单项。同一 id 的项会被覆盖（后登记胜出）。
   * 内容未变时不替换数组引用（稳定引用），让依赖 items 的 watch/computed 不无谓触发。
   */
  const registerItems = (newItems: MenuItemDescriptor[]) => {
    const map = new Map<string, MenuItemDescriptor>()

    for (const item of items.value) {
      map.set(item.id, item)
    }

    for (const item of newItems) {
      map.set(item.id, item)
    }

    const next = Array.from(map.values())

    if (isSameList(items.value, next)) {
      return
    }

    items.value = next
  }

  return {
    items,
    registerItems,
  }
})

function isSameList(a: MenuItemDescriptor[], b: MenuItemDescriptor[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }

  return true
}
