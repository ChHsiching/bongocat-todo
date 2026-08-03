<script setup lang="ts">
import { error } from '@tauri-apps/plugin-log'
import { Button, Input, InputPassword, message, Switch } from 'antdv-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MailAccountStatus } from '@/plugins/mail'

import ProListItem from '@/components/pro-list-item/index.vue'
import ProList from '@/components/pro-list/index.vue'
import {
  removeAccount,
  testAndSaveAccount,
  toggleAccountEnabled,
  useMailAccountStore,
  useMailNotificationStore,
  useMailSettingsStore,
} from '@/plugins/mail'
import { matchProvider, matchProviderLogo } from '@/plugins/mail/utils/providers'

const mailAccountStore = useMailAccountStore()
const mailNotificationStore = useMailNotificationStore()
const mailSettingsStore = useMailSettingsStore()
const { t } = useI18n()

// ── 添加账号表单 ──
const address = ref('')
const imapHost = ref('')
const imapPort = ref(993)
const username = ref('')
const password = ref('')

/** 输入邮箱时实时联动的 provider logo（命中预设显示对应 logo，否则默认信封）。 */
const inputLogo = computed(() => matchProviderLogo(address.value))

/** 代理地址（双向绑定 mailSettingsStore.proxy）。 */
const proxyInput = computed({
  get: () => mailSettingsStore.proxy,
  set: (v: string) => mailSettingsStore.setProxy(v),
})

/** 「测试并保存」进行中（禁用按钮 + 显示文案）。 */
const saving = ref(false)

/** 已绑定账号（单账号阶段数组长度 ≤ 1，取第一个展示）。 */
const boundAccount = computed(() => mailAccountStore.accounts[0])

/** 添加表单是否可填（已有账号时禁用，引导用户先删再加）。 */
const canAdd = computed(() => !boundAccount.value)

/** 当前匹配到的 provider 授权码指引文案（命中内置邮箱时非空）。 */
const providerHint = ref('')

/** 当前输入匹配到的 provider IMAP 地址（展示用，表单字段仍可手改）。 */
const providerImapLabel = ref('')

/**
 * 邮箱地址 blur 时：同步 username + 按 provider 自动填充 IMAP 配置 + 展示授权码指引。
 *
 * 用户通常只知道邮箱地址，IMAP 服务器/端口/授权码来源对普通用户是门槛。
 * 本函数做 provider 识别：域名 → IMAP host/port 自动填 + 授权码获取指引。
 * IMAP 字段自动填后仍可手动改（未知邮箱需手动填）。
 */
function onAddressBlur() {
  // username 默认同步（多数邮箱 username = 完整地址）
  if (!username.value) {
    username.value = address.value
  }

  const preset = matchProvider(address.value)
  if (preset) {
    imapHost.value = preset.imapHost
    imapPort.value = preset.imapPort
    providerHint.value = t(`plugins.mail.labels.providers.${preset.hintKey}`)
    providerImapLabel.value = `${preset.imapHost}:${preset.imapPort}`
  } else {
    providerHint.value = ''
    providerImapLabel.value = ''
  }
}

async function handleTestAndSave() {
  if (!address.value || !imapHost.value || !username.value || !password.value) {
    message.warning(t('plugins.mail.labels.formIncomplete'))
    return
  }

  saving.value = true
  try {
    await testAndSaveAccount(mailAccountStore, {
      address: address.value,
      imapHost: imapHost.value,
      imapPort: imapPort.value,
      username: username.value,
      password: password.value,
    }, mailSettingsStore.proxy || null)
    message.success(t('plugins.mail.labels.connectSuccess'))
    // 清空表单
    address.value = ''
    imapHost.value = ''
    imapPort.value = 993
    username.value = ''
    password.value = ''
    providerHint.value = ''
    providerImapLabel.value = ''
  } catch (err) {
    const msg = String(err)
    await error(`mail testAndSave failed: ${msg}`)
    message.error(`${t('plugins.mail.labels.connectFailed')}: ${msg}`)
  } finally {
    saving.value = false
  }
}

/** 账号开关切换：开 → mailConnect，关 → mailDisconnect（store.enabled 同步更新）。 */
async function handleToggleEnabled(checked: boolean) {
  if (!boundAccount.value) {
    return
  }
  try {
    await toggleAccountEnabled(mailAccountStore, boundAccount.value.id, checked, mailSettingsStore.proxy || null)
  } catch (err) {
    await error(`mail toggle enabled failed: ${String(err)}`)
    message.error(`${t('plugins.mail.labels.connectFailed')}: ${String(err)}`)
  }
}

async function handleRemove() {
  if (!boundAccount.value) {
    return
  }
  try {
    await removeAccount(mailAccountStore, mailNotificationStore, boundAccount.value.id)
    message.success(t('plugins.mail.labels.removed'))
  } catch (err) {
    await error(`mail remove failed: ${String(err)}`)
    message.error(`${t('plugins.mail.labels.connectFailed')}: ${String(err)}`)
  }
}

const STATUS_TEXT: Record<MailAccountStatus, string> = {
  connected: 'statusConnected',
  connecting: 'statusConnecting',
  error: 'statusError',
  idle: 'statusIdle',
}

/** 账号状态对应的展示文案。 */
function statusText(status: MailAccountStatus): string {
  return t(`plugins.mail.labels.${STATUS_TEXT[status] ?? 'statusIdle'}`)
}

/** 账号状态圆点颜色（connected=绿 / connecting=橙 / error=红 / idle=灰）。 */
function statusColor(status: MailAccountStatus): string {
  return {
    connected: '#52c41a',
    connecting: '#faad14',
    error: '#ff4d4f',
    idle: 'rgba(0,0,0,0.25)',
  }[status]
}
</script>

