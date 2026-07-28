<script setup lang="ts">
import { computed } from 'vue'

import type { TodoPriority } from '@/plugins/todo'

/**
 * 墨点（InkDot）：「笔画小圈涂黑」感。三层 path：
 *   外圈不规则淡色光晕 + 内部涂黑核心 + 笔触高光（留白椭圆）。
 * 按 priority 变色：high 红 / medium 橙 / low 蓝。
 * SVG path 抠自 docs/designs/todo-panel-exploration/panel.html。
 */
const { priority } = defineProps<{
  priority: TodoPriority
}>()

const color = computed(() => {
  switch (priority) {
    case 'high':
      return 'var(--red-ink)'
    case 'low':
      return 'var(--blue)'
    case 'medium':
    default:
      return 'var(--orange)'
  }
})
</script>

<template>
  <svg
    class="ink-dot"
    viewBox="0 0 14 14"
  >
    <!-- 外圈不规则淡色光晕 -->
    <path
      d="M 7 2 Q 11 2 12 5 Q 13 7 12 9 Q 11 12 7 12 Q 3 12 2 9 Q 1 7 2 5 Q 3 2 7 2 Z"
      :fill="color"
      opacity="0.25"
    />
    <!-- 内部涂黑核心 -->
    <path
      d="M 7 3.5 Q 9.5 3.5 10.5 5.5 Q 11 7 10 8.5 Q 9 10.5 7 10.5 Q 5 10.5 4 8.5 Q 3 7 3.5 5.5 Q 4.5 3.5 7 3.5 Z"
      :fill="color"
    />
    <!-- 笔触高光（留白椭圆） -->
    <ellipse
      cx="5.5"
      cy="5.5"
      :fill="color"
      opacity="0.5"
      rx="1.2"
      ry="0.8"
    />
  </svg>
</template>

<style scoped>
.ink-dot {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>
