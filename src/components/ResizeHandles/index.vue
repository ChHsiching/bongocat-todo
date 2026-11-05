<script setup lang="ts">
/**
 * ResizeHandles: invisible resize handles hugging the visual border (issue #19 follow-up).
 *
 * Why needed: Tauri's native resize hit zone hugs the window rectangle's outer edge (~4px), but hand-drawn paper
 * windows have a ~20-26px transparent margin — the user must grab the "air" outside the paper's visible border to drag,
 * which looks like "the handle floats in the void". This component sticks 8 invisible handles precisely onto the paper's visible border line.
 *
 * Implementation: on mousedown, call startResizeDragging(direction) (works on Win/Linux;
 * on macOS the API returns NotSupported — silently caught, macOS users fall back to native edge dragging).
 * Rationale: docs/research/2026-11-03-issue19-todo-window-resize.md §2.1.
 *
 * Generality: insets are configurable per direction (different windows have different margins between the paper border and the window edge); reused by the mail windows.
 * Usage: <ResizeHandles v-if="resizable" :inset-left="24" :inset-right="27" … />
 */
import { getCurrentWindow } from '@tauri-apps/api/window'

const props = withDefaults(
  defineProps<{
    /**
     * Margin between the paper's visible border line and the window edge; number=px, string=percentage (e.g. '7.5%',
     * for windows whose border scales proportionally with the window (mini monolithic SVG) to anchor against)
     */
    insetLeft?: number | string
    insetRight?: number | string
    insetTop?: number | string
    insetBottom?: number | string
    /** Handle thickness (perpendicular to the edge, px) */
    depth?: number
    /** Mount only the specified directions (e.g. mini single horizontal axis: ['East','West']); defaults to all 8 */
    directions?: string[]
    /**
     * Band mode: edge handles cover the whole strip from the window edge to 2px inside the border line — the entire
     * transparent margin (the "void" dead zone between the border line and the window edge) becomes grabbable,
     * no longer requiring a precise hit on a 12px-thin strip
     */
    band?: boolean
  }>(),
  { insetLeft: 24, insetRight: 27, insetTop: 21, insetBottom: 26, depth: 12, directions: () => [], band: false },
)

/** Normalize an inset into a CSS length (number→px, string as-is) */
const len = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v)

const appWindow = getCurrentWindow()

type Dir = 'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest'

async function start(dir: Dir) {
  try {
    await appWindow.startResizeDragging(dir)
  } catch {
    // macOS NotSupported etc.: silent; the user falls back to native edge dragging
  }
}

interface Handle {
  dir: Dir
  cursor: string
  /** CSS positioning (relative to the window root container) */
  style: Record<string, string>
}

const d = () => props.depth
const c = () => props.depth * 1.4 // corner handles are slightly larger and easier to grab

const allHandles: Handle[] = props.band
  ? [
      // Band mode: the whole strip from the border line to the window edge is grabbable (inner boundary = inset + 2px, never entering the paper content area)
      { dir: 'North', cursor: 'ns-resize', style: { top: '0', bottom: `calc(100% - ${len(props.insetTop)} - 2px)`, left: '40px', right: '40px' } },
      { dir: 'South', cursor: 'ns-resize', style: { bottom: '0', top: `calc(100% - ${len(props.insetBottom)} - 2px)`, left: '40px', right: '40px' } },
      { dir: 'West', cursor: 'ew-resize', style: { left: '0', right: `calc(100% - ${len(props.insetLeft)} - 2px)`, top: '40px', bottom: '40px' } },
      { dir: 'East', cursor: 'ew-resize', style: { right: '0', left: `calc(100% - ${len(props.insetRight)} - 2px)`, top: '40px', bottom: '40px' } },
    ]
  : [
      { dir: 'North', cursor: 'ns-resize', style: { top: `calc(${len(props.insetTop)} - ${d() / 2}px)`, left: '60px', right: '60px', height: `${d()}px` } },
      { dir: 'South', cursor: 'ns-resize', style: { bottom: `calc(${len(props.insetBottom)} - ${d() / 2}px)`, left: '60px', right: '60px', height: `${d()}px` } },
      { dir: 'West', cursor: 'ew-resize', style: { left: `calc(${len(props.insetLeft)} - ${d() / 2}px)`, top: '60px', bottom: '60px', width: `${d()}px` } },
      { dir: 'East', cursor: 'ew-resize', style: { right: `calc(${len(props.insetRight)} - ${d() / 2}px)`, top: '60px', bottom: '60px', width: `${d()}px` } },
      { dir: 'NorthWest', cursor: 'nwse-resize', style: { left: `calc(${len(props.insetLeft)} - ${c() / 2}px)`, top: `calc(${len(props.insetTop)} - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
      { dir: 'NorthEast', cursor: 'nesw-resize', style: { right: `calc(${len(props.insetRight)} - ${c() / 2}px)`, top: `calc(${len(props.insetTop)} - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
      { dir: 'SouthWest', cursor: 'nesw-resize', style: { left: `calc(${len(props.insetLeft)} - ${c() / 2}px)`, bottom: `calc(${len(props.insetBottom)} - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
      { dir: 'SouthEast', cursor: 'nwse-resize', style: { right: `calc(${len(props.insetRight)} - ${c() / 2}px)`, bottom: `calc(${len(props.insetBottom)} - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
    ]

const handles = props.directions.length > 0
  ? allHandles.filter(h => props.directions.includes(h.dir))
  : allHandles
</script>

<template>
  <div class="resize-handles">
    <div
      v-for="h in handles"
      :key="h.dir"
      :class="`rh rh-${h.dir.toLowerCase()}`"
      :style="{ cursor: h.cursor, ...h.style }"
      @mousedown.prevent="start(h.dir)"
    />
  </div>
</template>

<style scoped>
/* The container does not intercept events; only the handles themselves are hittable */
.resize-handles {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}

.rh {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
}
</style>
