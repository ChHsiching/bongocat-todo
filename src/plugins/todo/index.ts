import type { useI18n } from 'vue-i18n'

import { emit } from '@tauri-apps/api/event'

import type { MenuItemDescriptor, useMenuBusStore } from '@/stores/menuBus'

import { LISTEN_KEY, WINDOW_LABEL } from '@/constants'

import type { useDeviceStore } from './stores/device'
import type { useReminderStore } from './stores/reminderStore'
import type { useTodoStore } from './stores/todo'

import { startReminder } from './stores/reminder'

export { useDeviceStore } from './stores/device'
export { useReminderStore } from './stores/reminderStore'
export { useTodoStore } from './stores/todo'
export type { Todo, TodoPriority } from './stores/todo'

/** setupTodoPlugin 的入参：调用方在 setup 顶层实例化好的 store + i18n t 函数。 */
interface SetupTodoPluginArgs {
  todoStore: ReturnType<typeof useTodoStore>
  deviceStore: ReturnType<typeof useDeviceStore>
  reminderStore: ReturnType<typeof useReminderStore>
  menuBus: ReturnType<typeof useMenuBusStore>
  t: ReturnType<typeof useI18n>['t']
  /** 当前窗口 label（用于把全局副作用限定到单一窗口，避免多窗口重复触发）。 */
  windowLabel: string
}

/**
 * 安装 todo 插件：启动持久化 + 幂等生成 deviceId + 向 menuBus 登记「待办」菜单项 + 启动到期提醒。
 *
 * 必须在 App.vue 的 onMounted 里、其他 stores `$tauri.start()` 之后调用：
 * - `$tauri.start()` 加载已落盘的 JSON（todo 列表 + deviceId），跨重启保留。
 * - `deviceStore.init()` 在加载后幂等生成 deviceId（已存在则不覆盖）。
 * - `startReminder()` 仅在主窗口启动（App.vue 在所有窗口都挂载，多窗口会重复触发）。
 *
 * ⚠️ store 实例化必须由调用方在 setup 顶层完成（跨 async 边界 Pinia inject 会失效，
 * 报 "Must be called at the top of a setup function" code:26），本函数只接收已实例化的 store。
 *
 * menuBus 的 items 是响应式 ref，登记后 useAppMenu 每次构建菜单时读取最新值，
 * 因此 label 用 `() => t(...)` 延迟求值以响应语言切换。
 */
export async function setupTodoPlugin({ todoStore, deviceStore, reminderStore, menuBus, t, windowLabel }: SetupTodoPluginArgs) {
  await todoStore.$tauri.start()
  await deviceStore.$tauri.start()
  await reminderStore.$tauri.start()
  deviceStore.init()

  // 到期提醒轮询只在主窗口启动（App.vue 在 main/preference/todo 三窗口都挂载，
  // 否则会起 3 个 timer、发 3 份通知）。主窗口是 app 生命周期所有者。
  if (windowLabel === WINDOW_LABEL.MAIN) {
    await startReminder(todoStore, reminderStore, t)
  }

  // 「待办」/「快速新建」都用专用事件（非通用 SHOW_WINDOW），让 todo 页面
  // 在 show 之前先 setSize + setPosition，避免「先 show 再 resize」的 1 帧闪烁。
  // 两菜单项共存在 menuBus，由 useAppMenu 消费。
  const todoMenuItems: MenuItemDescriptor[] = [
    {
      id: 'todo',
      label: () => t('plugins.todo.labels.menuItem'),
      icon: 'i-solar:clipboard-list-bold',
      action: () => emit(LISTEN_KEY.SHOW_TODO_FULL),
    },
    {
      id: 'todo-quick-add',
      label: () => t('plugins.todo.labels.quickAddMenuItem'),
      icon: 'i-solar:add-circle-bold',
      action: () => emit(LISTEN_KEY.SHOW_TODO_MINI),
    },
  ]

  menuBus.registerItems(todoMenuItems)
}
