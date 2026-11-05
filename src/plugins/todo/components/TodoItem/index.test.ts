import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { Todo } from '@/plugins/todo'

import TodoItem from './index.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'en-US': {} },
})

// Fixed clock: 2026-06-15 10:00 local time
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime()

function mountTodoItem(dueDate?: number) {
  const todo: Todo = {
    id: 't1',
    title: '测试',
    completed: false,
    priority: 'medium',
    dueDate,
    createdAt: NOW,
    updatedAt: NOW,
    deviceId: 'dev',
  }
  return mount(TodoItem, {
    props: { todo },
    global: { plugins: [i18n] },
  })
}

describe('todoItem 到期视觉状态', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('今天到期（时间未过）→ due-soon 蓝色提示，非 urgent', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })

    const wrapper = mountTodoItem(new Date(2026, 5, 15, 14, 30).getTime())

    const classes = wrapper.find('.due').classes()
    expect(classes).toContain('due-soon')
    expect(classes).not.toContain('urgent')
  })

  it('昨天到期 → urgent 红色警示，非 due-soon', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })

    const wrapper = mountTodoItem(new Date(2026, 5, 14, 14, 30).getTime())

    const classes = wrapper.find('.due').classes()
    expect(classes).toContain('urgent')
    expect(classes).not.toContain('due-soon')
  })

  it('明天到期 → 既无 due-soon 也无 urgent', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })

    const wrapper = mountTodoItem(new Date(2026, 5, 16, 14, 30).getTime())

    const classes = wrapper.find('.due').classes()
    expect(classes).not.toContain('due-soon')
    expect(classes).not.toContain('urgent')
  })
})
