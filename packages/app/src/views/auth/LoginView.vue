<!--
  登录页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="login-header">
        <BrandMark size="xl" class="login-brand" />
        <h1 class="login-title">CYP-memo</h1>
        <p class="login-subtitle">备忘录系统</p>
      </div>

      <div class="login-tabs">
        <button
          :class="['tab-button', { active: loginType === 'password' }]"
          @click="loginType = 'password'"
        >
          账号密码登录
        </button>
        <button
          :class="['tab-button', { active: loginType === 'token' }]"
          @click="loginType = 'token'"
        >
          个人令牌登录
        </button>
      </div>

      <!-- 账号密码登录表单 -->
      <form
        v-if="loginType === 'password'"
        class="login-form"
        @submit.prevent="handlePasswordLogin"
      >
        <div class="form-group">
          <label for="username" class="form-label">用户名</label>
          <input
            id="username"
            v-model="passwordForm.username"
            type="text"
            class="form-input"
            placeholder="请输入用户名"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <div class="password-input-wrapper">
            <input
              id="password"
              v-model="passwordForm.password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="请输入密码"
              required
              autocomplete="current-password"
            />
            <button type="button" class="password-toggle" @click="showPassword = !showPassword">
              <component :is="showPassword ? Hide : View" />
            </button>
          </div>
        </div>

        <div class="form-group-checkbox">
          <label class="checkbox-label">
            <input v-model="passwordForm.remember" type="checkbox" class="checkbox-input" />
            <span>记住用户名</span>
          </label>
        </div>

        <div v-if="challengeNeeded" class="challenge-panel" role="group" aria-labelledby="challenge-title">
          <div class="challenge-head">
            <div class="challenge-title-row">
              <el-icon class="challenge-icon" :size="18"><Lock /></el-icon>
              <span id="challenge-title" class="challenge-title">安全验证</span>
            </div>
            <button
              type="button"
              class="challenge-refresh"
              title="换一题"
              aria-label="换一题"
              @click="refreshChallenge"
            >
              <el-icon :size="16"><RefreshRight /></el-icon>
              <span>换一题</span>
            </button>
          </div>
          <div class="challenge-body">
            <div class="challenge-prompt" aria-hidden="true">{{ challengePrompt || '…' }}</div>
            <input
              id="challenge"
              v-model="challengeAnswer"
              type="text"
              class="form-input challenge-input"
              placeholder="请输入答案"
              required
              autocomplete="off"
              inputmode="numeric"
              aria-label="安全验证答案"
            />
          </div>
          <p class="challenge-hint">连续失败后需完成算术验证，防止暴力破解</p>
        </div>

        <div v-if="error" class="error-message">
          <div class="error-text">{{ error }}</div>
          <div v-if="showRegisterHint" class="register-hint">
            如果您还没有账号，请
            <router-link to="/register" class="hint-link">前往注册</router-link>
          </div>
        </div>

        <Button type="primary" size="large" block :loading="loading" @click="handlePasswordLogin">
          登录
        </Button>

        <div class="form-links">
          <router-link to="/reset-password" class="link"> 找回账号和密码 </router-link>
          <router-link to="/register" class="link"> 注册账号 </router-link>
        </div>
      </form>

      <!-- 个人令牌登录表单 -->
      <form v-if="loginType === 'token'" class="login-form" @submit.prevent="handleTokenLogin">
        <div class="form-group">
          <label for="token" class="form-label">个人令牌</label>
          <textarea
            id="token"
            v-model="tokenForm.token"
            class="form-textarea"
            placeholder="请输入个人令牌"
            rows="4"
            required
          />
          <p class="form-hint">请输入您注册时获得的个人令牌</p>
        </div>

        <div v-if="error" class="error-message">
          <div class="error-text">{{ error }}</div>
          <div v-if="showRegisterHint" class="register-hint">
            如果您还没有账号，请
            <router-link to="/register" class="hint-link">前往注册</router-link>
          </div>
        </div>

        <Button type="primary" size="large" block :loading="loading" @click="handleTokenLogin">
          登录
        </Button>

        <div class="form-links">
          <router-link to="/register" class="link"> 注册账号 </router-link>
        </div>
      </form>

      <AppFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { authManager, resolveLandingPath } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import BrandMark from '../../components/BrandMark.vue'
