import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Todo reminder dedup state store (T4 enhancement).
 *
 * Persists a map of "which dueDate value each todo was last notified at"
 * (`Record<todoId, dueDate>`), keeping dedup state across app restarts — so the same
 * overdue todo does not re-notify on every startup.
 *
 * Persistence reuses `@tauri-store/pinia`'s `saveOnChange` (isomorphic with the device/todo stores);
 * the caller calls `$tauri.start()` on mount to load persisted values.
 *
 * Semantics: when the todo's dueDate equals the recorded value → already notified, skip;
 * when different (including no record) → treated as a new event, notify. This naturally
 * satisfies "re-notify after the user changes the dueDate" (dueDate changed, no longer equal to the record).
 */
export const useReminderStore = defineStore('todoReminder', () => {
  const notified = ref<Record<string, number>>({})

  function isNotified(todoId: string, dueDate: number): boolean {
    return notified.value[todoId] === dueDate
  }

  function markNotified(todoId: string, dueDate: number) {
    notified.value[todoId] = dueDate
  }

  return {
    notified,
    isNotified,
    markNotified,
  }
})
