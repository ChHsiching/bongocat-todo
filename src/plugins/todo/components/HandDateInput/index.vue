<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import HandClock from '../HandClock/index.vue'

/**
 * Handwritten date-time input (HandDateInput): avoids native `<input type="date">` —
 * WebView2 garbles the placeholder.
 */
const emit = defineEmits<{
  change: [dueDate: number | undefined]
  enter: []
}>()

const { t } = useI18n()

const year = ref('')
const month = ref('')
const day = ref('')
const hour = ref('')
const minute = ref('')

const hasDate = computed(() => year.value !== '' && month.value !== '' && day.value !== '')
const hasTime = computed(() => hour.value !== '' && minute.value !== '')

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

function emitChange() {
  emit('change', dueTimestamp.value)
}

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
  const el = e.target as HTMLInputElement
  el.select()
}

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

.icon-deco {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  pointer-events: none;
}

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

.num-year {
  width: 38px;
}

.num-md {
  width: 22px;
}

.num-sep {
  flex-shrink: 0;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-faint);
  pointer-events: none;
}

.date-gap {
  flex: 1 1 auto;
  min-width: 12px;
}
</style>
