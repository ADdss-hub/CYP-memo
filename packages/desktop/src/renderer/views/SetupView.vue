<script setup lang="ts">
/**
 * 服务器设置页面
 * Server setup view for first-time launch
 * 
 * 需求 7: 桌面应用需要先连接服务器才能使用
 */

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getElectronAPI } from '../composables'
import { markSetupCompleted } from '../router'
import { storageManager } from '@cyp-memo/shared'
import type { ConnectionMode, ServerValidationResult, ServerConnectionTestResult } from '../../shared/types'

const router = useRouter()
const api = getElectronAPI()

// 步骤状态
const currentStep = ref(1)
const selectedMode = ref<ConnectionMode | null>(null)
const serverUrl = ref('')
const isValidating = ref(false)
const isTesting = ref(false)
const isCompleting = ref(false)
const validationResult = ref<ServerValidationResult | null>(null)
const testResult = ref<ServerConnectionTestResult | null>(null)
const error = ref('')

// 计算属性
const canProceed = computed(() => {
  if (currentStep.value === 1) {
    return selectedMode.value !== null
  }
  if (currentStep.value === 2 && selectedMode.value === 'remote') {
    return testResult.value?.success === true
  }
  return true
})

// 选择连接模式
function selectMode(mode: ConnectionMode) {
  selectedMode.value = mode
  error.value = ''
  testResult.value = null
  validationResult.value = null
}

// 验证服务器 URL
async function validateUrl() {
  if (!api || !serverUrl.value) return

  isValidating.value = true
  error.value = ''
  validationResult.value = null

  try {
    validationResult.value = await api.server.validateUrl(serverUrl.value)
    if (validationResult.value.valid && validationResult.value.normalizedUrl) {
      serverUrl.value = validationResult.value.normalizedUrl
    } else if (!validationResult.value.valid) {
      error.value = validationResult.value.error || '无效的服务器地址'
    }
  } catch (err) {
    error.value = '验证失败，请检查地址格式'
  } finally {
    isValidating.value = false
  }
}

// 测试服务器连接
async function testConnection() {
  if (!api || !serverUrl.value) return

  // 先验证 URL
  await validateUrl()
  if (error.value) return

  isTesting.value = true
  error.value = ''
  testResult.value = null

  try {
    testResult.value = await api.server.testConnection(serverUrl.value)
    if (!testResult.value.success) {
      error.value = testResult.value.error || '无法连接到服务器'
    }
  } catch (err) {
    error.value = '连接测试失败'
  } finally {
    isTesting.value = false
  }
}

// 下一步
async function nextStep() {
  if (currentStep.value === 1) {
    if (selectedMode.value === 'embedded') {
      // 内置服务器模式，直接完成设置
      await completeSetup()
    } else {
      // 远程服务器模式，进入第二步
      currentStep.value = 2
    }
  } else if (currentStep.value === 2) {
    await completeSetup()
  }
}

// 上一步
function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--
    error.value = ''
    testResult.value = null
    validationResult.value = null
  }
}

// 完成设置
async function completeSetup() {
  if (!api || !selectedMode.value) return

  isCompleting.value = true
  error.value = ''

  try {
    // 保存配置
    await api.server.setConfig({
      connectionMode: selectedMode.value,
      serverUrl: selectedMode.value === 'remote' ? serverUrl.value : undefined,
    })

    // 如果是内置服务器模式，启动服务器
    if (selectedMode.value === 'embedded') {
      await api.server.start()
    }

    // 标记设置完成
    await api.server.completeSetup()
    
    // 初始化存储管理器
    try {
      const config = await api.server.getConfig()
      let apiUrl: string
      
      if (config.connectionMode === 'embedded') {
        const status = await api.server.getStatus()
        apiUrl = `http://127.0.0.1:${status.port}/api`
      } else if (config.serverUrl) {
        apiUrl = `${config.serverUrl}/api`
      } else {
        throw new Error('无效的服务器配置')
      }
      
      await storageManager.initialize({
        mode: 'remote',
        apiUrl
      })
      console.log('✅ 存储管理器初始化成功')
    } catch (err) {
      console.error('存储初始化失败:', err)
      error.value = '无法连接到服务器，请检查配置'
      return
    }

    // 标记路由设置完成
    markSetupCompleted()

    ElMessage.success('服务器配置完成')
    
    // 跳转到登录页面
    router.push('/login')
  } catch (err) {
    console.error('完成设置失败:', err)
    error.value = '保存配置失败，请重试'
  } finally {
    isCompleting.value = false
  }
}
</script>

