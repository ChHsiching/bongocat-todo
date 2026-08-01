/**
 * 气泡溢出计算（T2，纯函数）。
 *
 * 设计稿 bubble.html D7 决策：最多同时显示 3 条未处理气泡，第 4 条起折成一行
 * 「还有 N 条，查看邮件列表」提示。本函数把「未处理总数」拆成「展示数组」+「溢出数」，
 * 由气泡窗口页消费渲染。
 *
 * @see docs/designs/phase2-exploration/bubble.html
 * @see ADR 0002 D7
 */

/** 气泡最多同时显示条数（D7 决策）。 */
export const MAX_BUBBLES = 3

export interface BubbleOverflow {
  /** 实际展示的气泡条数（= min(total, MAX_BUBBLES)）。 */
  shown: number
  /** 溢出数量（total > 3 时为 total - 3，否则 0）。 */
  overflow: number
}

/**
 * 给定未处理气泡总数，返回展示数 + 溢出数。
 *
 * 纯函数，无副作用。覆盖 0/1/3/4/10 等边界（见 overflow.test.ts）。
 */
export function computeBubbleOverflow(total: number): BubbleOverflow {
  const safe = Math.max(0, Math.floor(total))
  const shown = Math.min(safe, MAX_BUBBLES)
  return {
    shown,
    overflow: Math.max(0, safe - MAX_BUBBLES),
  }
}
