<script setup lang="ts">
/**
 * 邮件列表项（MailItem）：手绘风，视觉对照 mail-list.html。
 *
 * 三种状态（由父传入的 status + meta 决定样式）：
 * - unread：左侧红墨点标记（复用 todo ink-dot 风格的 SVG path）。
 * - read：左侧信封图标 + 弱化色 + meta 显示「已读，N 分钟后归档」。
 * - archived：左侧信封图标（更淡）+ opacity 0.7 + 「已归档」标签。
 *
 * 点击触发 action（邮件列表=标已读+跳 webmail；归档=跳 webmail）。
 * 所有线条走 SVG，严禁 CSS border。
 *
 * @see docs/designs/phase2-exploration/mail-list.html
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MailNotification } from '../../stores/mailNotification'

import { minutesUntilArchive } from '../../utils/retention'

const props = defineProps<{
  /** 邮件数据。 */
  mail: MailNotification
  /** 状态覆盖（默认取 mail.status；父可传入 read/archived 强制样式）。 */
  status?: 'unread' | 'read' | 'archived'
  /** meta 区显示的 provider 名（如「Gmail」/「QQ 邮箱」），由父解析。 */
  providerName?: string | null
  /** meta 区显示的相对时间（如「2 分钟前」/「昨天」），由父格式化。 */
  timeLabel?: string
}>()

const emit = defineEmits<{
  /** 点击邮件项（父决定标已读 + 跳 webmail）。 */
  action: [id: string]
}>()

const { t } = useI18n()

/** 实际展示状态：props.status 优先，否则取 mail.status。 */
const effectiveStatus = computed(() => props.status ?? props.mail.status)

/** 已读邮件剩余归档分钟（基于 readAt + 当前时间）。 */
const minutesLeft = computed(() =>
  props.mail.readAt ? minutesUntilArchive(props.mail.readAt, Date.now()) : 0,
)
</script>

<template>
  <div
    class="mail-item"
    :class="effectiveStatus"
    @click="emit('action', mail.id)"
  >
    <!-- 未读：红墨点（复用 todo ink-dot 的三层 path） -->
    <svg
      v-if="effectiveStatus === 'unread'"
      class="unread-dot"
      viewBox="0 0 14 14"
    >
      <path
        d="M 7 2 Q 11 2 12 5 Q 13 7 12 9 Q 11 12 7 12 Q 3 12 2 9 Q 1 7 2 5 Q 3 2 7 2 Z"
        fill="#d4654a"
        opacity="0.25"
      />
      <path
        d="M 7 3.5 Q 9.5 3.5 10.5 5.5 Q 11 7 10 8.5 Q 9 10.5 7 10.5 Q 5 10.5 4 8.5 Q 3 7 3.5 5.5 Q 4.5 3.5 7 3.5 Z"
        fill="#d4654a"
      />
    </svg>
    <!-- 已读/归档：信封图标 -->
    <div
      v-else
      class="mail-icon"
    >
      <svg
        fill="none"
        height="16"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="16"
      >
        <path d="M 4 5 Q 3 5 3 6 L 3 18 Q 3 19 4 19 L 20 19 Q 21 19 21 18 L 21 6 Q 21 5 20 5 Z" />
        <path d="M 4 6 L 12 12 L 20 6" />
      </svg>
    </div>

    <div class="mail-main">
      <div class="mail-from">
        {{ mail.from || '—' }}
      </div>
      <div class="mail-subject">
        {{ mail.subject || '—' }}
      </div>
      <div class="mail-meta">
        <span v-if="providerName">{{ providerName }}</span>
        <span v-if="providerName && (effectiveStatus !== 'read' || timeLabel)">·</span>
        <span v-if="effectiveStatus === 'read'">{{ t('plugins.mail.labels.mailReadMinutesLater', { n: minutesLeft }) }}</span>
        <template v-else-if="effectiveStatus === 'archived'">
          <span class="archived-tag">{{ t('plugins.mail.labels.mailArchivedTag') }}</span>
          <span v-if="timeLabel">·</span>
          <span v-if="timeLabel">{{ timeLabel }}</span>
        </template>
        <span v-else-if="timeLabel">{{ timeLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mail-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px;
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.mail-item:hover {
  background: rgb(244 168 160 / 8%);
}

.unread-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  margin-top: 8px;
}

.mail-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: 50%;
  background: rgb(155 196 224 / 20%);
  color: var(--ink-soft);
}

.mail-item.archived .mail-icon {
  background: rgb(196 181 160 / 15%);
  color: var(--ink-faint);
}

.mail-main {
  flex: 1;
  min-width: 0;
}

.mail-from {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--ink);
  word-break: break-word;
}

.mail-subject {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
  word-break: break-word;
}

.mail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-faint);
}

.mail-item.read .mail-from {
  font-weight: 600;
  color: var(--ink-soft);
}

.mail-item.read .mail-subject {
  color: var(--ink-faint);
}

.mail-item.archived {
  opacity: 0.7;
}

.archived-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-faint);
  background: rgb(196 181 160 / 20%);
}
</style>
