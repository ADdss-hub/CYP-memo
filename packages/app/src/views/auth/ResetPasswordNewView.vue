<!--
  密码重置页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="reset-page">
    <div class="reset-container">
      <div class="reset-header">
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
        <div class="info-box">
          <InfoFilled />
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
        <div class="success-box">
          <SuccessFilled />
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
              <component :is="showPassword ? Hide : View" />
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
              <component :is="showConfirmPassword ? Hide : View" />
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
import { userDAO, VERSION } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
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
 * 使用令牌重置密码
 */
const handleResetByToken = async () => {
  error.value = ''
  if (!form.value.token) {
    error.value = '请输入个人令牌'
    return
  }

  loading.value = true
  try {
    const user = await userDAO.getByToken(form.value.token.trim())
    if (!user) {
      error.value = '令牌无效或不存在'
      return
    }
    form.value.username = user.username
    step.value = 4
  } catch (err) {
    error.value = err instanceof Error ? err.message : '查询失败'
  } finally {
    loading.value = false
  }
}

/**
 * 验证用户名
 */
const handleVerifyUsername = async () => {
  error.value = ''
  if (!form.value.username) {
    error.value = '请输入用户名'
    return
  }

  loading.value = true
  try {
    const user = await userDAO.getByUsername(form.value.username)
    if (!user) {
      error.value = '用户不存在'
      return
    }
    if (!user.securityQuestion) {
      error.value = '该用户未设置安全问题，请联系管理员'
      return
    }
    securityQuestion.value = user.securityQuestion.question
    step.value = 3
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证失败'
  } finally {
    loading.value = false
  }
}

/**
 * 验证安全问题答案
 */
const handleVerifyAnswer = async () => {
  error.value = ''
  if (!form.value.securityAnswer) {
    error.value = '请输入答案'
    return
  }

  loading.value = true
  try {
    const user = await userDAO.getByUsername(form.value.username)
    if (!user || !user.securityQuestion) {
      error.value = '用户信息不存在'
      return
    }

    const { verifyPassword } = await import('@cyp-memo/shared')
    const isValid = await verifyPassword(form.value.securityAnswer, user.securityQuestion.answerHash)
    if (!isValid) {
      error.value = '安全问题答案错误'
      return
    }

    step.value = 4
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证失败'
  } finally {
    loading.value = false
  }
}

/**
 * 重置密码
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.reset-container {
  width: 100%;
  max-width: 480px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 40px;
}

.reset-header {
  text-align: center;
  margin-bottom: 32px;
}

.reset-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px 0;
}

.reset-subtitle {
  font-size: 14px;
  color: #909399;
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
  color: #303133;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.form-textarea {
  resize: vertical;
  font-family: 'Courier New', monospace;
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
  color: #909399;
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
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
  border-radius: 4px;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

.question-display {
  padding: 12px 16px;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 14px;
  color: #303133;
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
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  color: #409eff;
}

.success-box {
  background: #f0f9ff;
  border: 1px solid #d1f2eb;
  color: #67c23a;
}

.info-box svg,
.success-box svg {
  font-size: 20px;
  flex-shrink: 0;
}

.info-box p,
.success-box p {
  margin: 0;
}

.error-message {
  padding: 12px 16px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 6px;
  color: #f56c6c;
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
  color: #409eff;
  text-decoration: none;
  transition: color 0.2s;
}

.link:hover {
  color: #66b1ff;
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
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.method-option:hover {
  border-color: #409eff;
  background: #f5f7fa;
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
  color: #303133;
}

.method-desc {
  font-size: 12px;
  color: #909399;
}

/* 底部版权信息 */
.reset-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}

.footer-info {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.footer-info .divider {
  color: #dcdfe6;
}

/* 深色主题支持 */
[data-theme='dark'] .reset-container {
  background: #1d1e1f;
}

[data-theme='dark'] .reset-title {
  color: #e5eaf3;
}

[data-theme='dark'] .reset-subtitle {
  color: #8a8f99;
}

[data-theme='dark'] .form-label {
  color: #e5eaf3;
}

[data-theme='dark'] .form-input,
[data-theme='dark'] .form-textarea {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .form-input:focus,
[data-theme='dark'] .form-textarea:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

[data-theme='dark'] .form-hint {
  color: #8a8f99;
}

[data-theme='dark'] .question-display {
  background: #262727;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] .info-box {
  background: #1a2332;
  border-color: #2d4a6e;
}

[data-theme='dark'] .success-box {
  background: #1a2e1f;
  border-color: #2d5c3a;
}

[data-theme='dark'] .error-message {
  background: #2b1d1d;
  border-color: #5c2929;
}

[data-theme='dark'] .method-option {
  border-color: #414243;
}

[data-theme='dark'] .method-option:hover {
  border-color: #409eff;
  background: #262727;
}

[data-theme='dark'] .method-title {
  color: #e5eaf3;
}

[data-theme='dark'] .method-desc {
  color: #8a8f99;
}

[data-theme='dark'] .reset-footer {
  border-top-color: #414243;
}

[data-theme='dark'] .footer-info .divider {
  color: #414243;
}

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
