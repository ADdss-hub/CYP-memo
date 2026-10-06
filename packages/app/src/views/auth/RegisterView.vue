<!--
  注册页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="auth-shell">
    <div class="auth-card register-card">
      <div class="register-header">
        <BrandMark size="xl" class="register-brand" />
        <h1 class="register-title">注册账号</h1>
        <p class="register-subtitle">创建您的 CYP-memo 账号</p>
      </div>

      <!-- 注册方式已统一为账号密码注册，自动生成令牌 -->

      <!-- 账号密码注册表单 -->
      <div>
        <!-- 注册表单 -->
        <form
          v-if="!passwordRegisterSuccess"
          class="register-form"
          @submit.prevent="handlePasswordRegister"
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
                placeholder="至少8位，包含字母和数字"
                required
                autocomplete="new-password"
              />
              <button type="button" class="password-toggle" @click="showPassword = !showPassword">
                <component :is="showPassword ? Hide : View" />
              </button>
            </div>
            <p class="form-hint">密码至少8位，必须包含字母和数字</p>
          </div>

          <div class="form-group">
            <label for="confirmPassword" class="form-label">确认密码</label>
            <div class="password-input-wrapper">
              <input
                id="confirmPassword"
                v-model="passwordForm.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="form-input"
                placeholder="请再次输入密码"
                required
                autocomplete="new-password"
              />
              <button
                type="button"
                class="password-toggle"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <component :is="showConfirmPassword ? Hide : View" />
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="securityQuestion" class="form-label">安全问题</label>
            <select
              id="securityQuestion"
              v-model="passwordForm.securityQuestion"
              class="form-select"
              required
            >
              <option value="">请选择安全问题</option>
              <option value="您的出生地是？">您的出生地是？</option>
              <option value="您母亲的姓名是？">您母亲的姓名是？</option>
              <option value="您的小学名称是？">您的小学名称是？</option>
              <option value="您最喜欢的颜色是？">您最喜欢的颜色是？</option>
              <option value="您的宠物名字是？">您的宠物名字是？</option>
            </select>
          </div>

          <div class="form-group">
            <label for="securityAnswer" class="form-label">安全问题答案</label>
            <input
              id="securityAnswer"
              v-model="passwordForm.securityAnswer"
              type="text"
              class="form-input"
              placeholder="请输入答案"
              required
            />
            <p class="form-hint">用于找回密码，请牢记您的答案</p>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <Button
            type="primary"
            size="large"
            block
            :loading="loading"
            @click="handlePasswordRegister"
          >
            注册
          </Button>

          <div class="form-links">
            <span class="link-text">已有账号？</span>
            <router-link to="/login" class="link"> 立即登录 </router-link>
          </div>
        </form>

        <!-- 注册成功 - 显示自动生成的令牌 -->
        <div v-else class="token-result">
          <div class="success-icon">
            <SuccessFilled />
          </div>
          <h3 class="success-title">注册成功！</h3>
          <p class="success-text">您的账号已创建，系统已为您自动生成个人令牌：</p>

          <div class="token-display">
            <div class="token-text">
              {{ generatedToken }}
            </div>
            <Button type="default" @click="copyToken">
              <template #icon>
                <DocumentCopy />
              </template>
              复制令牌
            </Button>
          </div>

          <div class="warning-box">
            <div class="warning-icon">
              <WarningFilled />
            </div>
            <div class="warning-content">
              <p><strong>请务必保存此令牌！</strong></p>
              <p>令牌可用于登录系统，丢失后需要联系管理员重置。</p>
            </div>
          </div>

          <Button type="primary" size="large" block @click="goToWelcome"> 进入系统 </Button>
        </div>
      </div>

      <AppFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { hashPassword } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import BrandMark from '../../components/BrandMark.vue'
import AppFooter from '../../components/AppFooter.vue'
import { View, Hide, SuccessFilled, WarningFilled, DocumentCopy } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

// 注册类型已统一为账号密码注册

// 账号密码表单
const passwordForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
  securityQuestion: '',
  securityAnswer: '',
})

