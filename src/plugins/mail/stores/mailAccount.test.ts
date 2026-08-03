import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_ACCOUNTS, useMailAccountStore } from './mailAccount'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useMailAccountStore — addAccount（单账号长度限制）', () => {
  it('空 store 可添加一个账号', () => {
    const store = useMailAccountStore()

    const acc = store.addAccount({
      address: 'alice@gmail.com',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      username: 'alice@gmail.com',
    })

    expect(acc.id).toBeTruthy()
    expect(acc.address).toBe('alice@gmail.com')
    expect(acc.enabled).toBe(true)
    expect(acc.status).toBe('idle')
    expect(acc.lastSeenUid).toBe(0)
    expect(store.accounts).toHaveLength(1)
  })

  it(`已存在账号时，第二个 addAccount 抛错（MAX_ACCOUNTS=${MAX_ACCOUNTS}）`, () => {
    const store = useMailAccountStore()
    store.addAccount({
      address: 'alice@gmail.com',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      username: 'alice@gmail.com',
    })

    expect(() =>
      store.addAccount({
        address: 'bob@qq.com',
        imapHost: 'imap.qq.com',
        imapPort: 993,
        username: 'bob@qq.com',
      }),
    ).toThrow()
    expect(store.accounts).toHaveLength(1)
  })

  it('providerDomain 从邮箱地址提取', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'Alice@Gmail.com',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      username: 'Alice@Gmail.com',
    })

    expect(acc.providerDomain).toBe('gmail.com')
  })

  it('无 @ 的地址 providerDomain 为空串（不崩）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'badaddr',
      imapHost: 'imap.x.com',
      imapPort: 993,
      username: 'u',
    })

    expect(acc.providerDomain).toBe('')
  })

  it('地址/主机名/用户名做 trim', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: '  a@b.com  ',
      imapHost: '  imap.b.com  ',
      imapPort: 993,
      username: '  a@b.com  ',
    })

    expect(acc.address).toBe('a@b.com')
    expect(acc.imapHost).toBe('imap.b.com')
    expect(acc.username).toBe('a@b.com')
  })
})

describe('useMailAccountStore — setStatus / removeAccount / getAccount', () => {
  it('setStatus 更新对应账号的连接状态', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.setStatus(acc.id, 'connecting')
    expect(store.getAccount(acc.id)?.status).toBe('connecting')

    store.setStatus(acc.id, 'connected')
    expect(store.getAccount(acc.id)?.status).toBe('connected')

    store.setStatus(acc.id, 'error')
    expect(store.getAccount(acc.id)?.status).toBe('error')
  })

  it('setStatus 对不存在的 id 静默无操作', () => {
    const store = useMailAccountStore()
    expect(() => store.setStatus('nope', 'connected')).not.toThrow()
  })

  it('getAccount 对不存在 id 返回 undefined', () => {
    const store = useMailAccountStore()
    expect(store.getAccount('nope')).toBeUndefined()
  })

  it('removeAccount 从数组移除对应账号', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.removeAccount(acc.id)
    expect(store.accounts).toHaveLength(0)
    expect(store.getAccount(acc.id)).toBeUndefined()
  })

  it('removeAccount 对不存在 id 无副作用', () => {
    const store = useMailAccountStore()
    store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.removeAccount('nope')
    expect(store.accounts).toHaveLength(1)
  })

  it('setEnabled 切换账号启用状态（默认 true，可关可开）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })
    expect(acc.enabled).toBe(true)

    store.setEnabled(acc.id, false)
    expect(store.getAccount(acc.id)?.enabled).toBe(false)

    store.setEnabled(acc.id, true)
    expect(store.getAccount(acc.id)?.enabled).toBe(true)
  })

  it('setEnabled 对不存在的 id 静默无操作', () => {
    const store = useMailAccountStore()
    expect(() => store.setEnabled('nope', false)).not.toThrow()
  })
})

describe('useMailAccountStore — setLastSeenUid（离线补发持久化）', () => {
  it('首次设置 lastSeenUid（0 → N）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.setLastSeenUid(acc.id, 500)

    expect(acc.lastSeenUid).toBe(500)
  })

  it('单调递增（新 uid 更大才更新）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.setLastSeenUid(acc.id, 500)
    store.setLastSeenUid(acc.id, 800)
    store.setLastSeenUid(acc.id, 600) // 乱序/旧数据，不回退

    expect(acc.lastSeenUid).toBe(800)
  })

  it('小于等于当前值不更新（幂等）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })

    store.setLastSeenUid(acc.id, 500)
    store.setLastSeenUid(acc.id, 500)

    expect(acc.lastSeenUid).toBe(500)
  })

  it('对不存在 id 静默无操作', () => {
    const store = useMailAccountStore()
    expect(() => store.setLastSeenUid('nope', 999)).not.toThrow()
  })

  it('lastSeenUid 为 undefined（旧数据）时直接写入（兼容迁移前数据）', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })
    // 模拟旧持久化数据：强制删除 lastSeenUid
    ;(acc as { lastSeenUid?: number }).lastSeenUid = undefined as unknown as number

    store.setLastSeenUid(acc.id, 500)

    expect(acc.lastSeenUid).toBe(500)
  })
})

describe('useMailAccountStore — migrateLastSeenUid（旧数据迁移）', () => {
  it('给 lastSeenUid 为 undefined 的旧账号补 0', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })
    // 模拟旧持久化数据：强制删除 lastSeenUid
    ;(acc as { lastSeenUid?: number }).lastSeenUid = undefined as unknown as number

    store.migrateLastSeenUid()

    expect(acc.lastSeenUid).toBe(0)
  })

  it('已有 lastSeenUid 的账号不受影响', () => {
    const store = useMailAccountStore()
    const acc = store.addAccount({
      address: 'a@b.com',
      imapHost: 'imap.b.com',
      imapPort: 993,
      username: 'a@b.com',
    })
    store.setLastSeenUid(acc.id, 800)

    store.migrateLastSeenUid()

    expect(acc.lastSeenUid).toBe(800)
  })

  it('空账号列表不报错', () => {
    const store = useMailAccountStore()
    expect(() => store.migrateLastSeenUid()).not.toThrow()
  })
})
