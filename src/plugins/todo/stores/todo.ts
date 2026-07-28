import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  /** 唯一 id（nanoid） */
  id: string
  /** 标题，用户输入 */
  title: string
  /** 是否完成 */
  completed: boolean
  /** 优先级，Phase 1 UI 暂不暴露，默认 medium */
  priority: TodoPriority
  /** 可选截止日期（时间戳 ms），Phase 1 UI 暂不暴露 */
  dueDate?: number
  // ── Phase 2 同步预留字段（CRUD 自动赋值，UI 不暴露） ──
  /** 创建时间（ms），create 时自动赋值 */
  createdAt: number
  /** 最近更新时间（ms），create/update/delete 时刷新 */
  updatedAt: number
  /** 创建该 todo 的设备 id（来自 useDeviceStore），create 时自动赋值 */
  deviceId: string
  /** 软删除时间（ms），delete 时自动赋值；为 undefined 表示未删除 */
  deletedAt?: number
}

/**
 * Todo 插件的主 store（D4/D5）。
 *
 * - 持久化：复用 `@tauri-store/pinia` 的 `saveOnChange`，零新增持久化代码，
 *   与 cat/general store 同构。组件挂载时调 `$tauri.start()` 加载后即可用。
 * - 软删除：`removeTodo` 不真删，打 `deletedAt` 时间戳并移出可见列表，供 Phase 2 同步使用。
 * - CRUD 自动赋值：create 填 id/createdAt/updatedAt/deviceId；update 刷新 updatedAt。
 *
 * @see docs/adr/0001-plugin-architecture-for-todo.md D4 / D5
 */
export const useTodoStore = defineStore('todo', () => {
  const todos = ref<Todo[]>([])

  /** 可见列表：未软删除的 todo（软删除的不出现）。 */
  const visibleTodos = computed(() => {
    return todos.value.filter(todo => todo.deletedAt === undefined)
  })

  /**
   * 新建 todo。deviceId 由调用方（设备层）注入。
   *
   * `dueDate` 可选：迷你输入窗（T5）等支持「快速新建带到期日」的入口传入，
   * 转换为本地午夜 timestamp（与 TodoItem 的 startOfDay 比较口径一致）。
   */
  const createTodo = (
    title: string,
    deviceId: string,
    now: number = Date.now(),
    dueDate?: number,
  ): Todo => {
    const trimmed = title.trim()

    const todo: Todo = {
      id: nanoid(),
      title: trimmed,
      completed: false,
      priority: 'medium',
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

  /** 更新 todo（合并更新），自动刷新 updatedAt。 */
  const updateTodo = (id: string, patch: Partial<Pick<Todo, 'title' | 'completed' | 'priority' | 'dueDate'>>, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    Object.assign(todo, patch, { updatedAt: now })
  }

  /** 切换完成状态，自动刷新 updatedAt。 */
  const toggleTodo = (id: string, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    todo.completed = !todo.completed
    todo.updatedAt = now
  }

  /** 软删除：打 deletedAt 时间戳并移出可见列表（visibleTodos 会自动过滤掉）。 */
  const removeTodo = (id: string, now: number = Date.now()) => {
    const todo = todos.value.find(item => item.id === id)

    if (!todo) {
      return
    }

    todo.deletedAt = now
    todo.updatedAt = now
  }

  return {
    todos,
    visibleTodos,
    createTodo,
    updateTodo,
    toggleTodo,
    removeTodo,
  }
})
