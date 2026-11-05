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

interface SetupTodoPluginArgs {
  todoStore: ReturnType<typeof useTodoStore>
  deviceStore: ReturnType<typeof useDeviceStore>
  reminderStore: ReturnType<typeof useReminderStore>
  menuBus: ReturnType<typeof useMenuBusStore>
  t: ReturnType<typeof useI18n>['t']
  windowLabel: string
}

/**
 * Install the todo plugin: start persistence + idempotently generate deviceId +
 * register the "Todo" menu item with menuBus + start due reminders.
 *
 * Must be called in App.vue's onMounted, after the other stores' `$tauri.start()`:
 * - `$tauri.start()` loads the persisted JSON (todo list + deviceId), preserved across restarts.
 * - `deviceStore.init()` idempotently generates deviceId after loading (an existing value is not overwritten).
 * - `startReminder()` starts in the main window only (App.vue mounts in all windows; multiple windows would trigger duplicates).
 *
 * ⚠️ Store instantiation must be done by the caller at the top of setup (Pinia inject fails
 * across async boundaries, erroring "Must be called at the top of a setup function" code:26);
 * this function only receives already-instantiated stores.
 *
 * menuBus's items is a reactive ref; after registration useAppMenu reads the latest value
 * every time it builds the menu, so labels use `() => t(...)` lazy evaluation to respond to language switching.
 */
export async function setupTodoPlugin({ todoStore, deviceStore, reminderStore, menuBus, t, windowLabel }: SetupTodoPluginArgs) {
  await todoStore.$tauri.start()
  await deviceStore.$tauri.start()
  await reminderStore.$tauri.start()
  deviceStore.init()

  if (windowLabel === WINDOW_LABEL.MAIN) {
    await startReminder(todoStore, reminderStore, t)
  }

  // "Todo" / "Quick Add" both use dedicated events (not the generic SHOW_WINDOW) so the todo page
  // can setSize + setPosition before show, avoiding the 1-frame flicker of "show then resize".
  // Both menu items are registered in menuBus and consumed by useAppMenu.
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
