/**
 * Mail relative time formatting (T5).
 *
 * The mail list / archive window meta area shows relative times like "2 minutes ago", "yesterday", "3 days ago".
 * Pure functions; timestamps are injected by the caller.
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * Format a timestamp as an absolute date string (T5a, used in the archive list meta).
 *
 * Format `year.month.day` (e.g. `2026.8.2`), shown alongside the relative time ("yesterday") —
 * so you see both how long ago and the exact date. Uses local-timezone year/month/day (the date from the user's perspective).
 *
 * @param ts Target timestamp (ms)
 */
export function absoluteDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

/**
 * Format a timestamp as a Chinese relative time string.
 *
 * - < 1 minute: '刚刚'
 * - < 1 hour: 'N 分钟前'
 * - < 24 hours: 'N 小时前'
 * - < 48 hours: '昨天'
 * - < 30 days: 'N 天前'
 * - ≥ 30 days: 'N 天前' (same as above, mostly archived items)
 *
 * @param ts Target timestamp (ms)
 * @param now Current timestamp (ms), injected by the caller
 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)

  if (diff < MIN) {
    return '刚刚'
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MIN)} 分钟前`
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} 小时前`
  }
  if (diff < 2 * DAY) {
    return '昨天'
  }
  return `${Math.floor(diff / DAY)} 天前`
}
