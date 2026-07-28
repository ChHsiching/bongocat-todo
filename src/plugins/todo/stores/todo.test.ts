import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useTodoStore } from './todo'

describe('useTodoStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('createTodo', () => {
    it('填入 id/createdAt/updatedAt/deviceId，completed 默认 false', () => {
      const todoStore = useTodoStore()
      const now = 1_700_000_000_000

      const todo = todoStore.createTodo('买牛奶', 'device-abc', now)

      expect(todo.id).toBeTruthy()
      expect(todo.title).toBe('买牛奶')
      expect(todo.completed).toBe(false)
      expect(todo.priority).toBe('medium')
      expect(todo.createdAt).toBe(now)
      expect(todo.updatedAt).toBe(now)
      expect(todo.deviceId).toBe('device-abc')
      expect(todo.deletedAt).toBeUndefined()
    })

    it('trim 标题前后空白', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('  买牛奶  ', 'dev', 100)

      expect(todo.title).toBe('买牛奶')
    })

    it('不传 now 时用 Date.now()', () => {
      const todoStore = useTodoStore()
      const before = Date.now()

      const todo = todoStore.createTodo('x', 'dev')

      const after = Date.now()

      expect(todo.createdAt).toBeGreaterThanOrEqual(before)
      expect(todo.createdAt).toBeLessThanOrEqual(after)
      expect(todo.updatedAt).toBe(todo.createdAt)
    })

    it('传 dueDate 时写入字段', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('给猫换水', 'dev', 100, 1_700_000_000_000)

      expect(todo.dueDate).toBe(1_700_000_000_000)
    })

    it('不传 dueDate 时字段为 undefined', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('给猫换水', 'dev', 100)

      expect(todo.dueDate).toBeUndefined()
    })

    it('传 priority 时写入字段', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('喂猫', 'dev', 100, undefined, 'high')

      expect(todo.priority).toBe('high')
    })

    it('不传 priority 时默认 medium', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('喂猫', 'dev', 100)

      expect(todo.priority).toBe('medium')
    })

    it('priority 与 dueDate 同时传入都写入', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('喂猫', 'dev', 100, 1_700_000_000_000, 'low')

      expect(todo.priority).toBe('low')
      expect(todo.dueDate).toBe(1_700_000_000_000)
    })
  })

  describe('visibleTodos', () => {
    it('软删除的 todo 不出现在可见列表', () => {
      const todoStore = useTodoStore()

      const alive = todoStore.createTodo('活着', 'dev', 100)
      const dead = todoStore.createTodo('已删', 'dev', 100)

      todoStore.removeTodo(dead.id, 200)

      expect(todoStore.visibleTodos.map(t => t.id)).toEqual([alive.id])
    })

    it('未删除的 todo 出现在可见列表', () => {
      const todoStore = useTodoStore()

      const a = todoStore.createTodo('A', 'dev', 100)

      expect(todoStore.visibleTodos.map(t => t.id)).toContain(a.id)
    })
  })

  describe('updateTodo', () => {
    it('合并 patch 并刷新 updatedAt', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('原标题', 'dev', 100)

      todoStore.updateTodo(todo.id, { title: '新标题', completed: true }, 200)

      expect(todo.title).toBe('新标题')
      expect(todo.completed).toBe(true)
      expect(todo.updatedAt).toBe(200)
      expect(todo.createdAt).toBe(100)
    })

    it('不存在的 id 静默忽略', () => {
      const todoStore = useTodoStore()

      expect(() => todoStore.updateTodo('不存在', { title: 'x' }, 100)).not.toThrow()
    })

    it('能更新优先级', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('任务', 'dev', 100)

      expect(todo.priority).toBe('medium')

      todoStore.updateTodo(todo.id, { priority: 'high' }, 200)

      expect(todo.priority).toBe('high')
      expect(todo.updatedAt).toBe(200)
    })
  })

  describe('toggleTodo', () => {
    it('切换完成状态并刷新 updatedAt', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('任务', 'dev', 100)

      todoStore.toggleTodo(todo.id, 200)

      expect(todo.completed).toBe(true)
      expect(todo.updatedAt).toBe(200)

      todoStore.toggleTodo(todo.id, 300)

      expect(todo.completed).toBe(false)
      expect(todo.updatedAt).toBe(300)
    })
  })

  describe('removeTodo', () => {
    it('打 deletedAt 时间戳，移出可见列表，但 todos 原始数组保留', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('要删', 'dev', 100)

      todoStore.removeTodo(todo.id, 500)

      expect(todo.deletedAt).toBe(500)
      expect(todo.updatedAt).toBe(500)
      expect(todoStore.todos.map(t => t.id)).toContain(todo.id)
      expect(todoStore.visibleTodos.map(t => t.id)).not.toContain(todo.id)
    })

    it('不存在的 id 静默忽略', () => {
      const todoStore = useTodoStore()

      expect(() => todoStore.removeTodo('不存在', 100)).not.toThrow()
    })
  })

  describe('phase 2 同步预留字段', () => {
    it('create 后所有 4 个预留字段就位', () => {
      const todoStore = useTodoStore()

      const todo = todoStore.createTodo('x', 'dev-1', 100)

      expect(todo.createdAt).toBe(100)
      expect(todo.updatedAt).toBe(100)
      expect(todo.deviceId).toBe('dev-1')
      expect(todo.deletedAt).toBeUndefined()
    })
  })
})
