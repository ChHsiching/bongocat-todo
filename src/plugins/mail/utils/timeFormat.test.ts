import { afterEach, describe, expect, it, vi } from 'vitest'

import { absoluteDate, relativeTime } from './timeFormat'

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

describe('absoluteDate — 绝对日期（年.月.日）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('格式为 年.月.日（无补零）', () => {
    // 固定时区为 UTC，避免 CI/本地时区差异
    vi.stubEnv('TZ', 'UTC')
    // 2026-08-02T13:14:15.000Z → UTC 年.月.日
    const ts = Date.UTC(2026, 7, 2, 13, 14, 15)
    expect(absoluteDate(ts)).toBe('2026.8.2')
    vi.unstubAllEnvs()
  })

  it('月份/日期不补零（1 月 1 日 = 2026.1.1）', () => {
    vi.stubEnv('TZ', 'UTC')
    const ts = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(absoluteDate(ts)).toBe('2026.1.1')
    vi.unstubAllEnvs()
  })

  it('12 月 31 日 = 2026.12.31', () => {
    vi.stubEnv('TZ', 'UTC')
    const ts = Date.UTC(2026, 11, 31, 23, 59, 59)
    expect(absoluteDate(ts)).toBe('2026.12.31')
    vi.unstubAllEnvs()
  })

  it('不同年份', () => {
    vi.stubEnv('TZ', 'UTC')
    expect(absoluteDate(Date.UTC(2024, 2, 9, 6, 0, 0))).toBe('2024.3.9')
    vi.unstubAllEnvs()
  })
})
