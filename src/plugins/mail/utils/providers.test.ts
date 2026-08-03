import { describe, expect, it } from 'vitest'

import { DEFAULT_MAIL_LOGO, matchProvider, matchProviderLogo, PROVIDER_PRESETS, resolveWebmailUrl } from './providers'

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

  it('foxmail.com 命中 Foxmail（共用 imap.qq.com）', () => {
    const p = matchProvider('user@foxmail.com')
    expect(p?.imapHost).toBe('imap.qq.com')
    expect(p?.hintKey).toBe('qq')
    expect(p?.displayName).toBe('Foxmail')
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

  it('proton.me / protonmail.com 命中 Proton', () => {
    expect(matchProvider('a@proton.me')?.hintKey).toBe('proton')
    expect(matchProvider('a@protonmail.com')?.hintKey).toBe('proton')
  })

  it('yahoo.com 命中 Yahoo', () => {
    expect(matchProvider('a@yahoo.com')?.imapHost).toBe('imap.mail.yahoo.com')
  })

  it('域名大小写不敏感', () => {
    expect(matchProvider('Alice@GMAIL.com')?.hintKey).toBe('gmail')
  })

  it('未知域名返回 null', () => {
    expect(matchProvider('a@example.com')).toBeNull()
  })

  it('教育邮箱 .edu.cn 命中后缀模式（edu.icoremail.net）', () => {
    const p = matchProvider('changhsich@s.ytu.edu.cn')
    expect(p?.imapHost).toBe('edu.icoremail.net')
    expect(p?.imapPort).toBe(993)
    expect(p?.webmailUrl).toBe('https://edu.icoremail.net')
  })

  it('教育邮箱从域名提取学校简称（s.ytu.edu.cn → YTU）', () => {
    expect(matchProvider('changhsich@s.ytu.edu.cn')?.displayName).toBe('YTU')
  })

  it('教育邮箱 .edu（无 .cn）也命中后缀模式', () => {
    expect(matchProvider('a@mit.edu')?.imapHost).toBe('edu.icoremail.net')
    expect(matchProvider('a@mit.edu')?.displayName).toBe('MIT')
  })

  it('教育邮箱简称多段域名取 .edu 前最后一段', () => {
    expect(matchProvider('a@mail.tsinghua.edu.cn')?.displayName).toBe('TSINGHUA')
  })

  it('教育邮箱用毕业帽 logo', () => {
    expect(matchProvider('a@s.ytu.edu.cn')?.logo).toBe('/mail-logos/logo-edu.svg')
  })

  it('无 @ 的地址返回 null（不崩）', () => {
    expect(matchProvider('badaddr')).toBeNull()
  })

  it('所有预设端口都是 993（IMAPS）', () => {
    // Proton 用 Bridge 本地端口 1143，是唯一的例外（注释已说明）
    for (const p of PROVIDER_PRESETS) {
      if (p.hintKey === 'proton') {
        expect(p.imapPort).toBe(1143)
      } else {
        expect(p.imapPort).toBe(993)
      }
    }
  })
})

describe('webmailUrl 字段', () => {
  it('所有预设都有 webmailUrl（点气泡跳转用）', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.webmailUrl).toBeTruthy()
      expect(p.webmailUrl).toMatch(/^https?:\/\//)
    }
  })
})

describe('displayName 字段', () => {
  it('所有预设都有 displayName（气泡来源标签用）', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.displayName).toBeTruthy()
    }
  })

  it('gmail 命中显示名是 Gmail（非全大写）', () => {
    expect(matchProvider('a@gmail.com')?.displayName).toBe('Gmail')
  })

  it('qq 命中显示名是 QQ', () => {
    expect(matchProvider('a@qq.com')?.displayName).toBe('QQ')
  })
})

describe('logo 字段', () => {
  it('所有预设都有 logo 路径（设置页 + 添加表单 logo 联动用）', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.logo).toBeTruthy()
      expect(p.logo).toMatch(/^\/mail-logos\//)
    }
  })

  it('gmail 命中 Gmail logo（svg）', () => {
    expect(matchProvider('a@gmail.com')?.logo).toBe('/mail-logos/logo-gmail.svg')
  })

  it('qq 命中 QQ logo（png）', () => {
    expect(matchProvider('a@qq.com')?.logo).toBe('/mail-logos/logo-qq.png')
  })

  it('foxmail 命中 Foxmail 自己的 logo', () => {
    expect(matchProvider('a@foxmail.com')?.logo).toBe('/mail-logos/logo-foxmail-icon.png')
  })
})

describe('matchProviderLogo', () => {
  it('命中预设返回该 provider 的 logo', () => {
    expect(matchProviderLogo('a@gmail.com')).toBe('/mail-logos/logo-gmail.svg')
  })

  it('未识别域名返回默认信封 logo', () => {
    expect(matchProviderLogo('a@example.com')).toBe(DEFAULT_MAIL_LOGO)
  })

  it('无 @ 的地址也返回默认 logo（不崩）', () => {
    expect(matchProviderLogo('badaddr')).toBe(DEFAULT_MAIL_LOGO)
  })

  it('空串返回默认 logo（不崩）', () => {
    expect(matchProviderLogo('')).toBe(DEFAULT_MAIL_LOGO)
  })
})

describe('resolveWebmailUrl', () => {
  it('按地址命中 Gmail → mail.google.com', () => {
    expect(resolveWebmailUrl('alice@gmail.com')).toBe('https://mail.google.com')
  })

  it('按地址命中 QQ → mail.qq.com', () => {
    expect(resolveWebmailUrl('u@qq.com')).toBe('https://mail.qq.com')
  })

  it('地址未命中时按 IMAP host 回退命中', () => {
    expect(resolveWebmailUrl('self@example.com', 'imap.qq.com')).toBe('https://mail.qq.com')
  })

  it('地址和 host 都未命中返回 null', () => {
    expect(resolveWebmailUrl('a@example.com', 'mail.example.com')).toBeNull()
  })

  it('不传 host 且地址未命中返回 null', () => {
    expect(resolveWebmailUrl('a@example.com')).toBeNull()
  })
})
