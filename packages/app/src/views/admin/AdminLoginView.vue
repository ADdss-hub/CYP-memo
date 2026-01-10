<!--
  管理员登录页面（集成在用户端）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="admin-login-page">
    <div class="login-container">
      <div class="login-header">
        <h1 class="login-title">系统管理</h1>
        <p class="login-subtitle">管理员登录</p>
      </div>

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
          {{ loading ? '登录中...' : '登录管理后台' }}
        </button>

        <div class="admin-notice">
          <p>🔐 管理员账号与普通用户账号独立</p>
          <p v-if="showDefaultHint">默认账号: admin / admin123</p>
        </div>

        <div class="back-link">
          <router-link to="/login">← 返回用户登录</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { adminAuthManager } from '@cyp-memo/shared'

const router = useRouter()
const route = useRoute()

const form = ref({
  username: '',
  password: '',
})

const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const showDefaultHint = ref(false)

const handleLogin = async () => {
  error.value = ''

  if (!form.value.username || !form.value.password) {
    error.value = '请输入账号和密码'
    return
  }

  loading.value = true

  try {
    await adminAuthManager.login(form.value.username, form.value.password)
    
    const redirect = route.query.redirect as string
    router.push(redirect || '/admin/dashboard')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await adminAuthManager.initialize()
    
    const admins = await adminAuthManager.getAllAdmins()
    if (admins.length === 1 && admins[0].username === 'admin') {
      showDefaultHint.value = true
    }
  } catch (err) {
    console.error('初始化管理员系统失败:', err)
  }
})
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

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-notice {
  padding: 12px 16px;
  background: #f0f9ff;
  border: 1px solid #bae7ff;
  border-radius: 6px;
}

.admin-notice p {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #1890ff;
}

.admin-notice p:last-child {
  margin-bottom: 0;
}

.back-link {
  text-align: center;
}

.back-link a {
  color: #909399;
  text-decoration: none;
  font-size: 14px;
}

.back-link a:hover {
  color: #2a5298;
}

[data-theme='dark'] .login-container {
  background: #1d1e1f;
}

[data-theme='dark'] .login-title {
  color: #5b8fd8;
}

[data-theme='dark'] .form-label {
  color: #e5eaf3;
}

[data-theme='dark'] .form-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .admin-notice {
  background: #1a2a3a;
  border-color: #2a4a6a;
}

[data-theme='dark'] .admin-notice p {
  color: #5b8fd8;
}
</style>
