/**
 * 常见邮箱 IMAP 配置速查 + 授权码获取指引（T1 简化版 provider 识别）。
 *
 * 用户在表单输入邮箱地址后，按域名（`@` 后段）匹配本表自动填充 IMAP host/port，
 * 并展示该邮箱的「授权码获取指引」。T3 会扩展为完整 provider 识别（含 logo 自动识别）。
 *
 * 未命中域名时返回 null，由调用方让用户手动填。
 */
export interface ProviderPreset {
  /** 匹配的域名列表（小写，不含 @）。 */
  domains: string[]
  /** IMAP 服务器地址。 */
  imapHost: string
  /** IMAP 端口（IMAPS 固定 993）。 */
  imapPort: number
  /** 该邮箱获取授权码/专用密码的指引文案（i18n key 后缀，见 locale 文件 providers.*）。 */
  hintKey: string
}

/** 内置常见邮箱配置（覆盖国内外主流邮箱）。 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    hintKey: 'gmail',
  },
  {
    domains: ['qq.com', 'foxmail.com'],
    imapHost: 'imap.qq.com',
    imapPort: 993,
    hintKey: 'qq',
  },
  {
    domains: ['163.com', 'yeah.net'],
    imapHost: 'imap.163.com',
    imapPort: 993,
    hintKey: '163',
  },
  {
    domains: ['126.com'],
    imapHost: 'imap.126.com',
    imapPort: 993,
    hintKey: '126',
  },
  {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    hintKey: 'outlook',
  },
  {
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    hintKey: 'icloud',
  },
]

/**
 * 按邮箱地址匹配 provider 预设。
 *
 * @returns 命中的 ProviderPreset；未命中返回 null（调用方让用户手动填）
 */
export function matchProvider(address: string): ProviderPreset | null {
  const at = address.lastIndexOf('@')
  if (at < 0) {
    return null
  }
  const domain = address.slice(at + 1).toLowerCase()
  return PROVIDER_PRESETS.find(p => p.domains.includes(domain)) ?? null
}