import AppFooter from '../../components/AppFooter.vue'
import { View, Hide, Lock, RefreshRight } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

// 登录类型
const loginType = ref<'password' | 'token'>('password')

// 账号密码表单
const passwordForm = ref({
  username: '',
  password: '',
  remember: false,
})

// 个人令牌表单
const tokenForm = ref({
  token: '',
})

// 显示密码
const showPassword = ref(false)

// 加载状态
const loading = ref(false)

// 错误信息
const error = ref('')

// 是否显示注册提示
const showRegisterHint = ref(false)

const challengeNeeded = ref(false)
const challengeId = ref('')
const challengePrompt = ref('')
const challengeAnswer = ref('')

async function refreshChallenge() {
  try {
    const { storageManager } = await import('@cyp-memo/shared')
    if (storageManager.isInitialized() && storageManager.getMode() === 'remote') {
      const adapter = storageManager.getAdapter() as {
        fetchLoginChallenge?: () => Promise<{ challengeId: string; prompt: string }>
      }
      if (adapter.fetchLoginChallenge) {
        const c = await adapter.fetchLoginChallenge()
        challengeId.value = c.challengeId
        challengePrompt.value = c.prompt
        challengeAnswer.value = ''
        challengeNeeded.value = true
        return
      }
    }
    const { resolveApiBaseUrl } = await import('@cyp-memo/shared')
    const base = resolveApiBaseUrl({
      VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
      PROD: import.meta.env.PROD,
    })
    const res = await fetch(`${base.replace(/\/$/, '')}/auth/challenge`)
    const json = (await res.json()) as { success?: boolean; data?: { challengeId: string; prompt: string } }
    if (json?.data?.challengeId) {
      challengeId.value = json.data.challengeId
      challengePrompt.value = json.data.prompt
      challengeAnswer.value = ''
      challengeNeeded.value = true
    }
  } catch {
    /* ignore */
  }
}

/**
 * 账号密码登录
 */
const handlePasswordLogin = async () => {
  error.value = ''
  showRegisterHint.value = false

  if (!passwordForm.value.username || !passwordForm.value.password) {
    error.value = '请输入用户名和密码'
    return
  }
  if (challengeNeeded.value && !challengeAnswer.value) {
    error.value = '请完成安全验证'
    return
  }

  loading.value = true

  try {
    await authStore.loginWithPassword(
      passwordForm.value.username,
      passwordForm.value.password,
      passwordForm.value.remember,
      challengeNeeded.value
        ? { challengeId: challengeId.value, challengeAnswer: challengeAnswer.value }
        : undefined
    )

    toast.success('登录成功')
    challengeNeeded.value = false
    challengeId.value = ''
    challengeAnswer.value = ''

    // 按权限落地；无 memo 权时勿硬跳 /memos
    const redirect = route.query.redirect as string
    const targetPath =
      redirect && !redirect.startsWith('/login')
        ? redirect
        : resolveLandingPath(authStore.permissions)
    router.replace({ path: targetPath, query: { refresh: Date.now().toString() } })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '登录失败'
    error.value = errorMessage
    // 当登录失败时（用户名或密码错误），显示注册提示
    if (errorMessage.includes('用户名或密码错误') || errorMessage.includes('登录失败')) {
      showRegisterHint.value = true
      await refreshChallenge()
    }
  } finally {
    loading.value = false
  }
}

/**
 * 个人令牌登录
 */