<template>
  <ProList :title="t('plugins.mail.labels.accountsTitle')">
    <!-- 已绑定账号卡片（logo + 地址 + 连接状态 + IMAP 地址 + 启用开关 + 删除按钮） -->
    <div
      v-if="boundAccount"
      class="b-1 b-solid p-4 bg-elevated b-border-sec rounded-lg"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex flex-1 items-center gap-3">
          <div class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden bg-[--ant-color-fill-tertiary] rounded-lg">
            <img
              :alt="boundAccount.address"
              class="h-8 w-8 object-contain"
              :src="matchProviderLogo(boundAccount.address)"
            >
          </div>
          <div class="min-w-0 flex flex-col">
            <span class="break-all text-3.5 font-medium">{{ boundAccount.address }}</span>
            <span class="mt-1 flex items-center gap-1.5 text-3">
              <span
                class="inline-block h-1.5 w-1.5 rounded-full"
                :style="{ background: statusColor(boundAccount.status) }"
              />
              <span :style="{ color: statusColor(boundAccount.status) }">{{ statusText(boundAccount.status) }}</span>
            </span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Switch
            :checked="boundAccount.enabled"
            @change="handleToggleEnabled"
          />
          <Button
            danger
            type="link"
            @click="handleRemove"
          >
            {{ t('plugins.mail.labels.removeButton') }}
          </Button>
        </div>
      </div>
      <div class="flex flex-wrap gap-4 pl-15 pt-2 text-3 color-text-quaternary">
        <span>{{ boundAccount.imapHost }}:{{ boundAccount.imapPort }}</span>
      </div>
    </div>

    <!-- 添加账号表单（已有账号时引导先删再加） -->
    <ProListItem
      v-if="canAdd"
      vertical
    >
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.address') }}</span>
          <!-- input-with-icon：左侧 provider logo 实时联动 -->
          <div class="relative">
            <div class="pointer-events-none absolute left-2 top-1/2 z-1 h-4 w-4 flex items-center justify-center -translate-y-1/2">
              <img
                alt=""
                class="h-4 w-4 object-contain"
                :src="inputLogo"
              >
            </div>
            <Input
              v-model:value="address"
              class="pl-5!"
              :placeholder="t('plugins.mail.labels.addressPlaceholder')"
              @blur="onAddressBlur"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.password') }}</span>
          <InputPassword
            v-model:value="password"
            :placeholder="t('plugins.mail.labels.passwordPlaceholder')"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.imapHost') }}</span>
          <Input
            v-model:value="imapHost"
            :placeholder="providerImapLabel || t('plugins.mail.labels.imapHostPlaceholder')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.imapPort') }}</span>
          <Input
            v-model:value="imapPort"
            type="number"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.username') }}</span>
        <Input
          v-model:value="username"
          :placeholder="t('plugins.mail.labels.usernamePlaceholder')"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-3.5 color-text-secondary">{{ t('plugins.mail.labels.proxy') }}</span>
        <Input
          v-model:value="proxyInput"
          :placeholder="t('plugins.mail.labels.proxyPlaceholder')"
        />
        <span class="text-3 color-text-quaternary">{{ t('plugins.mail.labels.proxyHint') }}</span>
      </div>

      <!-- 提示区：自制 SVG icon（感叹号三角，非 emoji）+ 各家授权码指引 -->
      <div
        v-if="providerHint"
        class="flex items-start gap-2.5 bg-[--ant-color-fill-quaternary] p-3 text-3 leading-relaxed color-text-tertiary rounded-md"
      >
        <svg
          class="mt-0.25 h-4.5 w-4.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 2 L22 20 L2 20 Z"
            stroke="#faad14"
            stroke-linejoin="round"
            stroke-width="2"
          />
          <rect
            fill="#faad14"
            height="6"
            rx="1"
            width="2"
            x="11"
            y="9"
          />
          <circle
            cx="12"
            cy="17.5"
            fill="#faad14"
            r="1.1"
          />
        </svg>
        <div class="whitespace-pre-line">
          {{ providerHint }}
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button
          :loading="saving"
          type="primary"
          @click="handleTestAndSave"
        >
          {{ saving ? t('plugins.mail.labels.connecting') : t('plugins.mail.labels.testAndSave') }}
        </Button>
      </div>
    </ProListItem>

    <div
      v-else
      class="text-3 color-text-quaternary"
    >
      {{ t('plugins.mail.labels.singleAccountHint') }}
    </div>
  </ProList>

  <!-- 通知设置三开关 -->
  <ProList :title="t('plugins.mail.labels.notificationTitle')">
    <ProListItem :title="t('plugins.mail.labels.bubbleEnabledTitle')">
      <Switch
        :checked="mailSettingsStore.bubbleEnabled"
        @change="mailSettingsStore.setBubbleEnabled"
      />
    </ProListItem>
    <ProListItem
      :description="t('plugins.mail.labels.bubbleAutoDismissDesc')"
      :title="t('plugins.mail.labels.bubbleAutoDismissTitle')"
    >
      <Switch
        :checked="mailSettingsStore.bubbleAutoDismiss"
        @change="mailSettingsStore.setBubbleAutoDismiss"
      />
    </ProListItem>
    <ProListItem
      :description="t('plugins.mail.labels.unreadOnlyDesc')"
      :title="t('plugins.mail.labels.unreadOnlyTitle')"
    >
      <Switch
        :checked="mailSettingsStore.unreadOnly"
        @change="mailSettingsStore.setUnreadOnly"
      />
    </ProListItem>
  </ProList>
</template>
