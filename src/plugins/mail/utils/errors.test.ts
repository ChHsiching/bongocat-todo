import { describe, expect, it } from 'vitest'

import { formatConnectionError } from './errors'

// 测试用翻译函数：返回 key 本身（验证取了正确的 i18n key）
const t = (key: string) => key

describe('formatConnectionError', () => {
  it('tls 握手失败 → errTlsBlocked', () => {
    const msg = formatConnectionError('TLS 握手失败: tls handshake eof', t)
    expect(msg).toBe('plugins.mail.labels.errTlsBlocked')
  })

  it('handshake 关键字 → errTlsBlocked', () => {
    const msg = formatConnectionError('handshake error', t)
    expect(msg).toBe('plugins.mail.labels.errTlsBlocked')
  })

  it('eof 关键字 → errTlsBlocked', () => {
    const msg = formatConnectionError('connection eof', t)
    expect(msg).toBe('plugins.mail.labels.errTlsBlocked')
  })

  it('登录失败（授权码错误）→ errAuthFailed', () => {
    const msg = formatConnectionError('IMAP 登录失败: BAD invalid credentials', t)
    expect(msg).toBe('plugins.mail.labels.errAuthFailed')
  })

  it('登录失败（authenticate）→ errAuthFailed', () => {
    const msg = formatConnectionError('authenticate failed', t)
    expect(msg).toBe('plugins.mail.labels.errAuthFailed')
  })

  it('unsafe login（网易拦截）→ errUnsafeLogin', () => {
    const msg = formatConnectionError('选 INBOX 失败: no response: code:None, info:Some("SELECT Unsafe Login...")', t)
    expect(msg).toBe('plugins.mail.labels.errUnsafeLogin')
  })

  it('command not support（Coremail）→ errUnsafeLogin', () => {
    const msg = formatConnectionError('BAD command not support', t)
    expect(msg).toBe('plugins.mail.labels.errUnsafeLogin')
  })

  it('超时 → errTimeout', () => {
    const msg = formatConnectionError('TCP 连接超时（imap.x.com:993，30s 无响应）', t)
    expect(msg).toBe('plugins.mail.labels.errTimeout')
  })

  it('timeout 关键字 → errTimeout', () => {
    const msg = formatConnectionError('connection timeout', t)
    expect(msg).toBe('plugins.mail.labels.errTimeout')
  })

  it('dNS 解析失败（不知道这样的主机）→ errNetwork', () => {
    const msg = formatConnectionError('TCP连接失败imap.s.ytu.edu.cn:993:不知道这样的主机。(os error 11001)', t)
    expect(msg).toBe('plugins.mail.labels.errNetwork')
  })

  it('tcp 关键字 → errNetwork', () => {
    const msg = formatConnectionError('tcp connect failed', t)
    expect(msg).toBe('plugins.mail.labels.errNetwork')
  })

  it('domain not local → errDomainNotLocal（优先于登录失败）', () => {
    const msg = formatConnectionError('IMAP登录失败:no response: code:None, info:Some("258 Error: domain not local")', t)
    expect(msg).toBe('plugins.mail.labels.errDomainNotLocal')
  })

  it('无法分类的错误 → 原样返回', () => {
    const raw = '一些奇怪的错误'
    const msg = formatConnectionError(raw, t)
    expect(msg).toBe(raw)
  })
})
