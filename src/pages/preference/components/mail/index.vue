<script setup lang="ts">
import { error } from '@tauri-apps/plugin-log'
import { Button, Flex, Input, InputPassword, message } from 'antdv-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { removeAccount, testAndSaveAccount, useMailAccountStore } from '@/plugins/mail'

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

/** 常见邮箱的 IMAP 预填（tracer bullet 简化：手动填，provider 自动识别是 T3）。 */
function onAddressBlur() {
  // 邮箱地址填好后，username 默认同步（多数邮箱 username = 完整地址）
  if (!username.value) {
    username.value = address.value
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

/** 账号状态对应的展示文案。 */
function statusText(status: string): string {
  if (status === 'connected') return t('plugins.mail.labels.statusConnected')
  if (status === 'connecting') return t('plugins.mail.labels.statusConnecting')
  if (status === 'error') return t('plugins.mail.labels.statusError')
  return t('plugins.mail.labels.statusIdle')
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
