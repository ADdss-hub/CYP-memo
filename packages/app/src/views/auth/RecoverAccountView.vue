<!--
  账号找回页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="recover-page">
    <div class="recover-container">
      <div class="recover-header">
        <h1 class="recover-title">找回账号</h1>
        <p class="recover-subtitle">选择您需要的找回方式</p>
      </div>

      <!-- 步骤 1: 选择找回方式 -->
      <form v-if="step === 1" class="recover-form" @submit.prevent="handleRecoveryMethod">
        <div class="method-selection">
          <div class="method-option">
            <input
              id="method-token"
              v-model="recoveryMethod"
              type="radio"
              value="token"
              class="radio-input"
            />
            <label for="method-token" class="method-label">
              <span class="method-title">使用个人令牌找回</span>
              <span class="method-desc">输入您注册时获得的个人令牌</span>
            </label>
          </div>
          <div class="method-option">
            <input
              id="method-security"
              v-model="recoveryMethod"
              type="radio"
              value="security"
              class="radio-input"
            />
            <label for="method-security" class="method-label">
              <span class="method-title">使用安全问题找回</span>
              <span class="method-desc">通过回答安全问题找回账号</span>
            </label>
          </div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <Button type="primary" size="large" block @click="handleRecoveryMethod">
          下一步
        </Button>

        <div class="form-links">
          <router-link to="/login" class="link"> 返回登录 </router-link>
        </div>
      </form>

      <!-- 步骤 2a: 使用令牌找回账号 -->
      <form v-if="step === 2 && recoveryMethod === 'token'" class="recover-form" @submit.prevent="handleRecoveryByToken">
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
          <Button type="primary" :loading="loading" @click="handleRecoveryByToken"> 查询账号 </Button>
        </div>
      </form>

      <!-- 步骤 2b: 使用安全问题找回账号 -->
      <form v-if="step === 2 && recoveryMethod === 'security'" class="recover-form" @submit.prevent="handleVerifyUsername">
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
      <form v-if="step === 3" class="recover-form" @submit.prevent="handleVerifyAnswer">
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

      <!-- 步骤 4: 显示找回的账号 -->
      <div v-if="step === 4" class="recover-form">
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
import { userDAO, VERSION } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import { InfoFilled, SuccessFilled } from '@element-plus/icons-vue'

const router = useRouter()
const toast = useToast()

// 版权信息
const copyrightLines = VERSION.copyrightLines

// 步骤
const step = ref(1)

// 找回方式
const recoveryMethod = ref<'token' | 'security'>('token')

// 表单数据
const form = ref({
  token: '',
  username: '',
  securityAnswer: '',
})

// 安全问题
const securityQuestion = ref('')

// 找回的账号
const recoveredUsername = ref('')

// 加载状态
const loading = ref(false)

// 错误信息
const error = ref('')

/**
 * 选择找回方式
 */
const handleRecoveryMethod = () => {
  error.value = ''
  if (!recoveryMethod.value) {
    error.value = '请选择找回方式'
    return
  }
  step.value = 2
}

/**
 * 使用令牌找回账号
 */
const handleRecoveryByToken = async () => {
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
    recoveredUsername.value = user.username
    step.value = 4
    toast.success('账号找回成功')
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

    recoveredUsername.value = user.username
    step.value = 4
    toast.success('账号找回成功')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证失败'
  } finally {
    loading.value = false
  }
}

/**
 * 返回登录
 */
const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
.recover-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.recover-container {
  width: 100%;
  max-width: 480px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 40px;
}

.recover-header {
  text-align: center;
  margin-bottom: 32px;
}

.recover-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px 0;
}

.recover-subtitle {
  font-size: 14px;
  color: #909399;
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

/* 账号显示样式 */
.account-display {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #dcdfe6;
}

.account-item:last-child {
  border-bottom: none;
}

.account-item .label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.account-item .value {
  font-size: 14px;
  color: #303133;
  font-family: 'Courier New', monospace;
}

/* 底部版权信息 */
.recover-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
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
  color: #667eea;
  letter-spacing: 0.5px;
}

.brand-author {
  font-size: 12px;
  color: #606266;
}

.footer-copyright {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: #909399;
}

.separator {
  color: #c0c4cc;
}

/* 深色主题支持 */
[data-theme='dark'] .recover-container {
  background: #1d1e1f;
}

[data-theme='dark'] .recover-title {
  color: #e5eaf3;
}

[data-theme='dark'] .recover-subtitle {
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

[data-theme='dark'] .account-display {
  background: #262727;
}

[data-theme='dark'] .account-item {
  border-bottom-color: #414243;
}

[data-theme='dark'] .account-item .label {
  color: #cfd3dc;
}

[data-theme='dark'] .account-item .value {
  color: #e5eaf3;
}

[data-theme='dark'] .recover-footer {
  border-top-color: #414243;
}

[data-theme='dark'] .brand-name {
  color: #a5b4fc;
}

[data-theme='dark'] .brand-author {
  color: #a8abb2;
}

[data-theme='dark'] .footer-copyright {
  color: #6b7280;
}

[data-theme='dark'] .separator {
  color: #4b5563;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .recover-container {
    padding: 24px;
  }

  .recover-title {
    font-size: 24px;
  }

  .footer-lines {
    font-size: 11px;
    gap: 2px;
  }
}
</style>
