import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  id: string
  title: string
  completed: boolean
  priority: TodoPriority
  dueDate?: number
  createdAt: number
  updatedAt: number
  deviceId: string
  deletedAt?: number
}

/**
 * Main store of the todo plugin (D4/D5).
 *
 * - Persistence: reuses `@tauri-store/pinia`'s `saveOnChange` with zero new persistence code,
 *   isomorphic with the cat/general stores. Components call `$tauri.start()` on mount to load, then it is ready to use.
 * - Soft delete: `softDeleteTodo` does not really delete; it stamps `deletedAt` and moves the item
 *   out of the visible list, reserved for Phase 2 sync.
 * - CRUD auto-assignment: create fills id/createdAt/updatedAt/deviceId; update refreshes updatedAt.
 *
 * @see docs/adr/0001-plugin-architecture-for-todo.md D4 / D5
 */
export const useTodoStore = defineStore('todo', () => {
  const todos = ref<Todo[]>([])

  const visibleTodos = computed(() => {
    return todos.value.filter(todo => todo.deletedAt === undefined)
  })

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

  const updateTodo = (id: string, patch: Partial<Pick<Todo, 'title' | 'completed' | 'priority' | 'dueDate'>>, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    Object.assign(todo, patch, { updatedAt: now })
  }

  const toggleTodo = (id: string, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    todo.completed = !todo.completed
    todo.updatedAt = now
  }

  const softDeleteTodo = (id: string, now: number = Date.now()) => {
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
    softDeleteTodo,
    panelSize,
    setPanelSize,
    miniWidth,
    setMiniWidth,
  }
})
