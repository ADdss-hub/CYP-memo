<script setup lang="ts">
/**
 * 服务器连接配置向导组件
 * Server connection setup wizard for first-time launch
 * 
 * 需求 8.1: 首次启动时提示用户选择连接模式
 */

import { ref, computed } from 'vue'
import { getElectronAPI } from '../composables'
import type { ConnectionMode, ServerValidationResult, ServerConnectionTestResult } from '../../shared/types'

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const api = getElectronAPI()

// 步骤状态
const currentStep = ref(1)
const selectedMode = ref<ConnectionMode | null>(null)
const serverUrl = ref('')
const isValidating = ref(false)
const isTesting = ref(false)
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

    emit('complete')
  } catch (err) {
    error.value = '保存配置失败'
  }
}
</script>

<template>
  <div class="setup-wizard">
    <div class="setup-wizard__header">
      <div class="setup-wizard__logo">📝</div>
      <h1>欢迎使用 CYP-memo</h1>
      <p class="setup-wizard__subtitle">容器备忘录系统 - 桌面客户端</p>
      <p>请选择您的使用方式</p>
    </div>

    <!-- 步骤 1: 选择连接模式 -->
    <div v-if="currentStep === 1" class="setup-wizard__content">
      <div class="mode-options">
        <div 
          class="mode-option"
          :class="{ 'mode-option--selected': selectedMode === 'remote' }"
          @click="selectMode('remote')"
        >
          <div class="mode-option__icon">🌐</div>
          <div class="mode-option__info">
            <h3>连接远程服务器</h3>
            <p>连接到已部署的 CYP-memo 服务器，支持多设备同步</p>
          </div>
        </div>

        <div 
          class="mode-option"
          :class="{ 'mode-option--selected': selectedMode === 'embedded' }"
          @click="selectMode('embedded')"
        >
          <div class="mode-option__icon">💻</div>
          <div class="mode-option__info">
            <h3>使用内置服务器</h3>
            <p>数据存储在本地，无需网络连接，适合个人使用</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 步骤 2: 配置远程服务器 -->
    <div v-if="currentStep === 2" class="setup-wizard__content">
      <div class="server-config">
        <label class="server-config__label">服务器地址</label>
        <div class="server-config__input-group">
          <input 
            v-model="serverUrl"
            type="url"
            placeholder="https://your-server.com"
            class="server-config__input"
            @blur="validateUrl"
          />
          <button 
            class="server-config__test-btn"
            :disabled="!serverUrl || isValidating || isTesting"
            @click="testConnection"
          >
            {{ isTesting ? '测试中...' : '测试连接' }}
          </button>
        </div>

        <!-- 验证/测试结果 -->
        <div v-if="testResult?.success" class="server-config__result server-config__result--success">
          ✓ 连接成功
          <span v-if="testResult.version">（服务器版本: {{ testResult.version }}）</span>
          <span v-if="testResult.latency">延迟: {{ testResult.latency }}ms</span>
        </div>

        <div v-if="error" class="server-config__result server-config__result--error">
          ✗ {{ error }}
        </div>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="setup-wizard__footer">
      <button 
        v-if="currentStep > 1"
        class="setup-wizard__btn setup-wizard__btn--secondary"
        @click="prevStep"
      >
        上一步
      </button>
      <button 
        class="setup-wizard__btn setup-wizard__btn--primary"
        :disabled="!canProceed"
        @click="nextStep"
      >
        {{ currentStep === 1 && selectedMode === 'embedded' ? '开始使用' : 
           currentStep === 2 ? '完成设置' : '下一步' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.setup-wizard {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 40px;
  background: var(--bg-primary, #ffffff);
}

.setup-wizard__header {
  text-align: center;
  margin-bottom: 40px;
}

.setup-wizard__logo {
  font-size: 64px;
  margin-bottom: 16px;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.setup-wizard__header h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary, #303133);
  margin: 0 0 8px;
}

.setup-wizard__subtitle {
  font-size: 16px;
  color: #667eea;
  font-weight: 500;
  margin: 0 0 8px;
}

.setup-wizard__header p {
  font-size: 16px;
  color: var(--text-secondary, #606266);
  margin: 0;
}

.setup-wizard__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.mode-options {
  display: flex;
  gap: 24px;
  max-width: 600px;
}

.mode-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  border: 2px solid var(--border-color, #dcdfe6);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-option:hover {
  border-color: var(--primary-color, #409eff);
  background: rgba(64, 158, 255, 0.05);
}

.mode-option--selected {
  border-color: var(--primary-color, #409eff);
  background: rgba(64, 158, 255, 0.1);
}

.mode-option__icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.mode-option__info {
  text-align: center;
}

.mode-option__info h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin: 0 0 8px;
}

.mode-option__info p {
  font-size: 14px;
  color: var(--text-secondary, #606266);
  margin: 0;
  line-height: 1.5;
}

.server-config {
  width: 100%;
  max-width: 500px;
}

.server-config__label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #303133);
  margin-bottom: 8px;
}

.server-config__input-group {
  display: flex;
  gap: 12px;
}

.server-config__input {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.server-config__input:focus {
  border-color: var(--primary-color, #409eff);
}

.server-config__test-btn {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-color, #409eff);
  background: transparent;
  border: 1px solid var(--primary-color, #409eff);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.server-config__test-btn:hover:not(:disabled) {
  background: var(--primary-color, #409eff);
  color: white;
}

.server-config__test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.server-config__result {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.server-config__result--success {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.server-config__result--error {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.setup-wizard__footer {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 40px;
}

.setup-wizard__btn {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.setup-wizard__btn--primary {
  background: var(--primary-color, #409eff);
  color: white;
  border: none;
}

.setup-wizard__btn--primary:hover:not(:disabled) {
  background: #66b1ff;
}

.setup-wizard__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.setup-wizard__btn--secondary {
  background: transparent;
  color: var(--text-secondary, #606266);
  border: 1px solid var(--border-color, #dcdfe6);
}

.setup-wizard__btn--secondary:hover {
  border-color: var(--text-secondary, #606266);
}

/* 深色主题 */
:root[data-theme='dark'] .setup-wizard,
html.dark .setup-wizard {
  background: var(--bg-primary, #1d1e1f);
}

:root[data-theme='dark'] .server-config__input,
html.dark .server-config__input {
  background: var(--bg-secondary, #262727);
  color: var(--text-primary, #e5eaf3);
}
</style>
