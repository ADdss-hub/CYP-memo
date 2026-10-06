<!--
  密码重置页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="auth-shell">
    <div class="auth-card reset-card">
      <div class="reset-header">
        <BrandMark size="xl" class="reset-brand" />
        <h1 class="reset-title">重置密码</h1>
        <p class="reset-subtitle">选择您需要的重置方式</p>
      </div>

      <!-- 步骤 1: 选择重置方式 -->
      <form v-if="step === 1" class="reset-form" @submit.prevent="handleResetMethod">
        <div class="method-selection">
          <div class="method-option">
            <input
              id="method-token"
              v-model="resetMethod"
              type="radio"
              value="token"
              class="radio-input"
            />
            <label for="method-token" class="method-label">
              <span class="method-title">使用个人令牌重置</span>
              <span class="method-desc">输入您的个人令牌直接重置密码</span>
            </label>
          </div>
          <div class="method-option">
            <input
              id="method-security"
              v-model="resetMethod"
              type="radio"
              value="security"
              class="radio-input"
            />
            <label for="method-security" class="method-label">
              <span class="method-title">使用安全问题重置</span>
              <span class="method-desc">通过回答安全问题重置密码</span>
            </label>
          </div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <Button type="primary" size="large" block @click="handleResetMethod">
          下一步
        </Button>

        <div class="form-links">
          <router-link to="/login" class="link"> 返回登录 </router-link>
        </div>
      </form>

      <!-- 步骤 2a: 使用令牌重置密码 -->
      <form v-if="step === 2 && resetMethod === 'token'" class="reset-form" @submit.prevent="handleResetByToken">
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

        <div class="button-group">
          <Button type="default" @click="step = 1"> 上一步 </Button>
          <Button type="primary" :loading="loading" @click="handleResetByToken"> 下一步 </Button>
        </div>
      </form>

      <!-- 步骤 2b: 使用安全问题重置密码 -->
      <form v-if="step === 2 && resetMethod === 'security'" class="reset-form" @submit.prevent="handleVerifyUsername">
        <div class="form-group">
          <label for="username" class="form-label">用户名</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            class="form-input"
            placeholder="请输入您的用户名"
            required
            autocomplete="username"
          />
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div class="button-group">
          <Button type="default" @click="step = 1"> 上一步 </Button>
          <Button type="primary" :loading="loading" @click="handleVerifyUsername"> 下一步 </Button>
        </div>
      </form>

      <!-- 步骤 3: 回答安全问题 -->
      <form v-if="step === 3" class="reset-form" @submit.prevent="handleVerifyAnswer">
        <div class="info-box" role="status">
          <el-icon class="info-box-icon" :size="18" aria-hidden="true"><InfoFilled /></el-icon>
          <p>请回答您设置的安全问题</p>
        </div>

        <div class="form-group">
          <label class="form-label">安全问题</label>
          <div class="question-display">
            {{ securityQuestion }}
          </div>
        </div>

        <div class="form-group">
          <label for="answer" class="form-label">答案</label>
          <input
            id="answer"
            v-model="form.securityAnswer"
            type="text"
            class="form-input"
            placeholder="请输入答案"
            required
          />
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div class="button-group">
          <Button type="default" @click="step = 2"> 上一步 </Button>
          <Button type="primary" :loading="loading" @click="handleVerifyAnswer"> 验证 </Button>
        </div>
      </form>

      <!-- 步骤 4: 设置新密码 -->
      <form v-if="step === 4" class="reset-form" @submit.prevent="handleResetPassword">
        <div class="success-box" role="status">
          <el-icon class="info-box-icon" :size="18" aria-hidden="true"><SuccessFilled /></el-icon>
          <p>验证成功，请设置新密码</p>
        </div>

        <div class="form-group">
          <label for="newPassword" class="form-label">新密码</label>
          <div class="password-input-wrapper">
            <input
              id="newPassword"
              v-model="form.newPassword"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="至少8位，包含字母和数字"
              required
              autocomplete="new-password"
            />
            <button type="button" class="password-toggle" @click="showPassword = !showPassword">
              <el-icon :size="18" aria-hidden="true">
                <component :is="showPassword ? Hide : View" />
              </el-icon>
            </button>
          </div>
          <p class="form-hint">密码至少8位，必须包含字母和数字</p>
        </div>

        <div class="form-group">
          <label for="confirmPassword" class="form-label">确认新密码</label>
          <div class="password-input-wrapper">
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="请再次输入新密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="password-toggle"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <el-icon :size="18" aria-hidden="true">
                <component :is="showConfirmPassword ? Hide : View" />
              </el-icon>
            </button>
          </div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div class="button-group">
          <Button type="default" @click="step = 3"> 上一步 </Button>
          <Button type="primary" size="large" :loading="loading" @click="handleResetPassword"> 重置密码 </Button>
        </div>
      </form>

      <!-- 底部版权信息 -->
      <div class="reset-footer">
        <div class="footer-info">
          <span>v{{ version }}</span>
          <span class="divider">|</span>
          <span>{{ author }}</span>
          <span class="divider">|</span>
          <span>{{ copyright }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { storageManager, VERSION } from '@cyp-memo/shared'
import type { RemoteStorageAdapter } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import BrandMark from '../../components/BrandMark.vue'
import { View, Hide, InfoFilled, SuccessFilled } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

// 版本信息
const version = VERSION.full
const author = VERSION.author
const copyright = VERSION.copyright

// 步骤
const step = ref(1)

// 重置方式
const resetMethod = ref<'token' | 'security'>('token')

// 表单数据
const form = ref({
  token: '',
  username: '',
  securityAnswer: '',
  newPassword: '',
  confirmPassword: '',
})

// 安全问题
const securityQuestion = ref('')

// 显示密码
const showPassword = ref(false)
const showConfirmPassword = ref(false)

// 加载状态
const loading = ref(false)

// 错误信息
const error = ref('')

function getRemoteAdapter(): RemoteStorageAdapter {
  return storageManager.getAdapter() as RemoteStorageAdapter
}

/**
 * 选择重置方式
 */
const handleResetMethod = () => {
  error.value = ''
  if (!resetMethod.value) {
    error.value = '请选择重置方式'
    return
  }
  step.value = 2
}

/**
 * 使用令牌重置密码（先服务端解析用户名）
 */
const handleResetByToken = async () => {
  error.value = ''
  if (!form.value.token) {
    error.value = '请输入个人令牌'
    return
  }

  loading.value = true
  try {
    const result = await getRemoteAdapter().recoverByToken(form.value.token.trim())
    form.value.username = result.username
    step.value = 4
  } catch (err) {
    error.value = err instanceof Error ? err.message : '查询失败'
  } finally {
    loading.value = false
  }
}

/**
 * 验证用户名并拉取安全问题
 */
const handleVerifyUsername = async () => {
  error.value = ''
  if (!form.value.username) {
    error.value = '请输入用户名'
    return
  }

  loading.value = true
  try {
    const result = await getRemoteAdapter().recoverGetQuestion(form.value.username)
    securityQuestion.value = result.question
    step.value = 3
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证失败'
  } finally {
    loading.value = false
  }
}

/**
 * 验证安全问题答案（服务端）
 */
const handleVerifyAnswer = async () => {
  error.value = ''
  if (!form.value.securityAnswer) {
    error.value = '请输入答案'
    return
  }

  loading.value = true
  try {
    await getRemoteAdapter().recoverVerifyAnswer(form.value.username, form.value.securityAnswer)
    step.value = 4
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证失败'
  } finally {
    loading.value = false
  }
}

/**
 * 重置密码（服务端比对密保并写新哈希）
 */
const handleResetPassword = async () => {
  error.value = ''

  if (!form.value.newPassword || !form.value.confirmPassword) {
    error.value = '请填写所有必填项'
    return
  }

  if (form.value.newPassword !== form.value.confirmPassword) {
    error.value = '两次输入的密码不一致'
    return
  }

  if (resetMethod.value === 'token') {
    if (!form.value.token) {
      error.value = '请输入个人令牌'
      return
    }
    loading.value = true
    try {
      await getRemoteAdapter().recoverResetPasswordByToken(
        form.value.token.trim(),
        form.value.newPassword
      )
      toast.success('密码重置成功')
      router.push('/login')
    } catch (err) {
      error.value = err instanceof Error ? err.message : '密码重置失败'
    } finally {
      loading.value = false
    }
    return
  }

  loading.value = true
  try {
    await authStore.resetPassword(
      form.value.username,
      form.value.securityAnswer,
      form.value.newPassword
    )
    toast.success('密码重置成功')
    router.push('/login')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '密码重置失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.reset-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: 20px;
}

.reset-container {
  width: 100%;
  max-width: 480px;
  background: var(--cyp-chrome-bg-panel);
  border-radius: 12px;
  box-shadow: var(--cyp-chrome-shadow), 0 12px 40px rgba(0, 0, 0, 0.45);
  border: 1px solid var(--cyp-chrome-border);
  padding: 40px;
}

.reset-header {
  text-align: center;
  margin-bottom: 32px;
}

.reset-brand {
  margin: 0 auto 16px;
}

.reset-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
}

.reset-subtitle {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.reset-form {
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
  background: rgba(0, 153, 255, 0.1);
  border-radius: 4px;
}

.form-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.question-display {
  padding: 12px 16px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--cyp-text);
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

.info-box-icon,
.info-box :deep(svg),
.success-box :deep(svg) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.info-box p,
.success-box p {
  margin: 0;
  line-height: 1.4;
}

.error-message {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--cyp-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-danger) 35%, var(--cyp-border));
  border-radius: 6px;
  color: var(--cyp-danger);
  font-size: 14px;
}

.button-group {
  display: flex;
  gap: 12px;
}

.button-group > * {
  flex: 1;
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

/* 方法选择样式 */
.method-selection {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.method-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.method-option:hover {
  border-color: var(--cyp-brand);
  background: var(--cyp-bg-muted);
}

.radio-input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.method-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  flex: 1;
}

.method-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text);
}

.method-desc {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

/* 底部版权信息 */
.reset-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--cyp-border);
  text-align: center;
}

.footer-info {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.footer-info .divider {
  color: var(--cyp-border);
}

/* 深色主题支持 */
/* 响应式设计 */
@media (max-width: 480px) {
  .reset-container {
    padding: 24px;
  }

  .reset-title {
    font-size: 24px;
  }

  .footer-info {
    font-size: 11px;
    gap: 6px;
  }
}
</style>
