import { describe, expect, it } from 'vitest'

import { matchProvider, PROVIDER_PRESETS } from './providers'

describe('matchProvider', () => {
  it('gmail.com 命中 Gmail 预设', () => {
    const p = matchProvider('alice@gmail.com')
    expect(p?.imapHost).toBe('imap.gmail.com')
    expect(p?.imapPort).toBe(993)
    expect(p?.hintKey).toBe('gmail')
  })

  it('googlemail.com 也命中 Gmail', () => {
    expect(matchProvider('bob@googlemail.com')?.hintKey).toBe('gmail')
  })

  it('qq.com 命中 QQ（imap.qq.com）', () => {
    expect(matchProvider('user@qq.com')?.imapHost).toBe('imap.qq.com')
  })

  it('foxmail.com 命中 QQ（共用 imap.qq.com）', () => {
    expect(matchProvider('user@foxmail.com')?.imapHost).toBe('imap.qq.com')
  })

  it('163.com / 126.com 各自独立 host', () => {
    expect(matchProvider('a@163.com')?.imapHost).toBe('imap.163.com')
    expect(matchProvider('a@126.com')?.imapHost).toBe('imap.126.com')
  })

  it('outlook.com / hotmail.com / live.com 命中 office365', () => {
    expect(matchProvider('a@outlook.com')?.imapHost).toBe('outlook.office365.com')
    expect(matchProvider('a@hotmail.com')?.imapHost).toBe('outlook.office365.com')
    expect(matchProvider('a@live.com')?.imapHost).toBe('outlook.office365.com')
  })

  it('icloud.com / me.com 命中 iCloud', () => {
    expect(matchProvider('a@icloud.com')?.imapHost).toBe('imap.mail.me.com')
    expect(matchProvider('a@me.com')?.imapHost).toBe('imap.mail.me.com')
  })

  it('域名大小写不敏感', () => {
    expect(matchProvider('Alice@GMAIL.com')?.hintKey).toBe('gmail')
  })

  it('未知域名返回 null', () => {
    expect(matchProvider('a@example.com')).toBeNull()
  })

  it('无 @ 的地址返回 null（不崩）', () => {
    expect(matchProvider('badaddr')).toBeNull()
  })

  it('所有预设端口都是 993（IMAPS）', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.imapPort).toBe(993)
    }
  })
})
