/**
 * Bubble overflow computation (T2, pure functions).
 *
 * Per design bubble.html decision D7: at most 3 pending bubble notifications are shown at once; from the 4th on they
 * collapse into a one-line "N more, view the mail list" hint. This function splits the "total pending count" into
 * a "shown count" + an "overflow count", consumed for rendering by the bubble window page.
 *
 * @see docs/designs/phase2-exploration/bubble.html
 * @see ADR 0002 D7
 */

/** Max number of bubbles shown at once (decision D7). */
export const MAX_BUBBLES = 3

export interface BubbleOverflow {
  /** Number of bubbles actually shown (= min(total, MAX_BUBBLES)). */
  shown: number
  /** Overflow count (total - 3 when total > 3, otherwise 0). */
  overflow: number
}

/**
 * Given the total number of pending bubbles, return the shown count + overflow count.
 *
 * Pure function, no side effects. Covers boundaries like 0/1/3/4/10 (see overflow.test.ts).
 */
export function computeBubbleOverflow(total: number): BubbleOverflow {
  const safe = Math.max(0, Math.floor(total))
  const shown = Math.min(safe, MAX_BUBBLES)
  return {
    shown,
    overflow: Math.max(0, safe - MAX_BUBBLES),
  }
}
