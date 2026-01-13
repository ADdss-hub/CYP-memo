<!--
  登录页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <h1 class="login-title">CYP-memo</h1>
        <p class="login-subtitle">容器备忘录系统</p>
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
            <span>记住密码</span>
          </label>
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

      <!-- 底部版权信息 -->
      <div class="login-footer">
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
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { authManager, VERSION } from '@cyp-memo/shared'
import Button from '../../components/Button.vue'
import { View, Hide } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

// 版权信息
const copyrightLines = VERSION.copyrightLines

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

  loading.value = true

  try {
    await authStore.loginWithPassword(
      passwordForm.value.username,
      passwordForm.value.password,
      passwordForm.value.remember
    )

    toast.success('登录成功')

    // 重定向到目标页面或首页，添加 refresh 参数强制刷新备忘录数据
    const redirect = route.query.redirect as string
    const targetPath = redirect || '/memos'
    // 使用 replace 并添加时间戳参数确保页面刷新数据
    router.replace({ path: targetPath, query: { refresh: Date.now().toString() } })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '登录失败'
    error.value = errorMessage
    // 当登录失败时（用户名或密码错误），显示注册提示
    if (errorMessage.includes('用户名或密码错误') || errorMessage.includes('登录失败')) {
      showRegisterHint.value = true
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

    // 重定向到目标页面或首页，添加 refresh 参数强制刷新备忘录数据
    const redirect = route.query.redirect as string
    const targetPath = redirect || '/memos'
    // 使用 replace 并添加时间戳参数确保页面刷新数据
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
 * 加载记住的密码
 */
onMounted(() => {
  const rememberInfo = authManager.getRememberInfo()
  if (rememberInfo) {
    passwordForm.value.username = rememberInfo.username
    passwordForm.value.password = rememberInfo.password
    passwordForm.value.remember = true
  }
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-container {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.login-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: #f5f7fa;
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
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-button:hover {
  color: #409eff;
}

.tab-button.active {
  background: white;
  color: #409eff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
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

.form-group-checkbox {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
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
  color: #909399;
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

.error-text {
  margin-bottom: 0;
}

.register-hint {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #fde2e2;
  font-size: 13px;
  color: #909399;
}

.hint-link {
  color: #409eff;
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

/* 深色主题支持 */
[data-theme='dark'] .login-container {
  background: #1d1e1f;
}

[data-theme='dark'] .login-title {
  color: #e5eaf3;
}

[data-theme='dark'] .login-subtitle {
  color: #8a8f99;
}

[data-theme='dark'] .login-tabs {
  background: #262727;
}

[data-theme='dark'] .tab-button {
  color: #cfd3dc;
}

[data-theme='dark'] .tab-button:hover {
  color: #409eff;
}

[data-theme='dark'] .tab-button.active {
  background: #1d1e1f;
  color: #409eff;
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

[data-theme='dark'] .checkbox-label {
  color: #cfd3dc;
}

[data-theme='dark'] .form-hint {
  color: #8a8f99;
}

[data-theme='dark'] .error-message {
  background: #2b1d1d;
  border-color: #5c2929;
}

[data-theme='dark'] .register-hint {
  border-top-color: #5c2929;
  color: #8a8f99;
}

[data-theme='dark'] .hint-link {
  color: #409eff;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .login-container {
    padding: 24px;
  }

  .login-title {
    font-size: 24px;
  }
}

/* 底部版权信息 */
.login-footer {
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

[data-theme='dark'] .login-footer {
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

@media (max-width: 480px) {
  .footer-copyright {
    font-size: 10px;
  }
}
</style>