const handleTokenLogin = async () => {
  error.value = ''
  showRegisterHint.value = false

  if (!tokenForm.value.token) {
    error.value = '请输入个人令牌'
    return
  }

  loading.value = true

  try {
    await authStore.loginWithToken(tokenForm.value.token.trim())

    toast.success('登录成功')

    // 按权限落地；无 memo 权时勿硬跳 /memos
    const redirect = route.query.redirect as string
    const targetPath =
      redirect && !redirect.startsWith('/login')
        ? redirect
        : resolveLandingPath(authStore.permissions)
    router.replace({ path: targetPath, query: { refresh: Date.now().toString() } })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '登录失败'
    error.value = errorMessage
    // 当令牌无效或不存在时，显示注册提示
    if (errorMessage.includes('令牌无效') || errorMessage.includes('不存在') || errorMessage.includes('登录失败')) {
      showRegisterHint.value = true
    }
  } finally {
    loading.value = false
  }
}

/**
 * 加载记住的用户名（不回填密码）
 */
onMounted(() => {
  const rememberInfo = authManager.getRememberInfo()
  if (rememberInfo?.username) {
    passwordForm.value.username = rememberInfo.username
    passwordForm.value.password = ''
    passwordForm.value.remember = rememberInfo.remember !== false
  }
})
</script>

<style scoped>
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-brand {
  margin: 0 auto 16px;
}

.login-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.login-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: var(--cyp-bg-muted);
  padding: 4px;
  border-radius: 8px;
}

.tab-button {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-button:hover {
  color: var(--cyp-brand);
}

.tab-button.active {
  background: var(--cyp-chrome-bg-panel);
  color: var(--cyp-brand);
  box-shadow: var(--cyp-chrome-shadow);
}

.login-form :deep(.btn-primary) {
  background: var(--cyp-brand);
  border-color: var(--cyp-brand);
}

.login-form :deep(.btn-primary:hover:not(.btn-disabled):not(.btn-loading)) {
  background: var(--cyp-brand-hover);
  border-color: var(--cyp-brand-hover);
}

.login-form {
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
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--cyp-text);
  background: var(--cyp-bg-input);
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--cyp-text-muted);
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 2px var(--cyp-brand-tint);
}

.form-textarea {
  resize: vertical;
  font-family: var(--cyp-font-mono);
}

.password-input-wrapper {
  position: relative;
}

.password-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--cyp-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  z-index: 10;
  pointer-events: auto;
  line-height: 1;
  min-width: 36px;
  min-height: 36px;
}

.password-toggle:hover {
  color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
  border-radius: 4px;
}

.form-group-checkbox {
  display: flex;
  align-items: center;
}

.challenge-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--cyp-brand-tint-strong);
  background: linear-gradient(
    160deg,
    var(--cyp-brand-tint) 0%,
    transparent 100%
  );
}

.challenge-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.challenge-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.challenge-icon {
  color: var(--cyp-brand);
  flex-shrink: 0;
}

.challenge-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-text);
}

.challenge-refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--cyp-brand);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.challenge-refresh:hover {
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand-soft);
}

.challenge-body {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.challenge-prompt {
  flex: 0 0 auto;
  min-width: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  color: var(--cyp-brand-soft);
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.challenge-input {
  flex: 1;
  min-width: 0;
}

.challenge-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--cyp-text-muted);
}

@media (max-width: 768px) {
  .challenge-body {
    flex-direction: column;
  }

  .challenge-prompt {
    min-width: 0;
    width: 100%;
    min-height: 44px;
  }

  .login-title {
    font-size: 22px;
  }

  .tab-button {
    min-height: 44px;
    padding: 10px 8px;
    font-size: 13px;
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  user-select: none;
}

.checkbox-input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.form-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.error-message {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--cyp-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-danger) 35%, transparent);
  border-radius: 6px;
  color: var(--cyp-danger);
  font-size: 14px;
}

.error-text {
  margin-bottom: 0;
}

.register-hint {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--cyp-danger) 35%, transparent);
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.hint-link {
  color: var(--cyp-brand);
  text-decoration: none;
  font-weight: 500;
}

.hint-link:hover {
  text-decoration: underline;
}

.form-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  margin-bottom: 8px;
  padding-bottom: 8px;
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

.login-footer {
  margin-top: 36px;
  padding-top: 24px;
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
  color: var(--cyp-border);
}

@media (max-width: 480px) {
  .footer-copyright {
    font-size: 10px;
  }
}
</style>
