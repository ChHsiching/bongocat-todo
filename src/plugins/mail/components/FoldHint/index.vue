<script setup lang="ts">
/**
 * 气泡溢出折入提示条（手绘风，T2）。
 *
 * 当未处理气泡超过 3 条时，第 4 条起不展示新气泡，而是展示一行提示
 * 「还有 N 条，查看邮件列表」。点击打开邮件列表（T5 未完成，父级先 emit 一个事件占位）。
 *
 * 视觉对照 `docs/designs/phase2-exploration/bubble.html` 的 fold-hint：粉色淡描边手绘形状、
 * 尾部三角指向猫、居中文案。严禁 CSS border。
 *
 * 形状自适应：与 Bubble 同理，复用 genBubbleShape 按内容高度动态生成 path（原写死 viewBox
 * 360×44 的 path 底部 y≈32，内容若换行会溢出）。容器高度 = viewBox 高（1:1 不拉伸）。
 *
 * @see ADR 0002 D7
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { genBubbleShape } from '../../utils/bubbleShape'

defineProps<{
  /** 溢出条数（= total - 3）。 */
  count: number
}>()

defineEmits<{
  /** 点击提示条 → 打开邮件列表（T5 窗口；当前父级占位处理）。 */
  click: []
  /** 内容高度变化，父级据以重设窗口尺寸。payload = 像素高度。 */
  resize: [height: number]
}>()

const { t } = useI18n()

const filterId = `fh-sh-${Math.random().toString(36).slice(2, 8)}`

/** 纯文字高度（单行文案，初始 20）。 */
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
