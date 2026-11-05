<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TodoPriority } from '@/plugins/todo'

import HandDateInput from '../HandDateInput/index.vue'
import PawLogo from '../PawLogo/index.vue'
import PriorityPicker from '../PriorityPicker/index.vue'

const emit = defineEmits<{
  close: []
  create: [title: string, dueDate: number | undefined, priority: TodoPriority]
}>()

const { t } = useI18n()

type State = 'idle' | 'typing' | 'saved'
const state = ref<State>('idle')
const fading = ref(false)

const title = ref('')
const titleEl = ref<HTMLInputElement | null>(null)

const priority = ref<TodoPriority>('medium')
const dueDate = ref<number | undefined>(undefined)

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

function onDateChange(value: number | undefined) {
  dueDate.value = value
  markTyping()
}

function handleDateEnter() {
  if (title.value.trim()) {
    handleSubmit()
  } else {
    titleEl.value?.focus()
  }
}

function handleSubmit() {
  const trimmed = title.value.trim()
  if (!trimmed || state.value === 'saved')
    return

  emit('create', trimmed, dueDate.value, priority.value)

  state.value = 'saved'
  holdTimer = setTimeout(() => {
    fading.value = true
  }, SAVED_HOLD_MS)
  closeTimer = setTimeout(() => {
    emit('close')
  }, SAVED_HOLD_MS + SAVED_FADE_MS)
}

function handleClose() {
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
    <svg
      class="frame-bg"
      preserveAspectRatio="none"
      viewBox="0 0 380 130"
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
      <path
        d="M 19 12 Q 21.7 10 27.1 10 L 361 12 Q 369.1 14 367.8 18 L 370.5 98 Q 367.8 104 361 104 L 24.4 102 Q 16.3 100 17.6 96 Z"
        :fill="state === 'saved' ? '#e0f0d8' : '#e8dcc8'"
        opacity="0.6"
      />
      <!-- Main frame: the original SVG is completely untouched (including the shadow layer and filter).
           When widened horizontally, the stroke/paper shadow scaling proportionally is the original's
           natural behavior, which the author confirmed accepting — no "visual enhancement" is added. -->
      <path
        d="M 14.9 9 Q 17.6 6 23.1 6.5 Q 190 5 356.9 8 Q 365.1 10 364.4 14 Q 366.4 55 363.7 98 Q 362.4 104 355.6 104.5 Q 190 106 17.6 103 Q 10.9 101 12.2 97 Q 13.6 50 14.9 9 Z"
        :fill="state === 'saved' ? '#f6fbf2' : 'var(--paper)'"
        filter="url(#mini-shadow)"
        :stroke="state === 'saved' ? '#6b9c47' : 'var(--ink)'"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <div class="mini-content">
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

      <template v-else>
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

        <div
          class="controls-row"
          data-tauri-drag-region
        >
          <PriorityPicker v-model="priority" />
          <HandDateInput
            class="date-row-wrap"
            @change="onDateChange"
            @enter="handleDateEnter"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mini-window {
  position: relative;
  width: 100%;
  height: 100%;
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

/* Content anchored inside the paper: left/right use percentages (the paper scales with the
   window, so a percentage inset hugs the inner edge of the ink border stroke at any width —
   px padding would push elements outside the border once widened, the overflow the author reported).
   At 380, 5.1% ≈ 18px, pixel-identical to the original padding; top/bottom use px since the height is fixed at 130. */
.mini-content {
  position: absolute;
  top: 14px;
  right: 5.1%;
  bottom: 14px;
  left: 5.1%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.close-btn {
  position: absolute;
  top: 6px;
  right: 3.9%;
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

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.date-row-wrap {
  flex-shrink: 0;
}

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
