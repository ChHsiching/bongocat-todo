/**
 * 邮件相对时间格式化（T5）。
 *
 * 邮件列表 / 归档窗口 meta 区显示「2 分钟前」「昨天」「3 天前」等相对时间。
 * 纯函数，时间戳由调用方注入。
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * 把时间戳格式化为相对时间文案（中文）。
 *
 * - < 1 分钟：「刚刚」
 * - < 1 小时：「N 分钟前」
 * - < 24 小时：「N 小时前」
 * - < 48 小时：「昨天」
 * - < 30 天：「N 天前」
 * - ≥ 30 天：「N 天前」（同上，归档项居多）
 *
 * @param ts 目标时间戳（ms）
 * @param now 当前时间戳（ms），由调用方注入
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
