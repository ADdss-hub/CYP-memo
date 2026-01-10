<!--
  管理员登录页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="admin-login-page">
    <div class="login-container">
      <div class="login-header">
        <h1 class="login-title">CYP-memo 管理端</h1>
        <p class="login-subtitle">系统管理控制台</p>
      </div>

      <!-- 管理员登录表单 -->
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username" class="form-label">管理员账号</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            class="form-input"
            placeholder="请输入管理员账号"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <div class="password-input-wrapper">
            <input
              id="password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="请输入密码"
              required
              autocomplete="current-password"
            />
            <button type="button" class="password-toggle" @click="showPassword = !showPassword">
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <button type="submit" class="login-button" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <div class="admin-notice">
          <p>🔐 管理员账号与普通用户账号独立</p>
          <p v-if="showDefaultHint" class="default-hint">
            默认账号: admin / admin123
            <button type="button" class="fill-default-btn" @click="fillDefaultCredentials">
              点击填入
            </button>
          </p>
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
import { useAdminAuthStore } from '../stores/auth'
import { adminAuthManager, VERSION } from '@cyp-memo/shared'

const router = useRouter()
const route = useRoute()
const adminAuthStore = useAdminAuthStore()

// 版权信息
const copyrightLines = VERSION.copyrightLines

// 表单
const form = ref({
  username: '',
  password: '',
})

// 显示密码
const showPassword = ref(false)

// 加载状态
const loading = ref(false)

// 错误信息
const error = ref('')

// 是否显示默认账号提示
const showDefaultHint = ref(false)

/**
 * 登录
 */
const handleLogin = async () => {
  error.value = ''

  if (!form.value.username || !form.value.password) {
    error.value = '请输入账号和密码'
    return
  }

  loading.value = true

  try {
    await adminAuthStore.login(form.value.username, form.value.password)

    // 重定向到管理控制台
    const redirect = route.query.redirect as string
    router.push(redirect || '/dashboard')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    loading.value = false
  }
}

/**
 * 初始化管理员系统
 */
onMounted(async () => {
  try {
    // 初始化管理员系统（如果没有管理员，会创建默认账号）
    await adminAuthManager.initialize()
    
    // 检查是否只有默认管理员
    const admins = await adminAuthManager.getAllAdmins()
    if (admins.length === 1 && admins[0].username === 'admin') {
      showDefaultHint.value = true
      // 自动填入默认账号密码
      fillDefaultCredentials()
    }
  } catch (err) {
    console.error('初始化管理员系统失败:', err)
  }
})

/**
 * 填入默认账号密码
 */
const fillDefaultCredentials = () => {
  form.value.username = 'admin'
  form.value.password = 'admin123'
}
</script>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  padding: 20px;
}

.login-container {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e3c72;
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
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

.form-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #2a5298;
  box-shadow: 0 0 0 2px rgba(42, 82, 152, 0.1);
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
  padding: 4px 8px;
  color: #909399;
  font-size: 12px;
}

.password-toggle:hover {
  color: #606266;
}

.error-message {
  padding: 12px 16px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 6px;
  color: #f56c6c;
  font-size: 14px;
}

.login-button {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(42, 82, 152, 0.3);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-notice {
  padding: 12px 16px;
  background: #f0f9ff;
  border: 1px solid #bae7ff;
  border-radius: 6px;
  margin-top: 8px;
}

.admin-notice p {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #1890ff;
  line-height: 1.5;
}

.admin-notice p:last-child {
  margin-bottom: 0;
}

.default-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fill-default-btn {
  padding: 2px 8px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.fill-default-btn:hover {
  background: #40a9ff;
}

/* 深色主题支持 */
[data-theme='dark'] .login-container {
  background: #1d1e1f;
}

[data-theme='dark'] .login-title {
  color: #5b8fd8;
}

[data-theme='dark'] .login-subtitle {
  color: #8a8f99;
}

[data-theme='dark'] .form-label {
  color: #e5eaf3;
}

[data-theme='dark'] .form-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .form-input:focus {
  border-color: #5b8fd8;
  box-shadow: 0 0 0 2px rgba(91, 143, 216, 0.2);
}

[data-theme='dark'] .error-message {
  background: #2b1d1d;
  border-color: #5c2929;
}

[data-theme='dark'] .admin-notice {
  background: #1a2a3a;
  border-color: #2a4a6a;
}

[data-theme='dark'] .admin-notice p {
  color: #5b8fd8;
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
  color: #1890ff;
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
  color: #40a9ff;
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
  .login-container {
    padding: 24px;
  }

  .login-title {
    font-size: 24px;
  }

  .footer-copyright {
    font-size: 10px;
  }
}
</style>
