export interface ProviderPreset {
  domains: string[]
  imapHost: string
  imapPort: number
  hintKey: string
  displayName: string
  webmailUrl: string
  logo: string
}

/** Built-in common mailbox configs (covering mainstream domestic and international providers). */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    hintKey: 'gmail',
    displayName: 'Gmail',
    webmailUrl: 'https://mail.google.com',
    logo: '/mail-logos/logo-gmail.svg',
  },
  {
    domains: ['qq.com'],
    imapHost: 'imap.qq.com',
    imapPort: 993,
    hintKey: 'qq',
    displayName: 'QQ',
    webmailUrl: 'https://mail.qq.com',
    logo: '/mail-logos/logo-qq.png',
  },
  {
    domains: ['foxmail.com'],
    imapHost: 'imap.qq.com',
    imapPort: 993,
    hintKey: 'qq',
    displayName: 'Foxmail',
    webmailUrl: 'https://mail.qq.com',
    logo: '/mail-logos/logo-foxmail-icon.png',
  },
  {
    domains: ['163.com', 'yeah.net'],
    imapHost: 'imap.163.com',
    imapPort: 993,
    hintKey: '163',
    displayName: '163',
    webmailUrl: 'https://mail.163.com',
    logo: '/mail-logos/logo-163-icon.png',
  },
  {
    domains: ['126.com'],
    imapHost: 'imap.126.com',
    imapPort: 993,
    hintKey: '126',
    displayName: '126',
    webmailUrl: 'https://mail.126.com',
    logo: '/mail-logos/logo-126-icon.png',
  },
  {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    hintKey: 'outlook',
    displayName: 'Outlook',
    webmailUrl: 'https://outlook.live.com',
    logo: '/mail-logos/logo-outlook.svg',
  },
  {
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    hintKey: 'icloud',
    displayName: 'iCloud',
    webmailUrl: 'https://www.icloud.com/mail',
    logo: '/mail-logos/logo-icloud.svg',
  },
  {
    // ⚠️ Proton does not support direct IMAP; the Proton Mail Bridge must run locally (listens on 127.0.0.1:1143 by default).
    // This preset exists only for logo auto-detection + guidance copy; before connecting, follow the guidance to change host/port to the Bridge's actual address.
    domains: ['proton.me', 'protonmail.com'],
    imapHost: '127.0.0.1',
    imapPort: 1143,
    hintKey: 'proton',
    displayName: 'Proton',
    webmailUrl: 'https://mail.proton.me',
    logo: '/mail-logos/logo-proton.png',
  },
  {
    domains: ['yahoo.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    hintKey: 'yahoo',
    displayName: 'Yahoo',
    webmailUrl: 'https://mail.yahoo.com',
    logo: '/mail-logos/logo-yahoo.svg',
  },
]

/**
 * Match a provider preset by mail address.
 *
 * Match order: ① exact domain hits a preset → ② suffix pattern (education mail `.edu.cn` / `.edu`).
 * Education mail is SaaS (icoremail) with endlessly varying domains that cannot be enumerated one by one, so suffix matching is the fallback.
 *
 * @returns The matched ProviderPreset; null when unmatched (the caller lets the user fill in manually)
 */
export function matchProvider(address: string): ProviderPreset | null {
  const at = address.lastIndexOf('@')
  if (at < 0) {
    return null
  }
  const domain = address.slice(at + 1).toLowerCase()

  // ① Exact domain match
  const exact = PROVIDER_PRESETS.find(p => p.domains.includes(domain))
  if (exact) {
    return exact
  }

  // ② Suffix pattern match (domains that cannot be enumerated, e.g. education mail)
  for (const pattern of SUFFIX_PATTERNS) {
    if (domain.endsWith(pattern.suffix)) {
      return {
        domains: [domain],
        imapHost: pattern.imapHost,
        imapPort: pattern.imapPort,
        hintKey: pattern.hintKey,
        displayName: pattern.extractDisplayName?.(address, domain) ?? '教育邮箱',
        webmailUrl: pattern.webmailUrlTemplate,
        logo: EDU_MAIL_LOGO,
      }
    }
  }

  return null
}

export const DEFAULT_MAIL_LOGO = '/mail-logos/logo-mail-default.svg'

const EDU_MAIL_LOGO = '/mail-logos/logo-edu.svg'

/**
 * Suffix pattern matching (the fallback when no exact domain hits).
 *
 * Education mail (`.edu.cn` / `.edu`) is Coremail/iCoremail SaaS with endlessly varying domains
 * (e.g. `s.ytu.edu.cn`) that cannot be enumerated one by one. Matching is done by suffix pattern here,
 * uniformly routed through `edu.icoremail.net` IMAP + `edu.icoremail.net` webmail.
 * displayName extracts the school abbreviation from the domain (e.g. `s.ytu.edu.cn` → YTU).
 */
interface SuffixPattern {
  /** Domain suffix (lowercase, e.g. `.edu.cn`). Matched with endsWith. */
  suffix: string
  /** IMAP server. */
  imapHost: string
  /** IMAP port. */
  imapPort: number
  /** i18n key suffix for authorization-code guidance. */
  hintKey: string
  /** webmail URL template (`{address}` is replaced with the full mail address). */
  webmailUrlTemplate: string
  /**
   * Extract the display name from the full mail address. When it returns null, displayName is the fallback.
   * For education mail, extracts the school abbreviation (e.g. `s.ytu.edu.cn` → YTU).
   */
  extractDisplayName?: (address: string, domain: string) => string | null
}

const SUFFIX_PATTERNS: SuffixPattern[] = [
  {
    suffix: '.edu.cn',
    imapHost: 'edu.icoremail.net',
    imapPort: 993,
    hintKey: 'edu',
    webmailUrlTemplate: 'https://edu.icoremail.net',
    extractDisplayName: (_address, domain) => extractEduAbbr(domain),
  },
  {
    suffix: '.edu',
    imapHost: 'edu.icoremail.net',
    imapPort: 993,
    hintKey: 'edu',
    webmailUrlTemplate: 'https://edu.icoremail.net',
    extractDisplayName: (_address, domain) => extractEduAbbr(domain),
  },
]

/**
 * Extract the school abbreviation from an education mail domain.
 *
 * Education domains usually take the form `<subdomain>.<school-abbr>.edu.cn` (e.g. `s.ytu.edu.cn` → YTU,
 * `mail.tsinghua.edu.cn` → TSINGHUA). Takes the last segment before `.edu.cn` as the abbreviation, uppercased.
 * Returns null when extraction fails (falls back to the displayName "教育邮箱").
 */
function extractEduAbbr(domain: string): string | null {
  const stripped = domain.replace(/\.edu(\.cn)?$/, '')
  const parts = stripped.split('.')
  const last = parts[parts.length - 1]
  if (!last || last.length < 2) {
    return null
  }
  return last.toUpperCase()
}

export function matchProviderLogo(address: string): string {
  return matchProvider(address)?.logo ?? DEFAULT_MAIL_LOGO
}

/**
 * Resolve the webmail entry URL for a mailbox.
 *
 * Used when clicking a mail bubble to jump. Matches the provider by mail address (including suffix patterns) to get webmailUrl;
 * on a miss, falls back to matching presets by IMAP host. Returns null when both miss.
 *
 * @param address Mail address (primary match key)
 * @param imapHost IMAP server host (fallback match key when address misses)
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
    const bySuffix = SUFFIX_PATTERNS.find(p => p.imapHost === host)
    if (bySuffix) {
      return bySuffix.webmailUrlTemplate
    }
  }
  return null
}
