import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Todo 提醒去重状态 store（T4 增强）。
 *
 * 持久化「该 todo 以哪个 dueDate 值通知过」的映射（`Record<todoId, dueDate>`），
 * 让去重状态跨 app 重启保留——避免同一条过期 todo 每次启动都重复通知。
 *
 * 持久化复用 `@tauri-store/pinia` 的 `saveOnChange`（与 device/todo store 同构），
 * 由调用方在挂载时调 `$tauri.start()` 加载已落盘的值。
 *
 * 语义：当 todo 的 dueDate 与记录值相等 → 已通知过，跳过；不等（含无记录）→ 视为新事件，通知。
 * 这天然满足「用户改 dueDate 后重新通知」（dueDate 变了，记录值不再相等）。
 */
export const useReminderStore = defineStore('todoReminder', () => {
  /** 记录「该 todo id 上次以哪个 dueDate 值通知过」；未记录的 id 视为未通知。 */
  const notified = ref<Record<string, number>>({})

  /** 查询某 todo 是否已以当前 dueDate 通知过。 */
  function isNotified(todoId: string, dueDate: number): boolean {
    return notified.value[todoId] === dueDate
  }

  /** 标记某 todo 已以某 dueDate 通知过（写入会触发 saveOnChange 落盘）。 */
  function markNotified(todoId: string, dueDate: number) {
    notified.value[todoId] = dueDate
  }

  return {
    notified,
    isNotified,
    markNotified,
  }
})
