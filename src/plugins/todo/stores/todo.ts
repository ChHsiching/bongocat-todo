import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  /** Unique id (nanoid) */
  id: string
  /** Title, user input */
  title: string
  /** Whether completed */
  completed: boolean
  /** Priority (low/medium/high); optional at creation entry points since T6, defaults to medium */
  priority: TodoPriority
  /** Optional due date (timestamp ms); optional at creation entry points since T6 */
  dueDate?: number
  // ── Phase 2 sync reserved fields (auto-assigned by CRUD, not exposed in UI) ──
  /** Creation time (ms), auto-assigned on create */
  createdAt: number
  /** Last update time (ms), refreshed on create/update/delete */
  updatedAt: number
  /** Device id that created this todo (from useDeviceStore), auto-assigned on create */
  deviceId: string
  /** Soft-delete time (ms), auto-assigned on delete; undefined means not deleted */
  deletedAt?: number
}

/**
 * Main store of the todo plugin (D4/D5).
 *
 * - Persistence: reuses `@tauri-store/pinia`'s `saveOnChange` with zero new persistence code,
 *   isomorphic with the cat/general stores. Components call `$tauri.start()` on mount to load, then it is ready to use.
 * - Soft delete: `removeTodo` does not really delete; it stamps `deletedAt` and moves the item
 *   out of the visible list, reserved for Phase 2 sync.
 * - CRUD auto-assignment: create fills id/createdAt/updatedAt/deviceId; update refreshes updatedAt.
 *
 * @see docs/adr/0001-plugin-architecture-for-todo.md D4 / D5
 */
export const useTodoStore = defineStore('todo', () => {
  const todos = ref<Todo[]>([])

  /** Visible list: todos not soft-deleted (soft-deleted ones do not appear). */
  const visibleTodos = computed(() => {
    return todos.value.filter(todo => todo.deletedAt === undefined)
  })

  /**
   * Create a todo. deviceId is injected by the caller (device layer).
   *
   * `dueDate` is optional: passed by entry points that support "quick create with a due
   * date" such as the mini input window (T5), converted to a local-midnight timestamp
   * (consistent with TodoItem's startOfDay comparison basis).
   *
   * `priority` is optional: after T6 completed the input controls, creation entry points
   * can choose a priority, defaulting to medium.
   */
  const createTodo = (
    title: string,
    deviceId: string,
    now: number = Date.now(),
    dueDate?: number,
    priority: TodoPriority = 'medium',
  ): Todo => {
    const trimmed = title.trim()

    const todo: Todo = {
      id: nanoid(),
      title: trimmed,
      completed: false,
      priority,
      createdAt: now,
      updatedAt: now,
      deviceId,
    }

    if (dueDate !== undefined) {
      todo.dueDate = dueDate
    }

    todos.value.push(todo)

    return todo
  }

  /** Update a todo (merge patch), automatically refreshing updatedAt. */
  const updateTodo = (id: string, patch: Partial<Pick<Todo, 'title' | 'completed' | 'priority' | 'dueDate'>>, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    Object.assign(todo, patch, { updatedAt: now })
  }

  /** Toggle completion state, automatically refreshing updatedAt. */
  const toggleTodo = (id: string, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    todo.completed = !todo.completed
    todo.updatedAt = now
  }

  /** Soft delete: stamp deletedAt and move the item out of the visible list (visibleTodos filters it out automatically). */
  const removeTodo = (id: string, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    todo.deletedAt = now
    todo.updatedAt = now
  }

  /**
   * Panel size after the user's last adjustment (issue #19, logical px).
   * null = never adjusted; the default size is used when opening. Stores logical rather than physical:
   * after switching monitors / changing system scaling, restoring via the current scaleFactor keeps the perceived size from drifting.
   */
  const panelSize = ref<{ width: number, height: number } | null>(null)

  /** Record (or clear) the user-adjusted panel size; automatically persisted via saveOnChange. */
  const setPanelSize = (size: { width: number, height: number } | null) => {
    panelSize.value = size
  }

  /**
   * Mini window width after the user's last adjustment (issue #19, logical px; height is fixed at 130 with a single-axis lock).
   * null = never adjusted; the default 380 is used.
   */
  const miniWidth = ref<number | null>(null)

  const setMiniWidth = (width: number | null) => {
    miniWidth.value = width
  }

  return {
    todos,
    visibleTodos,
    createTodo,
    updateTodo,
    toggleTodo,
    removeTodo,
    panelSize,
    setPanelSize,
    miniWidth,
    setMiniWidth,
  }
})
