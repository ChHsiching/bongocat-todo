import { describe, expect, it } from 'vitest'

import { nextPriority, PRIORITIES, priorityIndex } from './priority'

describe('priority utils', () => {
  describe('nextPriority', () => {
    it('low → medium', () => {
      expect(nextPriority('low')).toBe('medium')
    })

    it('medium → high', () => {
      expect(nextPriority('medium')).toBe('high')
    })

    it('high → low（循环回起点）', () => {
      expect(nextPriority('high')).toBe('low')
    })
  })

  describe('pRIORITIES', () => {
    it('三档顺序为 low/medium/high', () => {
      expect(PRIORITIES).toEqual(['low', 'medium', 'high'])
    })
  })

  describe('priorityIndex', () => {
    it('返回优先级在 PRIORITIES 中的下标', () => {
      expect(priorityIndex('low')).toBe(0)
      expect(priorityIndex('medium')).toBe(1)
      expect(priorityIndex('high')).toBe(2)
    })
  })
})
