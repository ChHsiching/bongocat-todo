<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import HandClock from '../HandClock/index.vue'
import PawLogo from '../PawLogo/index.vue'

/**
 * 迷你输入窗（MiniInput / T5）。
 *
 * 跟随光标弹出的小窗，复用同一 WINDOW_LABEL.TODO（不同尺寸形态），与主面板数据同源。
 *
 * 三态：idle（占位符）→ typing（用户输入）→ saved（绿色「已添加」反馈，淡出后关闭）。
 * 布局：Row1 = PawLogo + 标题 input；Row2 = HandClock + native date input（可选到期日）。
 *
 * 关闭路径：Esc / 提交后的淡出 timer。**不**用 input blur 关闭（会破坏 tab 到 date input），
 * 也**不**用窗口失焦自动关闭（native date picker 弹层会夺焦误关）。
 *
 * 视觉复用 T2 资产：851 手写字体（.todo-handdrawn 继承）、粉墨水系 CSS 变量、PawLogo、HandClock。
 * 边框 SVG path 抠自 docs/designs/todo-panel-exploration/mini-input.html 变体 B（中笔画）。
 *
 * @see docs/designs/todo-panel-exploration/mini-input.html 视觉事实来源
 */
const emit = defineEmits<{
  close: []
  create: [title: string, dueDate?: number]
}>()

const { t } = useI18n()

type State = 'idle' | 'typing' | 'saved'
const state = ref<State>('idle')
/** saved 态淡出标志：true 时整个迷你窗 opacity→0 平滑淡出（spec「淡出关闭」）。 */
const fading = ref(false)

const title = ref('')
/** `<input type="date">` 的 value（YYYY-MM-DD），空字符串表示未选。 */
const dateStr = ref('')
const titleEl = ref<HTMLInputElement | null>(null)

/** saved 展示时长：前半段静止显示「已添加」，后半段淡出。 */
const SAVED_HOLD_MS = 300
const SAVED_FADE_MS = 300
let holdTimer: null | ReturnType<typeof setTimeout> = null
let closeTimer: null | ReturnType<typeof setTimeout> = null

onMounted(async () => {
  await nextTick()
  titleEl.value?.focus()
})

onBeforeUnmount(() => {
  clearTimers()
})

function markTyping() {
  if (state.value === 'idle') {
    state.value = 'typing'
  }
}

/** `YYYY-MM-DD` → 本地午夜 timestamp（与 TodoItem 的 startOfDay 口径一致，避开 UTC 偏移）。 */
function parseLocalMidnight(yyyymmdd: string): number | undefined {
  if (!yyyymmdd)
    return undefined
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d)
    return undefined
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

function handleSubmit() {
  const trimmed = title.value.trim()
  if (!trimmed || state.value === 'saved')
    return

  emit('create', trimmed, parseLocalMidnight(dateStr.value))

  state.value = 'saved'
  // 前半段静止展示「已添加」，后半段淡出，然后关闭。
  holdTimer = setTimeout(() => {
    fading.value = true
  }, SAVED_HOLD_MS)
  closeTimer = setTimeout(() => {
    emit('close')
  }, SAVED_HOLD_MS + SAVED_FADE_MS)
}

function handleClose() {
  // 已保存态由 timer 驱动关闭，避免重复 emit。
  if (state.value === 'saved')
    return
  clearTimers()
  emit('close')
}

function clearTimers() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}
</script>

<template>
  <div
    class="mini-window"
    :class="{ 'is-fading': fading }"
  >
    <!-- SVG 手绘边框：viewBox 与窗口尺寸一致，preserveAspectRatio="none" 拉伸填满。
         saved 态描边/底色变绿（#6b9c47 / #f6fbf2）；其他态白底 + 棕墨描边。 -->
    <svg
      class="frame-bg"
      preserveAspectRatio="none"
      viewBox="0 0 280 110"
    >
      <defs>
        <filter
          id="mini-shadow"
          height="120%"
          width="120%"
          x="-10%"
          y="-10%"
        >
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation="2"
          />
          <feOffset
            dx="1.5"
            dy="3"
          />
          <feComponentTransfer><feFuncA
            slope="0.12"
            type="linear"
          /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <!-- 阴影层 -->
      <path
        d="M 14 12 Q 16 10 20 10 L 266 12 Q 272 14 271 18 L 273 98 Q 271 104 266 104 L 18 102 Q 12 100 13 96 Z"
        :fill="state === 'saved' ? '#e0f0d8' : '#e8dcc8'"
        opacity="0.6"
      />
      <!-- 主框（变体 B 中笔画：四边中间有起伏） -->
      <path
        d="M 11 9 Q 13 6 17 6.5 Q 140 5 263 8 Q 269 10 268.5 14 Q 270 55 268 98 Q 267 104 262 104.5 Q 140 106 13 103 Q 8 101 9 97 Q 10 50 11 9 Z"
        :fill="state === 'saved' ? '#f6fbf2' : 'var(--paper)'"
        filter="url(#mini-shadow)"
        :stroke="state === 'saved' ? '#6b9c47' : 'var(--ink)'"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <div class="mini-content">
      <!-- saved 态：居中绿色「已添加」+ 手绘对勾 -->
      <div
        v-if="state === 'saved'"
        class="saved-row"
      >
        <svg
          class="saved-check"
          fill="none"
          height="18"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          viewBox="0 0 18 18"
          width="18"
        >
          <path d="M 3 9 Q 6 12 7 13 Q 11 7 15 4" />
        </svg>
        <span class="saved-text">{{ t('plugins.todo.labels.miniSaved') }}</span>
      </div>

      <!-- 输入态：标题 + 日期两行 -->
      <template v-else>
        <div class="title-row">
          <PawLogo :size="18" />
          <input
            ref="titleEl"
            v-model="title"
            class="title-input"
            :placeholder="t('plugins.todo.labels.miniPlaceholder')"
            type="text"
            @input="markTyping"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
        </div>
        <div class="date-row">
          <HandClock />
          <input
            v-model="dateStr"
            class="date-input"
            :title="t('plugins.todo.labels.miniDateLabel')"
            type="date"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 迷你窗尺寸与窗口 setSize 一致（280×110，留余量给阴影）。透明背景透出桌面。 */
.mini-window {
  position: relative;
  width: 100%;
  height: 100%;
  /* saved 淡出：opacity 平滑过渡到 0（spec「淡出关闭」）。 */
  transition: opacity 300ms ease-out;
}

.mini-window.is-fading {
  opacity: 0;
}

.frame-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.mini-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 18px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--ink);
}

.title-input::placeholder {
  color: var(--ink-faint);
  font-weight: 500;
}

.date-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* native date picker 是功能性控件，皮肤最小覆盖：透明背景、继承手写字体、缩小字号。
   指示器图标（日历箭头）保留浏览器默认（功能控件不强行换肤，符合视觉原则）。 */
.date-input {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-soft);
  cursor: pointer;
}

.date-input::-webkit-calendar-picker-indicator {
  opacity: 0.55;
  cursor: pointer;
}

.saved-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
}

.saved-check {
  color: #6b9c47;
  flex-shrink: 0;
}

.saved-text {
  font-size: 14px;
  font-weight: 600;
  color: #6b9c47;
}
</style>
