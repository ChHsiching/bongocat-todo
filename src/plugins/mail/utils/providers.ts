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
  /** 该邮箱的展示名（如「Gmail」「QQ邮箱」「Outlook」），气泡来源标签用。 */
  displayName: string
  /** 该邮箱的 webmail 入口 URL（点气泡跳转用）。 */
  webmailUrl: string
}

/** 内置常见邮箱配置（覆盖国内外主流邮箱）。 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    hintKey: 'gmail',
    displayName: 'Gmail',
    webmailUrl: 'https://mail.google.com',
  },
  {
    domains: ['qq.com', 'foxmail.com'],
    imapHost: 'imap.qq.com',
    imapPort: 993,
    hintKey: 'qq',
    displayName: 'QQ',
    webmailUrl: 'https://mail.qq.com',
  },
  {
    domains: ['163.com', 'yeah.net'],
    imapHost: 'imap.163.com',
    imapPort: 993,
    hintKey: '163',
    displayName: '163',
    webmailUrl: 'https://mail.163.com',
  },
  {
    domains: ['126.com'],
    imapHost: 'imap.126.com',
    imapPort: 993,
    hintKey: '126',
    displayName: '126',
    webmailUrl: 'https://mail.126.com',
  },
  {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    hintKey: 'outlook',
    displayName: 'Outlook',
    webmailUrl: 'https://outlook.live.com',
  },
  {
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    hintKey: 'icloud',
    displayName: 'iCloud',
    webmailUrl: 'https://www.icloud.com/mail',
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

/**
 * 解析邮箱的 webmail 入口 URL。
 *
 * 点击邮件气泡跳转用。先按邮箱地址匹配 provider 取 webmailUrl；
 * 未命中（自定义域名邮箱）时回退按 IMAP host 匹配（账号 store 里存了 host）。
 * 都未命中返回 null，调用方 fallback 到通用搜索入口。
 *
 * @param address 邮箱地址（首选匹配键）
 * @param imapHost IMAP 服务器地址（address 未命中时的回退匹配键）
 */
export function resolveWebmailUrl(address: string, imapHost?: string): string | null {
  const byAddr = matchProvider(address)
  if (byAddr) {
    return byAddr.webmailUrl
  }
  if (imapHost) {
    const host = imapHost.toLowerCase()
    const byHost = PROVIDER_PRESETS.find(p => p.imapHost === host)
    if (byHost) {
      return byHost.webmailUrl
    }
  }
  return null
}
