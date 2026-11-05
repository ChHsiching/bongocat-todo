/**
 * Hand-drawn bubble SVG shape generation (T2).
 *
 * Root cause (user-reported bug): the original design's path coordinates were hard-coded (viewBox 360×100, bottom border y≈66);
 * when the content (wrapped text) grows taller, it overflows outside the shape — the bottom border does not follow the content down.
 *
 * This function takes "text-only height" + "width" as input and dynamically generates the path d attribute + viewBox,
 * so the shape's bottom border and tail triangle always follow the content's bottom and widen with the content.
 * Top/bottom padding is symmetric (both PAD), with the text sandwiched in the middle.
 *
 * Model (viewBox coordinates = CSS pixels, 1:1, no stretching):
 *   - top border y = TOP (fixed 10)
 *   - text area [TOP+PAD, TOP+PAD+textH] (padding is PAD on both top and bottom, symmetric)
 *   - bottom border y = TOP + PAD + textH + PAD
 *   - tail tip y = bottom border + TAIL (protruding below the bottom border, pointing at the desktop pet), horizontally centered at W/2
 *   - viewBox height = tail tip + VB_BOT (leaves margin below the tail tip)
 *
 * Width adaptation: default 360 (aligned with the todo panel); when the content is wider (e.g. a long link that doesn't wrap),
 * generate at the actual width to keep content from overflowing the shape's right edge. All x coordinates derive from W (top-right corner W-20, right curves W-12, tail W/2).
 *
 * The container's (.bubble) width/height must be set to the viewBox size (1:1, no stretching), otherwise
 * preserveAspectRatio="none" will stretch the shape.
 *
 * Verified in a real-browser harness: both short-subject and long-subject multi-line cases keep the border fully wrapping
 * the text, symmetric top/bottom padding, and the tail centered without overlap.
 *
 * @see docs/designs/phase2-exploration/bubble.html the visual source of the original hard-coded path
 */

/** Top border y (fixed). */
export const SHAPE_TOP = 10
/** Text padding on top and bottom (symmetric, matches the original design padding of 16). */
export const SHAPE_PAD = 16
/** Tail triangle height (protruding below the bottom border). */
export const SHAPE_TAIL = 14
/** viewBox bottom margin (below the tail tip). */
export const SHAPE_VB_BOT = 6
/** Default width (aligned with the todo panel; does not shrink for narrower content). */
export const SHAPE_DEFAULT_WIDTH = 360

export interface BubbleShape {
  /** viewBox string ("0 0 W H"). */
  viewBox: string
  /** viewBox height (used for both container + SVG height, guaranteeing 1:1 with no stretching). */
  height: number
  /** Shape width (used for both container + SVG width). */
  width: number
  /** Paper shadow layer path d. */
  shadowD: string
  /** Main shape path d (white fill + stroke). */
  mainD: string
  /** Top decorative wave path d. */
  waveD: string
  /** Content area top (CSS pixels, used for absolutely positioning the content element). */
  contentTop: number
}

/**
 * Generate the hand-drawn bubble's SVG paths + viewBox + dimensions from the text-only height + width.
 *
 * @param textHeight Text-only height (px, excluding top/bottom padding; usually = the content element's getBoundingClientRect().height)
 * @param width      Shape width (px), default 360; longer content (e.g. long links) can pass a larger value to avoid overflow
 */
export function genBubbleShape(textHeight: number, width: number = SHAPE_DEFAULT_WIDTH): BubbleShape {
  const W = width
  const topEdge = SHAPE_TOP
  const contentTop = SHAPE_TOP + SHAPE_PAD
  const bottomEdge = contentTop + textHeight + SHAPE_PAD
  const tailTip = bottomEdge + SHAPE_TAIL
  const height = tailTip + SHAPE_VB_BOT
  // Tail triangle horizontally centered (pointing at the desktop pet's head), base half-width 10
  const tailCx = Math.round(W / 2)
  const tailHalf = 10

  return {
    viewBox: `0 0 ${W} ${height}`,
    height,
    width: W,
    contentTop,
    shadowD: `M 16 ${topEdge + 4} Q 18 ${topEdge} 24 ${topEdge + 1} L ${W - 18} ${topEdge + 4} Q ${W - 10} ${topEdge + 6} ${W - 11} ${topEdge + 12} L ${W - 10} ${bottomEdge + 4} Q ${W - 12} ${bottomEdge + 10} ${W - 18} ${bottomEdge + 10} L ${tailCx + tailHalf + 2} ${bottomEdge + 10} L ${tailCx + 2} ${tailTip + 4} L ${tailCx - tailHalf + 2} ${bottomEdge + 10} L 22 ${bottomEdge + 8} Q 14 ${bottomEdge + 6} 15 ${bottomEdge} Z`,
    mainD: `M 14 ${topEdge} Q 16 ${topEdge - 4} 22 ${topEdge - 3} L ${W - 20} ${topEdge} Q ${W - 12} ${topEdge + 2} ${W - 13} ${topEdge + 8} L ${W - 12} ${bottomEdge - 6} Q ${W - 14} ${bottomEdge} ${W - 20} ${bottomEdge} L ${tailCx + tailHalf} ${bottomEdge} L ${tailCx} ${tailTip} L ${tailCx - tailHalf} ${bottomEdge} L 20 ${bottomEdge - 2} Q 12 ${bottomEdge - 4} 13 ${bottomEdge - 10} Z`,
    waveD: `M 36 ${topEdge + 16} Q 46 ${topEdge + 12} 56 ${topEdge + 16} T 76 ${topEdge + 16}`,
  }
}