<template>
  <div class="setup-view">
    <div class="setup-container">
      <!-- 头部 -->
      <div class="setup-header">
        <div class="setup-logo">CYP</div>
        <h1>欢迎使用 CYP-memo</h1>
        <p class="setup-subtitle">备忘录系统 - 桌面客户端</p>
        <p class="setup-desc">请选择您的使用方式来开始</p>
      </div>

      <!-- 步骤指示器 -->
      <div class="step-indicator">
        <div 
          class="step-item" 
          :class="{ active: currentStep >= 1, completed: currentStep > 1 }"
        >
          <span class="step-number">1</span>
          <span class="step-label">选择模式</span>
        </div>
        <div class="step-line" :class="{ active: currentStep > 1 }"></div>
        <div 
          class="step-item" 
          :class="{ active: currentStep >= 2, completed: currentStep > 2 }"
          v-if="selectedMode === 'remote'"
        >
          <span class="step-number">2</span>
          <span class="step-label">配置服务器</span>
        </div>
      </div>

      <!-- 步骤 1: 选择连接模式 -->
      <div v-if="currentStep === 1" class="setup-content">
        <div class="mode-options">
          <div 
            class="mode-option"
            :class="{ selected: selectedMode === 'remote' }"
            @click="selectMode('remote')"
          >
            <div class="mode-icon">REMOTE</div>
            <div class="mode-info">
              <h3>连接远程服务器</h3>
              <p>连接到已部署的 CYP-memo 服务器</p>
              <ul class="mode-features">
                <li>多设备数据同步</li>
                <li>团队协作共享</li>
                <li>云端数据备份</li>
              </ul>
            </div>
            <div class="mode-check" v-if="selectedMode === 'remote'">OK</div>
          </div>

          <div 
            class="mode-option"
            :class="{ selected: selectedMode === 'embedded' }"
            @click="selectMode('embedded')"
          >
            <div class="mode-icon">LOCAL</div>
            <div class="mode-info">
              <h3>使用内置服务器</h3>
              <p>数据存储在本地，无需网络连接</p>
              <ul class="mode-features">
                <li>完全离线使用</li>
                <li>数据本地存储</li>
                <li>适合个人使用</li>
              </ul>
            </div>
            <div class="mode-check" v-if="selectedMode === 'embedded'">OK</div>
          </div>
        </div>
      </div>

      <!-- 步骤 2: 配置远程服务器 -->
      <div v-if="currentStep === 2" class="setup-content">
        <div class="server-config">
          <div class="config-field">
            <label>服务器地址</label>
            <div class="input-group">
              <input 
                v-model="serverUrl"
                type="url"
                placeholder="https://your-server.com"
                :disabled="isTesting"
                @keyup.enter="testConnection"
              />
              <button 
                class="test-btn"
                :disabled="!serverUrl || isValidating || isTesting"
                @click="testConnection"
              >
                <span v-if="isTesting">测试中...</span>
                <span v-else>测试连接</span>
              </button>
            </div>
            <p class="field-hint">请输入 CYP-memo 服务器的完整地址</p>
          </div>

          <!-- 测试结果 -->
          <div v-if="testResult?.success" class="test-result success">
            <span class="result-icon">✓</span>
            <div class="result-info">
              <span class="result-title">连接成功</span>
              <span v-if="testResult.version" class="result-detail">
                服务器版本: {{ testResult.version }}
              </span>
              <span v-if="testResult.latency" class="result-detail">
                延迟: {{ testResult.latency }}ms
              </span>
            </div>
          </div>

          <div v-if="error" class="test-result error">
            <span class="result-icon">✗</span>
            <div class="result-info">
              <span class="result-title">{{ error }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="setup-footer">
        <button 
          v-if="currentStep > 1"
          class="btn btn-secondary"
          :disabled="isCompleting"
          @click="prevStep"
        >
          上一步
        </button>
        <button 
          class="btn btn-primary"
          :disabled="!canProceed || isCompleting"
          @click="nextStep"
        >
          <span v-if="isCompleting">配置中...</span>
          <span v-else-if="currentStep === 1 && selectedMode === 'embedded'">开始使用</span>
          <span v-else-if="currentStep === 2">完成设置</span>
          <span v-else>下一步</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: 20px;
}

.setup-container {
  width: 100%;
  max-width: 700px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 16px;
  box-shadow: var(--cyp-chrome-shadow), 0 20px 60px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  padding: 40px;
  color: var(--cyp-text);
}

.setup-header {
  text-align: center;
  margin-bottom: 32px;
}

.setup-logo {
  font-size: 64px;
  margin-bottom: 16px;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.setup-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px;
}

