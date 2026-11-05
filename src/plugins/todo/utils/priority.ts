import type { TodoPriority } from '@/plugins/todo'

/**
 * Three-level priority order (low → medium → high), used for click-to-cycle switching.
 * Exported so PriorityPicker rendering the three levels and TodoItem's cycling share the same order.
 */
export const PRIORITIES: TodoPriority[] = ['low', 'medium', 'high']

/** Index of the priority in PRIORITIES (0/1/2). */
export function priorityIndex(p: TodoPriority): number {
  return PRIORITIES.indexOf(p)
}

/**
 * Click to cycle the priority: low → medium → high → low.
 * Used on TodoItem when clicking an existing todo's ink dot to change its priority.
 */
export function nextPriority(current: TodoPriority): TodoPriority {
  return PRIORITIES[(priorityIndex(current) + 1) % PRIORITIES.length]!
}
