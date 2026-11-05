<script setup lang="ts">
/**
 * Bubble overflow fold-in hint bar (hand-drawn style, T2).
 *
 * When more than 3 bubbles are pending, from the 4th on no new bubble is shown; instead a one-line hint is shown:
 * "N more, view the mail list". Clicking opens the mail list (T5 not done yet, so the parent first emits a placeholder event).
 *
 * Visuals follow the fold-hint in `docs/designs/phase2-exploration/bubble.html`: a hand-drawn shape with a pale pink stroke,
 * a tail triangle pointing at the cat, centered copy. Never use CSS borders.
 *
 * Shape adaptation: same idea as Bubble, reusing genBubbleShape to generate the path dynamically from the content height
 * (the original hard-coded viewBox 360×44 path had bottom y≈32; wrapped content would overflow). Container height = viewBox height (1:1, no stretching).
 *
 * @see ADR 0002 D7
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { genBubbleShape } from '../../utils/bubbleShape'

defineProps<{
  /** Overflow count (= total - 3). */
  count: number
}>()

const emit = defineEmits<{
  /** Click the hint bar → open the mail list (the T5 window is implemented). */
  click: []
  /** Content height changed; the parent uses it to reset the window size. payload = height in pixels. */
  resize: [height: number]
}>()

const { t } = useI18n()

const filterId = `fh-sh-${Math.random().toString(36).slice(2, 8)}`

/** Text-only height (single-line copy, initial 20). */
const textHeight = ref(20)

const shape = computed(() => genBubbleShape(textHeight.value))

const contentEl = ref<HTMLElement | null>(null)

let ro: ResizeObserver | undefined

function measureContent() {
  const el = contentEl.value
  if (!el) {
    return
  }
  const h = Math.round(el.getBoundingClientRect().height)
  if (h > 0 && h !== textHeight.value) {
    textHeight.value = h
    emit('resize', h)
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
    class="fold-hint"
    :style="{ height: `${shape.height}px` }"
    @click="$emit('click')"
  >
    <svg
      class="fh-bg"
      :height="shape.height"
      preserveAspectRatio="none"
      :viewBox="shape.viewBox"
      width="360"
    >
      <defs>
        <filter
          :id="filterId"
          height="140%"
          width="120%"
          x="-10%"
          y="-10%"
        >
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation="2"
          />
          <feOffset
            dx="1"
            dy="2"
          />
          <feComponentTransfer><feFuncA
            slope="0.1"
            type="linear"
          /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path
        :d="shape.mainD"
        fill="#fff8f6"
        :filter="`url(#${filterId})`"
        stroke="var(--pink)"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
    <div
      ref="contentEl"
      class="fh-content"
      :style="{ top: `${shape.contentTop}px` }"
    >
      {{ t('plugins.mail.labels.bubbleFold', { n: count }) }}
    </div>
  </div>
</template>

<style scoped>
.fold-hint {
  position: relative;
  width: 360px;
  cursor: pointer;
  user-select: none;
}

.fh-bg {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  pointer-events: none;
}

.fh-content {
  position: absolute;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-left: 20px;
  padding-right: 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--pink-deep);
}
</style>
