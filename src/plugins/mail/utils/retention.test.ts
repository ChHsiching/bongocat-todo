import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_PURGE_AFTER_MS,
  minutesUntilArchive,
  READ_ARCHIVE_AFTER_MS,
  shouldArchiveRead,
  shouldArchiveUnread,
  shouldPurgeArchived,
  UNREAD_ARCHIVE_AFTER_MS,
} from './retention'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

describe('retention — 常量时限', () => {
  it('未读归档时限 = 24 小时', () => {
    expect(UNREAD_ARCHIVE_AFTER_MS).toBe(24 * HOUR)
  })

  it('已读归档时限 = 5 分钟', () => {
    expect(READ_ARCHIVE_AFTER_MS).toBe(5 * MIN)
  })

  it('归档清理时限 = 30 天', () => {
    expect(ARCHIVE_PURGE_AFTER_MS).toBe(30 * 24 * HOUR)
  })
})

describe('shouldArchiveUnread — 24h 超时归档', () => {
  it('刚到达（< 24h）不归档', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveUnread(now - HOUR, now)).toBe(false)
  })

  it('正好 24h 边界归档（>= 判定，等号成立）', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveUnread(now - UNREAD_ARCHIVE_AFTER_MS, now)).toBe(true)
  })

  it('超过 24h 归档', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveUnread(now - 25 * HOUR, now)).toBe(true)
  })

  it('差 1ms 也不归档（边界严格）', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveUnread(now - UNREAD_ARCHIVE_AFTER_MS + 1, now)).toBe(false)
  })
})

describe('shouldArchiveRead — 5min 超时归档', () => {
  it('刚读（< 5min）不归档', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveRead(now - MIN, now)).toBe(false)
  })

  it('正好 5min 边界归档', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveRead(now - READ_ARCHIVE_AFTER_MS, now)).toBe(true)
  })

  it('超过 5min 归档', () => {
    const now = 1_000_000_000_000
    expect(shouldArchiveRead(now - 6 * MIN, now)).toBe(true)
  })
})

describe('shouldPurgeArchived — 30 天清理', () => {
  it('近期归档（< 30 天）不清理', () => {
    const now = 1_000_000_000_000
    expect(shouldPurgeArchived(now - 24 * HOUR, now)).toBe(false)
  })

  it('正好 30 天边界清理', () => {
    const now = 1_000_000_000_000
    expect(shouldPurgeArchived(now - ARCHIVE_PURGE_AFTER_MS, now)).toBe(true)
  })

  it('超过 30 天清理', () => {
    const now = 1_000_000_000_000
    expect(shouldPurgeArchived(now - 31 * 24 * HOUR, now)).toBe(true)
  })
})

describe('minutesUntilArchive — 倒计时文案', () => {
  it('刚读 = 剩 5 分钟', () => {
    const now = 1_000_000_000_000
    expect(minutesUntilArchive(now, now)).toBe(5)
  })

  it('已过 1 分钟 = 剩 4 分钟', () => {
    const now = 1_000_000_000_000
    expect(minutesUntilArchive(now - MIN, now)).toBe(4)
  })

  it('已过 4 分钟整 = 剩 1 分钟（向下取整）', () => {
    const now = 1_000_000_000_000
    expect(minutesUntilArchive(now - 4 * MIN, now)).toBe(1)
  })

  it('已过 4min59s = 剩 0 分钟（不足 1 分钟向下取整为 0）', () => {
    const now = 1_000_000_000_000
    expect(minutesUntilArchive(now - 4 * MIN - 59 * 1000, now)).toBe(0)
  })

  it('超时返回 0（不返回负数）', () => {
    const now = 1_000_000_000_000
    expect(minutesUntilArchive(now - 10 * MIN, now)).toBe(0)
  })
})
