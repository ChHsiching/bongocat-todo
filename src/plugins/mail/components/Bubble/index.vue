<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { genBubbleShape } from '../../utils/bubbleShape'

/** Bubble type (prop, reserved for the T6 todo bubble). */
type BubbleType = 'mail' | 'todo'

const props = defineProps<{
  type: BubbleType
  source: string
  title: string
  subtitle: string
  urgent?: boolean
  width?: number
}>()

const emit = defineEmits<{
  close: []
  action: []
  /**
   * Content size changed (text wrapped / long link); the parent uses it to reset the window size.
   * payload = { height: text-only height, naturalWidth: the content's natural width (unconstrained, including padding) }.
   */
  resize: [height: number, naturalWidth: number]
}>()

const { t } = useI18n()

/** The SVG filter id must be unique within the window; a random suffix avoids clashes when multiple bubbles stack. */
const filterId = `b-sh-${Math.random().toString(36).slice(2, 8)}`

/**
 * Text-only height (px, excluding padding). Determined by a ResizeObserver measuring .bubble-content's
 * getBoundingClientRect().height (the content has no top/bottom padding, only left/right padding).
 * Initial 60 (a single-line estimate from the design), corrected to the real value by the observer after the first frame.
 */
const textHeight = ref(60)

const naturalWidth = ref(0)

const shape = computed(() => genBubbleShape(textHeight.value, props.width))

const rootEl = ref<HTMLElement | null>(null)

const contentEl = ref<HTMLElement | null>(null)

let ro: ResizeObserver | undefined

function measureContent() {
  const el = contentEl.value
  if (!el) {
    return
  }
  const h = Math.round(el.getBoundingClientRect().height)
  const nw = el.scrollWidth
  const hChanged = h > 0 && h !== textHeight.value
  const wChanged = nw > 0 && nw !== naturalWidth.value
  if (hChanged) {
    textHeight.value = h
  }
  if (wChanged) {
    naturalWidth.value = nw
  }
  if (hChanged || wChanged) {
    emit('resize', h, nw)
  }
}

watch(contentEl, (el) => {
  if (ro) {
    ro.disconnect()
  }
  if (!el) {
    return
  }
  ro = new ResizeObserver(() => measureContent())
  ro.observe(el)
  measureContent()
})
</script>

<template>
  <div
    ref="rootEl"
    class="bubble"
    :style="{ height: `${shape.height}px`, width: `${shape.width}px` }"
    @click="emit('action')"
  >
    <svg
      class="bubble-bg"
      :height="shape.height"
      preserveAspectRatio="none"
      :viewBox="shape.viewBox"
      :width="shape.width"
    >
      <defs>
        <filter
          :id="filterId"
          height="135%"
          width="120%"
          x="-10%"
          y="-10%"
        >
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation="2.5"
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
        :d="shape.shadowD"
        fill="var(--paper-shadow)"
        opacity="0.6"
      />
      <path
        :d="shape.mainD"
        fill="#fff"
        :filter="`url(#${filterId})`"
        stroke="var(--ink)"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2.5"
      />
      <path
        :d="shape.waveD"
        fill="none"
        opacity="0.6"
        :stroke="type === 'todo' ? 'var(--red-ink)' : 'var(--pink)'"
        stroke-linecap="round"
        stroke-width="1.8"
      />
    </svg>

    <div
      ref="contentEl"
      class="bubble-content"
      :style="{ top: `${shape.contentTop}px` }"
    >
      <div
        class="source-icon"
        :class="type"
      >
        <template v-if="type === 'mail'">
          <svg
            fill="none"
            height="20"
            stroke="#5a85b0"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="20"
          >
            <rect
              height="13"
              rx="2.5"
              width="18"
              x="3"
              y="6"
            />
            <path d="M 4 8 Q 12 13 20 8" />
          </svg>
        </template>
        <template v-else>
          <svg
            fill="none"
            height="20"
            stroke="#d4654a"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M 12 2 Q 18 2 21 6 Q 23 9 22.5 13 Q 21.5 19 16 21 Q 12 22 8 21 Q 3 19 2.5 13.5 Q 2 9 4 6 Q 6 2 12 2 Z" />
            <path d="M 12 12 Q 12 8 13 6" />
            <path d="M 12 12 Q 16 12 18 11" />
            <circle
              cx="12"
              cy="12"
              fill="#d4654a"
              r="0.8"
              stroke="none"
            />
          </svg>
        </template>
      </div>

      <div class="bubble-body">
        <div class="bubble-source">
          {{ source }}
        </div>
        <div class="bubble-title">
          {{ title }}
        </div>
        <div
          class="bubble-subtitle"
          :class="{ urgent }"
        >
          {{ subtitle }}
        </div>
      </div>

      <button
        :aria-label="t('plugins.mail.labels.bubbleClose')"
        class="bubble-close"
        type="button"
        @click.stop="emit('close')"
      >
        <svg
          fill="none"
          height="18"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2.5"
          viewBox="0 0 24 24"
          width="18"
        >
          <path d="M 6 6 Q 9.5 13 19 19" />
          <path d="M 18 6 Q 8.5 10 5 18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bubble {
  position: relative;
  cursor: pointer;
  user-select: none;
}

.bubble-bg {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  pointer-events: none;
}

.bubble-content {
  position: absolute;
  left: 0;
  width: 100%;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-left: 20px;
  padding-right: 20px;
  box-sizing: border-box;
}

.source-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.source-icon.mail {
  background: rgb(155 196 224 / 25%);
}

.source-icon.todo {
  background: rgb(244 168 160 / 20%);
}

.bubble-body {
  flex: 1;
  min-width: 0;
}

.bubble-source {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-faint);
}

.bubble-title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--ink);
  overflow-wrap: break-word;
}

.bubble-subtitle {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  overflow-wrap: break-word;
}

.bubble-subtitle.urgent {
  font-weight: 600;
  color: var(--red-ink);
}

.bubble-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-faint);
  cursor: pointer;
  transition: color 0.2s;
}

.bubble-close:hover {
  color: var(--ink);
}
</style>
