import { describe, expect, it } from 'vitest'

import { relativeTime } from './timeFormat'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime — 相对时间文案', () => {
  const now = 2_000_000_000_000

  it('< 1 分钟 = 刚刚', () => {
    expect(relativeTime(now - 30_000, now)).toBe('刚刚')
  })

  it('差 1 秒不到 1 分钟仍 = 刚刚', () => {
    expect(relativeTime(now - 59_000, now)).toBe('刚刚')
  })

  it('1 分钟前 = 1 分钟前', () => {
    expect(relativeTime(now - MIN, now)).toBe('1 分钟前')
  })

  it('30 分钟前', () => {
    expect(relativeTime(now - 30 * MIN, now)).toBe('30 分钟前')
  })

  it('1 小时前', () => {
    expect(relativeTime(now - HOUR, now)).toBe('1 小时前')
  })

  it('5 小时前', () => {
    expect(relativeTime(now - 5 * HOUR, now)).toBe('5 小时前')
  })

  it('刚好 24h 边界 = 昨天（< 48h）', () => {
    expect(relativeTime(now - DAY, now)).toBe('昨天')
  })

  it('47 小时前 = 昨天（< 48h）', () => {
    expect(relativeTime(now - 47 * HOUR, now)).toBe('昨天')
  })

  it('48 小时 = 2 天前', () => {
    expect(relativeTime(now - 2 * DAY, now)).toBe('2 天前')
  })

  it('5 天前', () => {
    expect(relativeTime(now - 5 * DAY, now)).toBe('5 天前')
  })

  it('未来时间（diff 负）回退为「刚刚」', () => {
    expect(relativeTime(now + 1000, now)).toBe('刚刚')
  })
})