.setup-subtitle {
  font-size: 16px;
  color: var(--cyp-brand);
  font-weight: 500;
  margin: 0 0 8px;
}

.setup-desc {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

/* 步骤指示器 */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--cyp-border);
  color: var(--cyp-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s;
}

.step-item.active .step-number {
  background: var(--cyp-brand);
  color: #ffffff;
}

.step-item.completed .step-number {
  background: var(--cyp-success);
  color: #ffffff;
}

.step-label {
  font-size: 14px;
  color: var(--cyp-text-secondary);
}

.step-line {
  width: 60px;
  height: 2px;
  background: var(--cyp-border);
  margin: 0 16px;
  transition: background 0.3s;
}

.step-line.active {
  background: var(--cyp-brand);
}

/* 内容区域 */
.setup-content {
  margin-bottom: 32px;
}

/* 模式选择 */
.mode-options {
  display: flex;
  gap: 20px;
}

.mode-option {
  flex: 1;
  position: relative;
  padding: 24px;
  border: 2px solid var(--cyp-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.mode-option:hover {
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

.mode-option.selected {
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

.mode-icon {
  font-size: 40px;
  margin-bottom: 16px;
}

.mode-info h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 8px;
}

.mode-info > p {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0 0 16px;
}

.mode-features {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mode-features li {
  font-size: 13px;
  color: var(--cyp-text-secondary);
  padding: 4px 0;
}

.mode-check {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 24px;
  height: 24px;
  background: var(--cyp-brand);
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

/* 服务器配置 */
.server-config {
  max-width: 500px;
  margin: 0 auto;
}

.config-field {
  margin-bottom: 20px;
}

.config-field label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text);
  margin-bottom: 8px;
}

.input-group {
  display: flex;
  gap: 12px;
}

.input-group input {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.input-group input:focus {
  border-color: var(--cyp-brand);
}

.input-group input:disabled {
  background: var(--cyp-bg-muted);
}

.test-btn {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-brand);
  background: transparent;
  border: 1px solid var(--cyp-brand);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.test-btn:hover:not(:disabled) {
  background: var(--cyp-brand);
  color: #ffffff;
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin: 8px 0 0;
}

/* 测试结果 */
.test-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
}

.test-result.success {
  background: color-mix(in srgb, var(--cyp-success) 12%, transparent);
}

.test-result.error {
  background: color-mix(in srgb, var(--cyp-danger) 12%, transparent);
}

.result-icon {
  font-size: 20px;
  font-weight: 600;
}

.test-result.success .result-icon {
  color: var(--cyp-success);
}

.test-result.error .result-icon {
  color: var(--cyp-danger);
}

.result-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
}

.test-result.success .result-title {
  color: var(--cyp-success);
}

.test-result.error .result-title {
  color: var(--cyp-danger);
}

.result-detail {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

/* 底部按钮 */
.setup-footer {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.btn {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--cyp-brand);
  color: #ffffff;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--cyp-brand-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: var(--cyp-text-secondary);
  border: 1px solid var(--cyp-border);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--cyp-text-secondary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 响应式 */
@media (max-width: 600px) {
  .setup-container {
    padding: 24px;
  }

  .mode-options {
    flex-direction: column;
  }

  .input-group {
    flex-direction: column;
  }

  .test-btn {
    width: 100%;
  }
}

/* 深色主题 */
html.dark .setup-container {
  background: var(--cyp-chrome-bg-panel);
}

html.dark .setup-header h1 {
  color: var(--cyp-text);
}

html.dark .setup-desc {
  color: var(--cyp-text-muted);
}

html.dark .step-label {
  color: var(--cyp-text-secondary);
}

html.dark .mode-option {
  border-color: var(--cyp-border);
}

html.dark .mode-option:hover,
html.dark .mode-option.selected {
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

html.dark .mode-info h3 {
  color: var(--cyp-text);
}

html.dark .mode-info > p {
  color: var(--cyp-text-muted);
}

html.dark .mode-features li {
  color: var(--cyp-text-secondary);
}

html.dark .config-field label {
  color: var(--cyp-text);
}

html.dark .input-group input {
  background: var(--cyp-bg-muted-solid);
  border-color: var(--cyp-border);
  color: var(--cyp-text);
}

html.dark .input-group input:focus {
  border-color: var(--cyp-brand);
}

html.dark .btn-secondary {
  color: var(--cyp-text-secondary);
  border-color: var(--cyp-border);
}

html.dark .btn-secondary:hover:not(:disabled) {
  border-color: var(--cyp-text-secondary);
}
</style>
