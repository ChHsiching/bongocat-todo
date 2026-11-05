<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import HandClock from '../HandClock/index.vue'

/**
 * Handwritten date-time input (HandDateInput / T6).
 *
 * Extracted from the T5 mini input window's "5 handwritten digit boxes" pattern (year/month/day + hour:minute)
 * for reuse in the main panel's create form. Avoids native `<input type="date">` (WebView2 garbles the
 * placeholder) and antd DatePicker (popup overflow + corporate blue skin); the skin is fully hand-drawn and
 * controllable (see CONTEXT.md "pitfalls list · native date input unusable in WebView2").
 *
 * emit `change`: reports the computed timestamp (undefined when the date is not fully filled) to the
 * parent on every input change. The parent uses this value as the dueDate argument of createTodo.
 *
 * "Focus auto-fills the current time": when any box gains focus and all are empty, the current system
 * time's year/month/day/hour/minute is filled in automatically and the focused box's text is selected —
 * one click gives the user a complete time that only needs a few digits tweaked, instead of typing a
 * long string from scratch. Existing values are not overwritten (user-entered content is preserved).
 *
 * Dragging: the row carries data-tauri-drag-region; icon/separators pass clicks through via
 * pointer-events:none; inputs are naturally exempt.
 *
 * @see src/plugins/todo/components/MiniInput/index.vue origin of the T5 pattern
 */
const emit = defineEmits<{
  change: [dueDate: number | undefined]
  enter: []
}>()

const { t } = useI18n()

// ── Date-time inputs (digit-only strings, empty string = not filled) ──
const year = ref('')
const month = ref('')
const day = ref('')
const hour = ref('')
const minute = ref('')

/** Whether the date part (year/month/day) is fully filled. */
const hasDate = computed(() => year.value !== '' && month.value !== '' && day.value !== '')
/** Whether the time part (hour/minute) is fully filled; defaults to 09:00 when empty. */
const hasTime = computed(() => hour.value !== '' && minute.value !== '')

/**
 * Timestamp for submission: the date is required (year/month/day all filled), the time is optional (defaults to 09:00 when empty).
 * Neither date nor time filled → undefined (a plain todo without a due date).
 * Builds local time via new Date(y, m-1, d, h, m), avoiding UTC offsets.
 */
const dueTimestamp = computed<number | undefined>(() => {
  if (!hasDate.value)
    return undefined
  const y = Number(year.value)
  const m = Number(month.value)
  const d = Number(day.value)
  // Validity check: construct a Date and read it back to compare; invalid dates (e.g. 2/30) overflow into the next month.
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d)
    return undefined
  const h = hasTime.value ? Number(hour.value) : 9
  const min = hasTime.value ? Number(minute.value) : 0
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
})

/** Emit the change (called after every input event fires). */
function emitChange() {
  emit('change', dueTimestamp.value)
}

/**
 * When any box gains focus: if all are empty, fill in the current system time (year/month/day/hour/minute),
 * then select the focused box's text (easy to overwrite wholesale or tweak). Existing values are not overwritten.
 *
 * This way one click on any box gives the user a complete time; only the digits that need changing
 * are edited, sparing a long string of typing.
 */
function onFocusFillNow(e: FocusEvent) {
  const allEmpty = !year.value && !month.value && !day.value && !hour.value && !minute.value
  if (allEmpty) {
    const now = new Date()
    year.value = String(now.getFullYear())
    month.value = String(now.getMonth() + 1)
    day.value = String(now.getDate())
    hour.value = String(now.getHours())
    minute.value = String(now.getMinutes())
    emitChange()
  }
  // Select the focused box's text (whether just auto-filled or not, it eases wholesale overwrite or targeted editing).
  const el = e.target as HTMLInputElement
  el.select()
}

/** Numeric input handling: restrict to digits only and clamp to the valid range. */
function clampInt(value: string, min: number, max: number): string {
  if (value === '')
    return ''
  const n = Number(value)
  if (Number.isNaN(n))
    return ''
  return String(Math.max(min, Math.min(n, max)))
}

function onYearInput() {
  year.value = year.value.replace(/\D/g, '').slice(0, 4)
  emitChange()
}

function onMonthInput() {
  month.value = clampInt(month.value.replace(/\D/g, ''), 1, 12)
  emitChange()
}

function onDayInput() {
  day.value = clampInt(day.value.replace(/\D/g, ''), 1, 31)
  emitChange()
}

function onHourInput() {
  hour.value = clampInt(hour.value.replace(/\D/g, ''), 0, 23)
  emitChange()
}

function onMinuteInput() {
  minute.value = clampInt(minute.value.replace(/\D/g, ''), 0, 59)
  emitChange()
}

defineExpose({ reset: () => {
  year.value = ''
  month.value = ''
  day.value = ''
  hour.value = ''
  minute.value = ''
} })
</script>

<template>
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
      @focus="onFocusFillNow"
      @input="onYearInput"
      @keydown.enter.prevent="emit('enter')"
    >
    <span class="num-sep">-</span>
    <input
      v-model="month"
      class="num-input num-md"
      inputmode="numeric"
      :placeholder="t('plugins.todo.labels.miniMonthPh')"
      :title="t('plugins.todo.labels.miniMonthLabel')"
      type="text"
      @focus="onFocusFillNow"
      @input="onMonthInput"
      @keydown.enter.prevent="emit('enter')"
    >
    <span class="num-sep">-</span>
    <input
      v-model="day"
      class="num-input num-md"
      inputmode="numeric"
      :placeholder="t('plugins.todo.labels.miniDayPh')"
      :title="t('plugins.todo.labels.miniDayLabel')"
      type="text"
      @focus="onFocusFillNow"
      @input="onDayInput"
      @keydown.enter.prevent="emit('enter')"
    >
    <span class="date-gap" />
    <input
      v-model="hour"
      class="num-input num-md"
      inputmode="numeric"
      :placeholder="t('plugins.todo.labels.miniHourPh')"
      :title="t('plugins.todo.labels.miniHourLabel')"
      type="text"
      @focus="onFocusFillNow"
      @input="onHourInput"
      @keydown.enter.prevent="emit('enter')"
    >
    <span class="num-sep">:</span>
    <input
      v-model="minute"
      class="num-input num-md"
      inputmode="numeric"
      :placeholder="t('plugins.todo.labels.miniMinutePh')"
      :title="t('plugins.todo.labels.miniMinuteLabel')"
      type="text"
      @focus="onFocusFillNow"
      @input="onMinuteInput"
      @keydown.enter.prevent="emit('enter')"
    >
  </div>
</template>

<style scoped>
.date-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* Clock icon: decorative; pointer-events:none passes clicks through to the row's drag-region. */
.icon-deco {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  pointer-events: none;
}

/* Handwritten digit input boxes: uniform skin for year/month/day/hour/minute (851 font/bold/pink-ink color/transparent borderless). */
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

/* Year is 4 digits wide; month/day/hour/minute are 2 digits wide. */
.num-year {
  width: 38px;
}

.num-md {
  width: 22px;
}

/* Separators - / : (decorative, pass through to the drag-region) */
.num-sep {
  flex-shrink: 0;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-faint);
  pointer-events: none;
}

/* Middle gap: stretches the spacing between the date group and the time group; the row itself is a drag-region, so this blank space is draggable too. */
.date-gap {
  flex: 1 1 auto;
  min-width: 12px;
}
</style>
