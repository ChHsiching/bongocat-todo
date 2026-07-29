import type { useI18n } from 'vue-i18n'

import { error } from '@tauri-apps/plugin-log'
import { requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

import type { useReminderStore } from './reminderStore'
import type { Todo, useTodoStore } from './todo'

/**
 * 挑出「已到期且未完成」的 todo（T4 纯函数）。
 *
 * 命中条件：`completed === false` **且** `dueDate !== undefined` **且** `dueDate <= now`。
 *
 * ⚠️ 调用方应传入 `visibleTodos`（已排除软删除项），本函数不再重复过滤 deletedAt ——
 * 职责分离：软删除可见性归 todo store 的 `visibleTodos`，到期判定归本函数。
 *
 * 纯函数：不修改入参、不读 store、不调 Tauri，便于 vitest 单测。
 *
 * @param todos 候选 todo 列表（通常传 `todoStore.visibleTodos`）
 * @param now   当前时间戳（ms），测试时可固定
 * @returns     到期未完成的 todo 子集（保持原顺序）
 */
export function findDueTodos(todos: Todo[], now: number): Todo[] {
  return todos.filter(todo => !todo.completed && todo.dueDate !== undefined && todo.dueDate <= now)
}

/** 轮询间隔（ms）。10s 轮询，最大延迟 10s（用户基本无感）。原 spec D6 写 60s，实测延迟体感差。 */
const POLL_INTERVAL_MS = 10_000

/**
 * 启动到期提醒轮询器（T4 副作用层）。
 *
 * - 先 `requestPermission()` 请求 OS 级通知权限（`notification:default` 只授予 JS→core
 *   桥接权限，OS 层仍需显式请求，否则首次 `sendNotification` 会静默失败）；
 * - 立即检查一次到期（覆盖「app 启动时已有过期 todo」）；
 * - 之后每 `POLL_INTERVAL_MS` 轮询一次；
 * - **去重（跨重启持久化）**：用 reminderStore 记录「上次以哪个 dueDate 通知过」。
 *   当 todo 的 dueDate 与记录值相等 → 跳过；不等（含无记录、用户改了 dueDate）→ 通知。
 *   持久化让「同一条过期 todo」不会每次启动都重复通知（用户改 dueDate 后仍能重新通知，
 *   满足 spec「改 dueDate 重置后应能再次通知」）。已完成 / 已删除的 todo 不会出现在
 *   `visibleTodos`，因此不会重复通知。
 *
 * 必须在 todo store + reminder store 都 `$tauri.start()` 之后调用（数据才加载）。
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
      // dueDate 在 findDueTodos 里已断言非空
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
      } catch (err) {
        // 通知失败（如权限被拒）记录日志，避免静默吞错，便于排查「无运行时权限错误」
        await error(`todo reminder sendNotification failed for ${todo.id}: ${String(err)}`)
      }
    }
  }

  void checkOnce()
  window.setInterval(() => void checkOnce(), POLL_INTERVAL_MS)
}