// 显示密码
const showPassword = ref(false)
const showConfirmPassword = ref(false)

// 账号密码注册成功状态
const passwordRegisterSuccess = ref(false)

// 自动生成的令牌
const generatedToken = ref('')

// 加载状态
const loading = ref(false)

// 错误信息
const error = ref('')

/**
 * 账号密码注册
 */
const handlePasswordRegister = async () => {
  error.value = ''

  // 验证表单
  if (!passwordForm.value.username || !passwordForm.value.password) {
    error.value = '请填写所有必填项'
    return
  }

  if (passwordForm.value.password !== passwordForm.value.confirmPassword) {
    error.value = '两次输入的密码不一致'
    return
  }

  if (!passwordForm.value.securityQuestion || !passwordForm.value.securityAnswer) {
    error.value = '请设置安全问题和答案'
    return
  }

  loading.value = true

  try {
    // 哈希安全问题答案
    const answerHash = await hashPassword(passwordForm.value.securityAnswer)

    const user = await authStore.registerWithPassword(passwordForm.value.username, passwordForm.value.password, {
      question: passwordForm.value.securityQuestion,
      answerHash,
    })

    // 获取自动生成的令牌
    if (user.token) {
      generatedToken.value = user.token
      passwordRegisterSuccess.value = true
      toast.success('注册成功，令牌已自动生成')
    } else {
      throw new Error('令牌生成失败')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '注册失败'
  } finally {
    loading.value = false
  }
}

/**
 * 复制令牌
 */
const copyToken = async () => {
  try {
    await navigator.clipboard.writeText(generatedToken.value)
    toast.success('令牌已复制到剪贴板')
  } catch (err) {
    toast.error('复制失败，请手动复制')
  }
}

/**
 * 进入系统（账号密码注册成功后）
 */
const goToWelcome = () => {
  router.push('/welcome')
}
</script>

<style scoped>
.register-card {
  max-width: 480px;
}

.register-header {
  text-align: center;
  margin-bottom: 32px;
}

.register-brand {
  margin: 0 auto 16px;
}

.register-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
}

.register-subtitle {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

.register-tabs {
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

.register-form {
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
.form-select {
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

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 2px var(--cyp-brand-tint);
}

.form-select {
  cursor: pointer;
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

.form-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.link-text {
  font-size: 14px;
  color: var(--cyp-text-secondary);
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

.token-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-text {
  font-size: 14px;
  color: var(--cyp-text-secondary);
  line-height: 1.6;
  margin: 0;
}

.info-text.warning {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--cyp-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-warning) 35%, transparent);
  border-radius: 6px;
  color: var(--cyp-warning);
}

.token-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.success-icon {
  font-size: 48px;
  color: var(--cyp-success);
}

.success-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
}

.success-text {
  font-size: 14px;
  color: var(--cyp-text-secondary);
  margin: 0;
}

.token-display {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--cyp-bg-muted);
  border-radius: 8px;
}

.token-text {
  font-family: var(--cyp-font-mono);
  font-size: 14px;
  color: var(--cyp-text);
  word-break: break-all;
  padding: 12px;
  background: var(--cyp-bg-input);
  border-radius: 6px;
  border: 1px solid var(--cyp-border);
}

.warning-box {
  width: 100%;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--cyp-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-warning) 35%, transparent);
  border-radius: 8px;
  text-align: left;
  color: var(--cyp-warning);
  align-items: flex-start;
  box-sizing: border-box;
}

.warning-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.warning-icon svg {
  width: 20px;
  height: 20px;
}

.warning-content {
  flex: 1;
  min-width: 0;
}

.warning-content p {
  margin: 0 0 4px 0;
  font-size: 13px;
  line-height: 1.5;
  word-wrap: break-word;
}

.warning-content p:last-child {
  margin-bottom: 0;
}

@media (max-width: 480px) {
  .register-card {
    padding: 24px;
  }

  .register-title {
    font-size: 24px;
  }

  .footer-copyright {
    font-size: 10px;
  }
}

.register-footer {
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
  color: var(--cyp-border);
}
</style>
