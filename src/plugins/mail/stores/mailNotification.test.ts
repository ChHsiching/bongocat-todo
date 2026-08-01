import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { NewMailPayload } from '../index'

import { UNREAD_ARCHIVE_AFTER_MS } from '../utils/retention'
import { useMailNotificationStore } from './mailNotification'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

function makeMail(overrides: Partial<NewMailPayload> = {}): NewMailPayload {
  return {
    accountId: 'acc1',
    from: 'alice@example.com',
    subject: 'Hello',
    arrivedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useMailNotificationStore — upsertMail', () => {
  it('新邮件插入，默认 status=unread', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)

    expect(n.id).toBeTruthy()
    expect(n.status).toBe('unread')
    expect(n.uid).toBe(100)
    expect(store.notifications).toHaveLength(1)
  })

  it('同 accountId+uid 重复插入不覆盖（保留已读状态）', () => {
    const store = useMailNotificationStore()
    const n1 = store.upsertMail(makeMail({ subject: 'original' }), 100)
    store.markRead(n1.id, Date.now())

    const n2 = store.upsertMail(makeMail({ subject: 'CHANGED' }), 100)

    expect(n2.id).toBe(n1.id)
    expect(n2.subject).toBe('original')
    expect(n2.status).toBe('read')
    expect(store.notifications).toHaveLength(1)
  })

  it('不同 uid 各自插入', () => {
    const store = useMailNotificationStore()
    store.upsertMail(makeMail(), 100)
    store.upsertMail(makeMail(), 101)
    expect(store.notifications).toHaveLength(2)
  })

  it('不同 accountId 同 uid 各自插入', () => {
    const store = useMailNotificationStore()
    store.upsertMail(makeMail({ accountId: 'acc1' }), 100)
    store.upsertMail(makeMail({ accountId: 'acc2' }), 100)
    expect(store.notifications).toHaveLength(2)
  })

  it('uid=0 跳过去重（每次新增）', () => {
    const store = useMailNotificationStore()
    store.upsertMail(makeMail(), 0)
    store.upsertMail(makeMail(), 0)
    expect(store.notifications).toHaveLength(2)
  })
})

describe('useMailNotificationStore — markRead / archive / purge', () => {
  it('markRead: unread → read，记 readAt', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)

    store.markRead(n.id, 123456)

    expect(n.status).toBe('read')
    expect(n.readAt).toBe(123456)
  })

  it('markRead 对已读邮件幂等（不刷新 readAt）', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)
    store.markRead(n.id, 1000)
    store.markRead(n.id, 2000)

    expect(n.readAt).toBe(1000)
  })

  it('markRead 对归档邮件幂等', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)
    store.markRead(n.id, 1000)
    store.archive(n.id, 2000)
    store.markRead(n.id, 3000)

    expect(n.status).toBe('archived')
    expect(n.archivedAt).toBe(2000)
  })

  it('archive: → archived，记 archivedAt', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)

    store.archive(n.id, 9999)

    expect(n.status).toBe('archived')
    expect(n.archivedAt).toBe(9999)
  })

  it('archive 对已归档邮件幂等', () => {
    const store = useMailNotificationStore()
    const n = store.upsertMail(makeMail(), 100)
    store.archive(n.id, 1000)
    store.archive(n.id, 2000)

    expect(n.archivedAt).toBe(1000)
  })

  it('purge 从列表彻底移除', () => {
    const store = useMailNotificationStore()
    const n1 = store.upsertMail(makeMail(), 100)
    const n2 = store.upsertMail(makeMail(), 101)

    store.purge(n1.id)

    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0].id).toBe(n2.id)
  })
})

describe('useMailNotificationStore — tickRetention', () => {
  it('未读超过 24h → 归档', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const n = store.upsertMail(makeMail({ arrivedAt: now - 25 * HOUR }), 100)

    const { changed } = store.tickRetention(now)

    expect(changed).toBe(true)
    expect(n.status).toBe('archived')
    expect(n.archivedAt).toBe(now)
  })

  it('未读刚好 24h → 归档（边界）', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const n = store.upsertMail(makeMail({ arrivedAt: now - UNREAD_ARCHIVE_AFTER_MS }), 100)

    store.tickRetention(now)

    expect(n.status).toBe('archived')
  })

  it('未读不足 24h 不迁移', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const n = store.upsertMail(makeMail({ arrivedAt: now - HOUR }), 100)

    const { changed } = store.tickRetention(now)

    expect(changed).toBe(false)
    expect(n.status).toBe('unread')
  })

  it('已读超过 5min → 归档', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const n = store.upsertMail(makeMail(), 100)
    store.markRead(n.id, now - 6 * MIN)

    store.tickRetention(now)

    expect(n.status).toBe('archived')
  })

  it('已读不足 5min 不归档', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const n = store.upsertMail(makeMail(), 100)
    store.markRead(n.id, now - MIN)

    store.tickRetention(now)

    expect(n.status).toBe('read')
  })

  it('归档超过 30 天 → 清理（purge）', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    store.upsertMail(makeMail(), 100)
    store.archive(store.notifications[0].id, now - 31 * 24 * HOUR)

    store.tickRetention(now)

    expect(store.notifications).toHaveLength(0)
  })

  it('无变化时 changed=false', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    store.upsertMail(makeMail({ arrivedAt: now }), 100)

    const { changed } = store.tickRetention(now)

    expect(changed).toBe(false)
  })

  it('混合：一封归档 + 一封保留', () => {
    const store = useMailNotificationStore()
    const now = 2_000_000_000_000
    const keep = store.upsertMail(makeMail({ arrivedAt: now }), 100)
    const drop = store.upsertMail(makeMail({ arrivedAt: now - 25 * HOUR }), 101)

    const { changed } = store.tickRetention(now)

    expect(changed).toBe(true)
    expect(keep.status).toBe('unread')
    expect(drop.status).toBe('archived')
  })
})

describe('useMailNotificationStore — getters', () => {
  it('activeMails：未读+已读，按到达时间倒序', () => {
    const store = useMailNotificationStore()
    store.upsertMail(makeMail({ arrivedAt: 100 }), 1)
    store.upsertMail(makeMail({ arrivedAt: 300 }), 2)
    store.upsertMail(makeMail({ arrivedAt: 200 }), 3)
    const archived = store.upsertMail(makeMail({ arrivedAt: 50 }), 4)
    store.archive(archived.id)

    const active = store.activeMails

    expect(active).toHaveLength(3)
    expect(active.map(n => n.arrivedAt)).toEqual([300, 200, 100])
  })

  it('archivedMails：只含归档，按归档时间倒序', () => {
    const store = useMailNotificationStore()
    store.upsertMail(makeMail(), 1) // unread, excluded
    const a1 = store.upsertMail(makeMail(), 2)
    const a2 = store.upsertMail(makeMail(), 3)
    store.archive(a1.id, 1000)
    store.archive(a2.id, 2000)

    const archived = store.archivedMails

    expect(archived).toHaveLength(2)
    expect(archived.map(n => n.archivedAt)).toEqual([2000, 1000])
  })

  it('activeMails / archivedMails 空时不报错', () => {
    const store = useMailNotificationStore()
    expect(store.activeMails).toEqual([])
    expect(store.archivedMails).toEqual([])
  })
})
