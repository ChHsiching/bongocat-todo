<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { NewMailPayload } from '../../index'

defineProps<{
  /** 气泡内容（发件人 + 主题）。 */
  mail: NewMailPayload
}>()

const emit = defineEmits<{
  /** 关闭气泡（点击气泡体或右上角 × 都触发，T1 都是单纯消失，T2 加打开 webmail）。 */
  close: []
}>()

const { t } = useI18n()
</script>

<template>
  <!--
    T1 tracer bullet 最简气泡：普通矩形 + 文字 + 右上角 ×。
    手绘圆胖风是 T2 的事，这里只验证端到端链路。
    整气泡可点击（=关闭）；× 按钮也关闭。点击事件用 .stop 防止与气泡体重复触发。
  -->
  <div
    class="bubble"
    data-tauri-drag-region="false"
    @click="emit('close')"
  >
    <div class="bubble-content">
      <div class="bubble-from">
        {{ t('plugins.mail.labels.bubbleFrom') }}{{ mail.from }}
      </div>
      <div class="bubble-subject">
        {{ mail.subject }}
      </div>
    </div>
    <button
      class="bubble-close"
      type="button"
      @click.stop="emit('close')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.bubble {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 12px rgb(0 0 0 / 12%);
  cursor: pointer;
  user-select: none;
}

.bubble-content {
  flex: 1;
  min-width: 0;
}

.bubble-from {
  font-size: 12px;
  font-weight: 600;
  color: #4a3a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bubble-subject {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: #6b5b4f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bubble-close {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9b8b7f;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.bubble-close:hover {
  background: rgb(0 0 0 / 6%);
  color: #4a3a2e;
}
</style>
