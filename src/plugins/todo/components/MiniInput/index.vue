<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import HandClock from '../HandClock/index.vue'
import PawLogo from '../PawLogo/index.vue'

/**
 * 迷你输入窗（MiniInput / T5）。
 *
 * 定位锚点是桌宠（main 窗口）上方偏右，而非光标——实测桌宠右键菜单弹出位置距光标远，
 * 跟随光标会让迷你窗出现在意料外的地方。
 *
 * 三态：idle（占位符）→ typing（用户输入）→ saved（绿色「已添加」整窗居中放大，淡出后关闭）。
 * 布局：
 *   Row1 = PawLogo（拖动）+ 标题 input + 关闭×
 *   Row2 = 日历图标 + 年/月/日 input + 中间留白（拖动）+ 时:分 input + 时钟图标
 *
 * 日期时间全部手写数字输入框（无日历弹层、无 antd 依赖），皮肤完全手绘可控。
 *
 * 拖动：猫爪、Row2 中间留白显式挂 data-tauri-drag-region；input/button 天然豁免仍可交互。
 *
 * 关闭路径：右上角 × / Esc / 提交后淡出 timer。**不**用 input blur 或窗口失焦自动关闭
 * （前者会破坏 tab 到下一框）。
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
/** saved 态淡出标志：true 时整个迷你窗 opacity→0 平滑淡出。 */
const fading = ref(false)

const title = ref('')
const titleEl = ref<HTMLInputElement | null>(null)

// ── 日期时间输入（纯数字字符串，空串=未填）──
const year = ref('')
const month = ref('')
const day = ref('')
const hour = ref('')
const minute = ref('')

/** 日期部分（年月日）是否完整填写。 */
const hasDate = computed(() => year.value !== '' && month.value !== '' && day.value !== '')
/** 时间部分（时分）是否完整填写；未填则默认 09:00。 */
const hasTime = computed(() => hour.value !== '' && minute.value !== '')

/**
 * 提交用 timestamp：日期必填（年月日都填），时间可选（未填默认 09:00）。
 * 日期/时间都未填 → undefined（无到期日的普通 todo）。
 * 用 new Date(y, m-1, d, h, m) 构造本地时间，避开 UTC 偏移。
 */
const dueTimestamp = computed<number | undefined>(() => {
  if (!hasDate.value)
    return undefined
  const y = Number(year.value)
  const m = Number(month.value)
  const d = Number(day.value)
  // 合法性校验：用 Date 构造后回读对比，非法日期（如 2/30）Date 会溢出到下月。
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d)
    return undefined
  const h = hasTime.value ? Number(hour.value) : 9
  const min = hasTime.value ? Number(minute.value) : 0
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
})

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

/** 数字输入框：限制只能输数字，并 clamp 到合法范围。 */
function clampInt(value: string, min: number, max: number): string {
  if (value === '')
    return ''
  const n = Number(value)
  if (Number.isNaN(n))
    return ''
  return String(Math.max(min, Math.min(n, max)))
}

function onYearInput() {
  // 年不限上限，但去掉非数字，最多 4 位
  year.value = year.value.replace(/\D/g, '').slice(0, 4)
  markTyping()
}

function onMonthInput() {
  month.value = clampInt(month.value.replace(/\D/g, ''), 1, 12)
  markTyping()
}

function onDayInput() {
  day.value = clampInt(day.value.replace(/\D/g, ''), 1, 31)
  markTyping()
}

function onHourInput() {
  hour.value = clampInt(hour.value.replace(/\D/g, ''), 0, 23)
  markTyping()
}

function onMinuteInput() {
  minute.value = clampInt(minute.value.replace(/\D/g, ''), 0, 59)
  markTyping()
}

