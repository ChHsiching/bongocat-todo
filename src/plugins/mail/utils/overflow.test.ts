import { describe, expect, it } from 'vitest'

import { computeBubbleOverflow, MAX_BUBBLES } from './overflow'

describe('computeBubbleOverflow', () => {
  it('0 条 → 展示 0，溢出 0', () => {
    expect(computeBubbleOverflow(0)).toEqual({ shown: 0, overflow: 0 })
  })

  it('1 条 → 展示 1，溢出 0', () => {
    expect(computeBubbleOverflow(1)).toEqual({ shown: 1, overflow: 0 })
  })

  it('3 条（上限）→ 展示 3，溢出 0', () => {
    expect(computeBubbleOverflow(3)).toEqual({ shown: 3, overflow: 0 })
  })

  it('4 条 → 展示 3，溢出 1（开始折入列表）', () => {
    expect(computeBubbleOverflow(4)).toEqual({ shown: 3, overflow: 1 })
  })

  it('10 条 → 展示 3，溢出 7', () => {
    expect(computeBubbleOverflow(10)).toEqual({ shown: 3, overflow: 7 })
  })

  it('负数按 0 处理（防御）', () => {
    expect(computeBubbleOverflow(-5)).toEqual({ shown: 0, overflow: 0 })
  })

  it('小数向下取整（防御）', () => {
    expect(computeBubbleOverflow(4.9)).toEqual({ shown: 3, overflow: 1 })
  })

  it('maxBubbles 常量 = 3', () => {
    expect(MAX_BUBBLES).toBe(3)
  })
})
