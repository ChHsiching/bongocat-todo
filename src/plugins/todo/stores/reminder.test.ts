import { describe, expect, it } from 'vitest'

import type { Todo } from './todo'

import { findDueTodos } from './reminder'

/** 构造最小可用 Todo，方便单测；字段缺省值不影响 findDueTodos 判定。 */
function makeTodo(patch: Partial<Todo> & Pick<Todo, 'id'>): Todo {
  return {
    title: patch.title ?? 'x',
    completed: patch.completed ?? false,
    priority: patch.priority ?? 'medium',
    createdAt: patch.createdAt ?? 0,
    updatedAt: patch.updatedAt ?? 0,
    deviceId: patch.deviceId ?? 'dev',
    ...patch,
  }
}

describe('findDueTodos', () => {
  it('空数组返回空', () => {
    expect(findDueTodos([], 1_000)).toEqual([])
  })

  it('无 dueDate 的 todo 不命中', () => {
    const todo = makeTodo({ id: '1' })

    expect(findDueTodos([todo], 1_000)).toEqual([])
  })

  it('dueDate <= now 且未完成 → 命中', () => {
    const due = makeTodo({ id: '1', dueDate: 1_000 })

    expect(findDueTodos([due], 1_000).map(t => t.id)).toEqual(['1'])
    // now 略晚于 dueDate 也命中
    expect(findDueTodos([due], 2_000).map(t => t.id)).toEqual(['1'])
  })

  it('已完成的不命中（即便 dueDate 已过）', () => {
    const done = makeTodo({ id: '1', completed: true, dueDate: 1_000 })

    expect(findDueTodos([done], 2_000)).toEqual([])
  })

  it('dueDate > now（未到期）不命中', () => {
    const future = makeTodo({ id: '1', dueDate: 2_000 })

    expect(findDueTodos([future], 1_000)).toEqual([])
  })

  it('混合场景：只挑出到期未完成的', () => {
    const todos = [
      makeTodo({ id: 'due-undone', dueDate: 500 }), // ✅ 命中
      makeTodo({ id: 'due-done', completed: true, dueDate: 500 }), // ❌ 已完成
      makeTodo({ id: 'future', dueDate: 5_000 }), // ❌ 未到期
      makeTodo({ id: 'no-date' }), // ❌ 无 dueDate
      makeTodo({ id: 'due-now', dueDate: 1_000 }), // ✅ 命中（恰等于 now）
    ]

    expect(findDueTodos(todos, 1_000).map(t => t.id)).toEqual(['due-undone', 'due-now'])
  })

  it('是纯函数：不修改入参数组与元素', () => {
    const todo = makeTodo({ id: '1', dueDate: 500 })
    const input = [todo]
    const inputSnapshot = [{ ...todo }]

    findDueTodos(input, 1_000)

    expect(input).toEqual(inputSnapshot)
    expect(input[0]).toBe(todo) // 引用未变
  })
})
