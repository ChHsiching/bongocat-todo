<script setup lang="ts">
/**
 * ResizeHandles：贴视觉边框的隐形 resize 把手（issue #19 后续）。
 *
 * 为什么需要：Tauri 原生 resize 命中带贴窗口矩形外缘（约 4px），而手绘纸片
 * 窗口有 ~20-26px 透明页边距——用户必须抓到纸片可见边框外的"空气"里才能拖，
 * 观感是"把手在虚空位置"。本组件把 8 个隐形把手精确贴到纸片可见边框线上。
 *
 * 实现：mousedown 时调 startResizeDragging(direction)（Win/Linux 可用；
 * macOS 该 API 返回 NotSupported——catch 静默，macOS 用户回落到原生边缘拖拽）。
 * 方案依据：docs/research/2026-11-03-issue19-todo-window-resize.md §2.1。
 *
 * 通用性：inset 四向可配（不同窗口纸片边框距窗口边的留白不同），mail 窗口复用。
 * 用法：<ResizeHandles v-if="可调态" :inset-left="24" :inset-right="27" … />
 */
import { getCurrentWindow } from '@tauri-apps/api/window'

const props = withDefaults(
  defineProps<{
    /** 纸片可见边框线距窗口边的留白（px），按窗口几何逐向配置 */
    insetLeft?: number
    insetRight?: number
    insetTop?: number
    insetBottom?: number
    /** 把手厚度（垂直于边方向，px） */
    depth?: number
  }>(),
  { insetLeft: 24, insetRight: 27, insetTop: 21, insetBottom: 26, depth: 12 },
)

const appWindow = getCurrentWindow()

type Dir = 'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest'

async function start(dir: Dir) {
  try {
    await appWindow.startResizeDragging(dir)
  } catch {
    // macOS NotSupported 等：静默，用户回落原生边缘拖拽
  }
}

interface Handle {
  dir: Dir
  cursor: string
  /** CSS 定位（相对窗口根容器） */
  style: Record<string, string>
}

const d = () => props.depth
const c = () => props.depth * 1.4 // 角把手略大更好抓

const handles: Handle[] = [
  { dir: 'North', cursor: 'ns-resize', style: { top: `calc(${props.insetTop}px - ${d() / 2}px)`, left: '60px', right: '60px', height: `${d()}px` } },
  { dir: 'South', cursor: 'ns-resize', style: { bottom: `calc(${props.insetBottom}px - ${d() / 2}px)`, left: '60px', right: '60px', height: `${d()}px` } },
  { dir: 'West', cursor: 'ew-resize', style: { left: `calc(${props.insetLeft}px - ${d() / 2}px)`, top: '60px', bottom: '60px', width: `${d()}px` } },
  { dir: 'East', cursor: 'ew-resize', style: { right: `calc(${props.insetRight}px - ${d() / 2}px)`, top: '60px', bottom: '60px', width: `${d()}px` } },
  { dir: 'NorthWest', cursor: 'nwse-resize', style: { left: `calc(${props.insetLeft}px - ${c() / 2}px)`, top: `calc(${props.insetTop}px - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
  { dir: 'NorthEast', cursor: 'nesw-resize', style: { right: `calc(${props.insetRight}px - ${c() / 2}px)`, top: `calc(${props.insetTop}px - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
  { dir: 'SouthWest', cursor: 'nesw-resize', style: { left: `calc(${props.insetLeft}px - ${c() / 2}px)`, bottom: `calc(${props.insetBottom}px - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
  { dir: 'SouthEast', cursor: 'nwse-resize', style: { right: `calc(${props.insetRight}px - ${c() / 2}px)`, bottom: `calc(${props.insetBottom}px - ${c() / 2}px)`, width: `${c()}px`, height: `${c()}px` } },
]
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
/* 容器不拦截事件，仅把手本身可命中 */
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
