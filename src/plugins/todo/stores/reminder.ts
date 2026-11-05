import type { useI18n } from 'vue-i18n'

import { emit } from '@tauri-apps/api/event'
import { error } from '@tauri-apps/plugin-log'
import { requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

import { LISTEN_KEY } from '@/constants'

import type { useReminderStore } from './reminderStore'
import type { Todo, useTodoStore } from './todo'

/**
 * Pick out todos that are "due and not completed" (T4 pure function).
 *
 * Match condition: `completed === false` **and** `dueDate !== undefined` **and** `dueDate <= now`.
 *
 * ⚠️ Callers should pass `visibleTodos` (soft-deleted items already excluded); this function
 * does not re-filter deletedAt — separation of concerns: soft-delete visibility belongs to the
 * todo store's `visibleTodos`, due detection belongs to this function.
 *
 * Pure function: does not mutate inputs, read stores, or call Tauri — easy to unit test with vitest.
 *
 * @param todos candidate todo list (usually `todoStore.visibleTodos`)
 * @param now   current timestamp (ms); can be fixed in tests
 * @returns     subset of due, uncompleted todos (original order preserved)
 */
export function findDueTodos(todos: Todo[], now: number): Todo[] {
  return todos.filter(todo => !todo.completed && todo.dueDate !== undefined && todo.dueDate <= now)
}

/** Polling interval (ms). 10s polling caps the delay at 10s (barely perceptible to users). The original spec D6 said 60s, but the delay felt bad in practice. */
const POLL_INTERVAL_MS = 10_000

/**
 * Start the due reminder poller (T4 side-effect layer).
 *
 * - First `requestPermission()` asks for OS-level notification permission (`notification:default`
 *   only grants the JS→core bridge permission; the OS layer still needs an explicit request,
 *   otherwise the first `sendNotification` silently fails);
 * - Immediately check for due todos once (covers "overdue todos already exist at app startup");
 * - Then poll every `POLL_INTERVAL_MS`;
 * - **Dedup (persisted across restarts)**: reminderStore records "the last dueDate each todo was
 *   notified at". When the todo's dueDate equals the recorded value → skip; when different
 *   (including no record, or the user changed the dueDate) → notify. Persisting means the same
 *   overdue todo does not re-notify on every startup (after the user changes the dueDate it can
 *   notify again, satisfying the spec's "changing dueDate resets and allows notifying again").
 *   Completed / deleted todos never appear in `visibleTodos`, so they never re-notify.
 *
 * Must be called after both the todo store and the reminder store have run `$tauri.start()` (only then is data loaded).
 */
export async function startReminder(
  todoStore: ReturnType<typeof useTodoStore>,
  reminderStore: ReturnType<typeof useReminderStore>,
  t: ReturnType<typeof useI18n>['t'],
): Promise<void> {
  await requestPermission()

  const checkOnce = async () => {
    const dueTodos = findDueTodos(todoStore.visibleTodos, Date.now())

    for (const todo of dueTodos) {
      // dueDate is already asserted non-null by findDueTodos
      const due = todo.dueDate as number

      if (reminderStore.isNotified(todo.id, due)) {
        continue
      }

      try {
        await sendNotification({
          title: t('plugins.todo.labels.reminderTitle'),
          body: t('plugins.todo.labels.reminderBody', { title: todo.title }),
        })
        reminderStore.markNotified(todo.id, due)
        // D8 dual dispatch: after the system notification, purely incrementally emit a desktop-pet bubble (type:'todo').
        // isNotified dedup applies to the bubble too (the same todo never pops the bubble twice).
        emit(LISTEN_KEY.SHOW_BUBBLE, { type: 'todo', id: todo.id, title: todo.title, dueDate: due })
      } catch (err) {
        // Log notification failures (e.g. permission denied) instead of silently swallowing them; helps debug "no runtime permission error" cases
        await error(`todo reminder sendNotification failed for ${todo.id}: ${String(err)}`)
      }
    }
  }

  void checkOnce()
  window.setInterval(() => void checkOnce(), POLL_INTERVAL_MS)
}