function handleSubmit() {
  const trimmed = title.value.trim()
  if (!trimmed || state.value === 'saved')
    return

  emit('create', trimmed, dueTimestamp.value)

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
      viewBox="0 0 280 130"
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
      <!-- 右上角关闭 ×（复用 TodoPanel 的手绘 × path，缩小到 16px） -->
      <button
        class="close-btn"
        :title="t('plugins.todo.labels.closeButton')"
        type="button"
        @click="handleClose"
      >
        <svg
          fill="none"
          height="16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="16"
        >
          <path d="M 6 6 Q 9.5 13 19 19" />
          <path d="M 18 6 Q 8.5 10 5 18" />
        </svg>
      </button>

      <!-- saved 态：整窗上下居中放大显示「已添加」+ 手绘对勾 -->
      <div
        v-if="state === 'saved'"
        class="saved-view"
      >
        <svg
          class="saved-check"
          fill="none"
          height="28"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="3"
          viewBox="0 0 18 18"
          width="28"
        >
          <path d="M 3 9 Q 6 12 7 13 Q 11 7 15 4" />
        </svg>
        <span class="saved-text">{{ t('plugins.todo.labels.miniSaved') }}</span>
      </div>

      <!-- 输入态：标题 + 日期两行。
           可拖动区显式挂 data-tauri-drag-region（爪印、时钟、中间留白），
           input/button 天然豁免仍可交互。布局：时钟在最左、日期框贴最右、中间留白拖动。 -->
      <template v-else>
        <!-- Row1：整行 drag-region（学 TodoPanel .panel-header 模式）。
             爪印设 pointer-events:none 透传给行 drag-region；title input 天然豁免仍可交互。 -->
        <div
          class="title-row"
          data-tauri-drag-region
        >
          <span class="paw-deco">
            <PawLogo :size="18" />
          </span>
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

        <!-- Row2：整行 drag-region（学 TodoPanel .panel-header 模式）。
             日历图标/时钟图标/分隔符设 pointer-events:none 透传给行 drag-region；
             年月日时分 input 天然豁免仍可交互。这样整行空白（input 之间）都能拖动窗口。 -->
        <div
          class="date-row"
          data-tauri-drag-region
        >
          <span class="icon-deco">
            <HandClock />
          </span>
          <input
            v-model="year"
            class="num-input num-year"
            inputmode="numeric"
            :placeholder="t('plugins.todo.labels.miniYearPh')"
            :title="t('plugins.todo.labels.miniYearLabel')"
            type="text"
            @input="onYearInput"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
          <span class="num-sep">-</span>
          <input
            v-model="month"
            class="num-input num-md"
            inputmode="numeric"
            :placeholder="t('plugins.todo.labels.miniMonthPh')"
            :title="t('plugins.todo.labels.miniMonthLabel')"
            type="text"
            @input="onMonthInput"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
          <span class="num-sep">-</span>
          <input
            v-model="day"
            class="num-input num-md"
            inputmode="numeric"
            :placeholder="t('plugins.todo.labels.miniDayPh')"
            :title="t('plugins.todo.labels.miniDayLabel')"
            type="text"
            @input="onDayInput"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
          <!-- 中间留白：行本身是 drag-region，此 div 只占位撑开间距。 -->
          <span class="date-gap" />
          <input
            v-model="hour"
            class="num-input num-md"
            inputmode="numeric"
            :placeholder="t('plugins.todo.labels.miniHourPh')"
            :title="t('plugins.todo.labels.miniHourLabel')"
            type="text"
            @input="onHourInput"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
          <span class="num-sep">:</span>
          <input
            v-model="minute"
            class="num-input num-md"
            inputmode="numeric"
            :placeholder="t('plugins.todo.labels.miniMinutePh')"
            :title="t('plugins.todo.labels.miniMinuteLabel')"
            type="text"
            @input="onMinuteInput"
            @keydown.enter.prevent="handleSubmit"
            @keydown.esc.prevent="handleClose"
          >
          <span class="icon-deco">
            <HandClock />
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 迷你窗尺寸与窗口 setSize 一致（280×110）。透明背景透出桌面。 */
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
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 14px 18px;
  box-sizing: border-box;
}

/* 右上角关闭 × */
.close-btn {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: none;
  border: none;
  color: var(--ink-faint);
  cursor: pointer;
  transition: color 0.2s;
  font-family: inherit;
  z-index: 2;
}

.close-btn:hover {
  color: var(--ink);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

/* 爪印：装饰，pointer-events:none 让点击/拖动透传给行 drag-region（TodoPanel proven 模式）。 */
.paw-deco {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  pointer-events: none;
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
  gap: 5px;
}

/* 日历图标（左）+ 时钟图标（右）：装饰，pointer-events:none 透传给行 drag-region。 */
.icon-deco {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  pointer-events: none;
}

/* 手写数字输入框：年/月/日/时/分统一皮肤（851 字体/加粗/粉墨色/透明无边框）。 */
.num-input {
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  text-align: center;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-soft);
}

.num-input::placeholder {
  color: var(--ink-faint);
  font-weight: 500;
}

.num-input:focus {
  color: var(--ink);
}

/* 年 4 位宽，月/日/时/分 2 位宽。 */
.num-year {
  width: 38px;
}

.num-md {
  width: 22px;
}

/* 分隔符 - / :（装饰，透传 drag-region） */
.num-sep {
  flex-shrink: 0;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-faint);
  pointer-events: none;
}

/* 中间留白：撑开日期组与时间组的间距，行本身是 drag-region 所以这里空白也能拖。 */
.date-gap {
  flex: 1 1 auto;
  min-width: 12px;
}

/* saved 态：整窗上下居中放大，对勾也放大。 */
.saved-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.saved-check {
  color: #6b9c47;
  flex-shrink: 0;
}

.saved-text {
  font-size: 18px;
  font-weight: 700;
  color: #6b9c47;
}
</style>
