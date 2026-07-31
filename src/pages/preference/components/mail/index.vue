<script setup lang="ts">
import { error } from '@tauri-apps/plugin-log'
import { Alert, Button, Flex, Input, InputPassword, message } from 'antdv-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MailAccountStatus } from '@/plugins/mail'

import { removeAccount, testAndSaveAccount, useMailAccountStore } from '@/plugins/mail'
import { matchProvider } from '@/plugins/mail/utils/providers'

const mailAccountStore = useMailAccountStore()
const { t } = useI18n()

const address = ref('')
const imapHost = ref('')
const imapPort = ref(993)
const username = ref('')
const password = ref('')

/** 「测试并保存」进行中（禁用按钮 + 显示文案）。 */
const saving = ref(false)

/** 已绑定账号（单账号阶段数组长度 ≤ 1，取第一个展示）。 */
const boundAccount = computed(() => mailAccountStore.accounts[0])

/** 添加表单是否可填（已有账号时禁用，引导用户先删再加）。 */
const canAdd = computed(() => !boundAccount.value)

/** 当前匹配到的 provider 授权码指引文案（命中内置邮箱时非空）。 */
const providerHint = ref('')

/**
 * 邮箱地址 blur 时：同步 username + 按 provider 自动填充 IMAP 配置 + 展示授权码指引。
 *
 * 用户通常只知道邮箱地址，IMAP 服务器/端口/授权码来源对普通用户是门槛。
 * 本函数做 T1 简化版 provider 识别：域名 → IMAP host/port 自动填 + 授权码获取指引。
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
  } else {
    providerHint.value = ''
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
    })
    message.success(t('plugins.mail.labels.connectSuccess'))
    // 清空表单
    address.value = ''
    imapHost.value = ''
    imapPort.value = 993
    username.value = ''
    password.value = ''
    providerHint.value = ''
  } catch (err) {
    const msg = String(err)
    await error(`mail testAndSave failed: ${msg}`)
    message.error(`${t('plugins.mail.labels.connectFailed')}: ${msg}`)
  } finally {
    saving.value = false
  }
}

async function handleRemove() {
  if (!boundAccount.value) {
    return
  }
  try {
    await removeAccount(mailAccountStore, boundAccount.value.id)
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
</script>

<template>
  <Flex
    class="w-full"
    vertical
  >
    <h2 class="mb-4 font-bold text-lg">
      {{ t('plugins.mail.labels.bindTitle') }}
    </h2>

    <!-- 已绑定账号列表 -->
    <div
      v-if="boundAccount"
      class="mb-6 b-solid p-4 b b-border rounded-lg"
    >
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="font-bold">
            {{ boundAccount.address }}
          </div>
          <div class="mt-1 text-gray-500 text-sm">
            {{ boundAccount.imapHost }}:{{ boundAccount.imapPort }}
          </div>
          <div class="mt-1 text-sm">
            {{ t('plugins.mail.labels.statusLabel') }}: {{ statusText(boundAccount.status) }}
          </div>
        </div>
        <Button
          danger
          type="link"
          @click="handleRemove"
        >
          {{ t('plugins.mail.labels.removeButton') }}
        </Button>
      </div>
    </div>

    <!-- 添加账号表单（已有账号时禁用） -->
    <Flex
      v-if="canAdd"
      class="max-w-480px w-full"
      gap="middle"
      vertical
    >
      <div>
        <label class="mb-1 block text-sm">{{ t('plugins.mail.labels.address') }}</label>
        <Input
          v-model:value="address"
          :placeholder="t('plugins.mail.labels.addressPlaceholder')"
          @blur="onAddressBlur"
        />
      </div>

      <!-- provider 命中时展示该邮箱的授权码获取指引 -->
      <Alert
        v-if="providerHint"
        class="w-full!"
        :message="providerHint"
        type="info"
      />

      <Flex gap="middle">
        <div class="flex-1">
          <label class="mb-1 block text-sm">{{ t('plugins.mail.labels.imapHost') }}</label>
          <Input
            v-model:value="imapHost"
            :placeholder="t('plugins.mail.labels.imapHostPlaceholder')"
          />
        </div>
        <div class="w-100px">
          <label class="mb-1 block text-sm">{{ t('plugins.mail.labels.imapPort') }}</label>
          <Input
            v-model:value="imapPort"
            type="number"
          />
        </div>
      </Flex>

      <div>
        <label class="mb-1 block text-sm">{{ t('plugins.mail.labels.username') }}</label>
        <Input
          v-model:value="username"
          :placeholder="t('plugins.mail.labels.usernamePlaceholder')"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm">{{ t('plugins.mail.labels.password') }}</label>
        <InputPassword
          v-model:value="password"
          :placeholder="t('plugins.mail.labels.passwordPlaceholder')"
        />
        <div class="mt-1 text-gray-400 text-xs">
          {{ t('plugins.mail.labels.passwordHint') }}
        </div>
      </div>

      <Button
        :loading="saving"
        type="primary"
        @click="handleTestAndSave"
      >
        {{ saving ? t('plugins.mail.labels.connecting') : t('plugins.mail.labels.testAndSave') }}
      </Button>
    </Flex>

    <div
      v-else
      class="text-gray-400 text-sm"
    >
      {{ t('plugins.mail.labels.singleAccountHint') }}
    </div>
  </Flex>
</template>
