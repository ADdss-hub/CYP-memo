<!--
  账号找回页面（仅个人令牌）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="auth-shell">
    <div class="auth-card recover-card">
      <div class="recover-header">
        <BrandMark size="xl" class="recover-brand" />
        <h1 class="recover-title">找回账号</h1>
        <p class="recover-subtitle">通过个人令牌找回您的账号</p>
      </div>

      <!-- 使用令牌找回账号 -->
      <form v-if="step === 1" class="recover-form" @submit.prevent="handleRecoveryByToken">
        <div class="form-group">
          <label for="token" class="form-label">个人令牌</label>
          <textarea
            id="token"
            v-model="form.token"
            class="form-textarea"
            placeholder="请输入您的个人令牌"
            rows="4"
            required
          />
          <p class="form-hint">请输入您注册时获得的个人令牌</p>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <Button type="primary" size="large" block :loading="loading" @click="handleRecoveryByToken">
          查询账号
        </Button>

        <div class="form-links">
          <router-link to="/login" class="link"> 返回登录 </router-link>
        </div>
      </form>

      <!-- 显示找回的账号 -->
      <div v-if="step === 2" class="recover-form">
        <div class="success-box">
          <SuccessFilled />
          <p>账号找回成功</p>
        </div>

        <div class="account-display">
          <div class="account-item">
            <span class="label">您的账号：</span>
            <span class="value">{{ recoveredUsername }}</span>
          </div>
        </div>

        <div class="info-box">
          <InfoFilled />
          <p>您现在可以使用此账号和密码登录系统</p>
        </div>

        <Button type="primary" size="large" block @click="goToLogin"> 前往登录 </Button>
      </div>

      <!-- 底部版权信息 -->
      <div class="recover-footer">
        <div class="footer-brand">
          <span class="brand-name">{{ copyrightLines.line1 }}</span>
          <span class="brand-author">{{ copyrightLines.line2 }}</span>
        </div>
        <div class="footer-copyright">
          <span>{{ copyrightLines.line3 }}</span>
          <span class="separator">·</span>
          <span>{{ copyrightLines.line4 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '../../composables/useToast'
import { storageManager, VERSION } from '@cyp-memo/shared'
import type { RemoteStorageAdapter } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import BrandMark from '../../components/BrandMark.vue'
import { InfoFilled, SuccessFilled } from '@element-plus/icons-vue'

const router = useRouter()
const toast = useToast()

const copyrightLines = VERSION.copyrightLines

const step = ref(1)

const form = ref({
  token: '',
})

const recoveredUsername = ref('')
const loading = ref(false)
const error = ref('')

function getRemoteAdapter(): RemoteStorageAdapter {
  return storageManager.getAdapter() as RemoteStorageAdapter
}

/**
 * 使用令牌找回账号（服务端 API，禁止本地 userDAO）
 */
const handleRecoveryByToken = async () => {
  error.value = ''
  if (!form.value.token) {
    error.value = '请输入个人令牌'
    return
  }

  loading.value = true
  try {
    const result = await getRemoteAdapter().recoverByToken(form.value.token.trim())
    recoveredUsername.value = result.username
    step.value = 2
    toast.success('账号找回成功')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '查询失败'
  } finally {
    loading.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
.recover-header {
  text-align: center;
  margin-bottom: 32px;
}

.recover-brand {
  margin: 0 auto 16px;
}

.recover-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
}

.recover-subtitle {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.recover-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text);
}

.form-input,
.form-textarea {
  color: var(--cyp-text);
  background: var(--cyp-bg-input);
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 2px rgba(0, 153, 255, 0.1);
}

.form-textarea {
  resize: vertical;
  font-family: var(--cyp-font-mono);
}

.form-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.info-box,
.success-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
}

.info-box {
  background: var(--cyp-brand-tint);
  border: 1px solid color-mix(in srgb, var(--cyp-brand) 35%, var(--cyp-border));
  color: var(--cyp-brand);
}

.success-box {
  background: color-mix(in srgb, var(--cyp-success) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-success) 35%, var(--cyp-border));
  color: var(--cyp-success);
}

.info-box :deep(svg),
.success-box :deep(svg) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.info-box p,
.success-box p {
  margin: 0;
}

.error-message {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--cyp-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-danger) 35%, var(--cyp-border));
  border-radius: 6px;
  color: var(--cyp-danger);
  font-size: 14px;
}

.form-links {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.link {
  font-size: 14px;
  color: var(--cyp-brand);
  text-decoration: none;
  transition: color 0.2s;
}

.link:hover {
  color: var(--cyp-brand-soft);
  text-decoration: underline;
}

.account-display {
  padding: 16px;
  background: var(--cyp-bg-muted);
  border-radius: 8px;
}

.account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--cyp-border);
}

.account-item:last-child {
  border-bottom: none;
}

.account-item .label {
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text-secondary);
}

.account-item .value {
  font-size: 14px;
  color: var(--cyp-text);
  font-family: var(--cyp-font-mono);
}

.recover-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--cyp-border);
  text-align: center;
}

.footer-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-brand);
  letter-spacing: 0.5px;
}

.brand-author {
  font-size: 12px;
  color: var(--cyp-text-secondary);
}

.footer-copyright {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cyp-text-muted);
}

.separator {
  color: var(--cyp-text-muted);
}

@media (max-width: 480px) {
  .recover-title {
    font-size: 24px;
  }
}
</style>
