<!--
  CYP-memo 系统设置界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->

<template>
  <AppLayout>
    <div class="settings-view">
      <div class="page-header">
        <Button type="text" @click="handleBack">
          <span class="back-icon">←</span> 返回
        </Button>
        <h1 class="settings-title">系统设置</h1>
      </div>

      <!-- 外观设置 -->
      <section class="settings-section">
        <h2 class="section-title">外观设置</h2>

        <div class="setting-item">
          <label class="setting-label">主题</label>
          <div class="setting-control">
            <select v-model="localTheme" class="setting-select" @change="handleThemeChange">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">字体大小</label>
          <div class="setting-control">
            <select v-model="localFontSize" class="setting-select" @change="handleFontSizeChange">
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">语言</label>
          <div class="setting-control">
            <select v-model="localLanguage" class="setting-select" @change="handleLanguageChange">
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 系统数据管理 -->
      <section class="settings-section">
        <h2 class="section-title">系统数据管理</h2>

        <div class="setting-item">
          <label class="setting-label">清除缓存</label>
          <div class="setting-control">
            <Button type="secondary" @click="handleClearCache"> 清除缓存 </Button>
            <span class="setting-hint">清除浏览器缓存数据</span>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">导出数据</label>
          <div class="setting-control">
            <Button type="primary" @click="handleExportData"> 导出数据 </Button>
            <span class="setting-hint">导出所有备忘录和设置</span>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">导入数据</label>
          <div class="setting-control">
            <input
              ref="importFileInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="handleImportData"
            />
            <Button type="primary" @click="triggerImportFile"> 导入数据 </Button>
            <span class="setting-hint">从 JSON 文件导入数据</span>
          </div>
        </div>
      </section>

      <!-- 系统信息 -->
      <section class="settings-section">
        <h2 class="section-title">系统信息</h2>

        <div class="setting-item">
          <label class="setting-label">版本号</label>
          <div class="setting-value">
            {{ version }}
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">作者</label>
          <div class="setting-value">
            {{ author }}
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">联系邮箱</label>
          <div class="setting-value">
            {{ email }}
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">版权信息</label>
          <div class="setting-value">
            {{ copyright }}
          </div>
        </div>
      </section>

      <!-- 导入确认对话框 -->
      <Modal v-if="showImportConfirm" title="确认导入" @close="showImportConfirm = false">
        <div class="import-confirm">
          <p>导入数据将覆盖当前所有数据，此操作不可撤销。</p>
          <p>是否继续？</p>
          <div class="form-actions">
            <Button type="secondary" @click="showImportConfirm = false"> 取消 </Button>
            <Button type="danger" @click="confirmImport"> 确认导入 </Button>
          </div>
        </div>
      </Modal>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { dataManager } from '@cyp-memo/shared'
import { VERSION } from '@shared/config/version'
import { useToast } from '../composables/useToast'
import AppLayout from '../components/AppLayout.vue'
import Button from '../components/Button.vue'
import Modal from '../components/Modal.vue'

const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const toast = useToast()

// 本地状态
const localTheme = ref(settingsStore.settings.theme)
const localFontSize = ref(settingsStore.settings.fontSize)
const localLanguage = ref(settingsStore.settings.language)
const showImportConfirm = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)
const pendingImportData = ref<string | null>(null)

// 版本信息
const version = computed(() => VERSION.full)
const author = computed(() => VERSION.author)
const email = computed(() => VERSION.email)
const copyright = computed(() => VERSION.copyright)

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

/**
 * 切换令牌可见性
 */
function toggleTokenVisibility() {
  // 功能已移除
}

/**
 * 复制令牌
 */
async function copyToken() {
  // 功能已移除
}

/**
 * 处理主题切换
 */
async function handleThemeChange() {
  try {
    await settingsStore.setTheme(localTheme.value)
    toast.success('主题已更新')

    // 应用主题到 body 和 html
    document.body.setAttribute('data-theme', localTheme.value)
    document.documentElement.setAttribute('data-theme', localTheme.value)
    
    // Element Plus 深色主题需要在 html 元素上添加 dark 类
    if (localTheme.value === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  } catch (error) {
    toast.error('主题更新失败')
    console.error('Theme change error:', error)
  }
}

/**
 * 处理字体大小切换
 */
async function handleFontSizeChange() {
  try {
    await settingsStore.setFontSize(localFontSize.value)
    toast.success('字体大小已更新')

    // 应用字体大小到 body 和 html
    document.body.setAttribute('data-font-size', localFontSize.value)
    document.documentElement.setAttribute('data-font-size', localFontSize.value)
  } catch (error) {
    toast.error('字体大小更新失败')
    console.error('Font size change error:', error)
  }
}

/**
 * 处理语言切换
 */
async function handleLanguageChange() {
  try {
    await settingsStore.setLanguage(localLanguage.value)
    toast.success('语言已更新')
  } catch (error) {
    toast.error('语言更新失败')
    console.error('Language change error:', error)
  }
}

/**
 * 更新安全问题
 */
async function handleUpdateSecurityQuestion() {
  // 功能已移除
}

/**
 * 清除缓存
 */
async function handleClearCache() {
  try {
    // 清除 localStorage 中的缓存（保留认证信息和设置）
    const authData = localStorage.getItem('cyp-memo-auth')
    const settingsData = localStorage.getItem('cyp-memo-settings')

    localStorage.clear()

    if (authData) localStorage.setItem('cyp-memo-auth', authData)
    if (settingsData) localStorage.setItem('cyp-memo-settings', settingsData)

    toast.success('缓存已清除')
  } catch (error) {
    toast.error('清除缓存失败')
    console.error('Clear cache error:', error)
  }
}

/**
 * 导出数据
 */
async function handleExportData() {
  try {
    const jsonData = await dataManager.exportToJSON()

    // 创建 Blob 时指定 UTF-8 编码
    const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cyp-memo-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('数据导出成功')
  } catch (error) {
    toast.error('数据导出失败')
    console.error('Export data error:', error)
  }
}

/**
 * 触发文件选择
 */
function triggerImportFile() {
  importFileInput.value?.click()
}

/**
 * 处理导入数据
 */
async function handleImportData(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  try {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      pendingImportData.value = content
      showImportConfirm.value = true
    }
    reader.onerror = () => {
      toast.error('读取文件失败')
    }
    reader.readAsText(file)
  } catch (error) {
    toast.error('读取文件失败')
    console.error('Import data error:', error)
  }

  // 重置文件输入
  if (importFileInput.value) {
    importFileInput.value.value = ''
  }
}

/**
 * 确认导入
 */
async function confirmImport() {
  if (!pendingImportData.value) {
    toast.error('没有待导入的数据')
    return
  }

  try {
    await dataManager.importFromJSON(pendingImportData.value, false)
    toast.success('数据导入成功，请重新登录')

    // 清除当前会话，要求重新登录
    await authStore.logout()

    showImportConfirm.value = false
    pendingImportData.value = null
  } catch (error) {
    toast.error('数据导入失败: ' + (error instanceof Error ? error.message : '未知错误'))
    console.error('Confirm import error:', error)
  }
}

/**
 * 初始化
 */
onMounted(() => {
  // 应用当前主题和字体大小
  document.body.setAttribute('data-theme', localTheme.value)
  document.body.setAttribute('data-font-size', localFontSize.value)
  document.documentElement.setAttribute('data-theme', localTheme.value)
  document.documentElement.setAttribute('data-font-size', localFontSize.value)
  
  // Element Plus 深色主题需要在 html 元素上添加 dark 类
  if (localTheme.value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
})
</script>

<style scoped>
.settings-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 30px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

.settings-title {
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #333);
}

.settings-section {
  background: var(--bg-secondary, #fff);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--text-primary, #333);
  border-bottom: 2px solid var(--border-color, #e0e0e0);
  padding-bottom: 10px;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  flex: 0 0 150px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.setting-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-value {
  flex: 1;
  color: var(--text-secondary, #666);
}

.setting-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  font-size: 14px;
  cursor: pointer;
  min-width: 120px;
}

.setting-select:focus {
  outline: none;
  border-color: var(--primary-color, #409eff);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-tertiary, #999);
}

.token-control {
  display: flex;
  gap: 8px;
}

.token-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  font-family: monospace;
  font-size: 14px;
}

.security-form {
  padding: 20px 0;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 14px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color, #409eff);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.import-confirm {
  padding: 20px 0;
}

.import-confirm p {
  margin-bottom: 12px;
  color: var(--text-primary, #333);
  line-height: 1.6;
}

/* 深色主题 */
[data-theme='dark'] .settings-view {
  color: #e0e0e0;
}

[data-theme='dark'] .settings-title,
[data-theme='dark'] .section-title,
[data-theme='dark'] .setting-label,
[data-theme='dark'] .form-group label {
  color: #e0e0e0;
}

[data-theme='dark'] .settings-section {
  background: #2c2c2c;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

[data-theme='dark'] .setting-select,
[data-theme='dark'] .token-input,
[data-theme='dark'] .form-input {
  background: #1e1e1e;
  border-color: #444;
  color: #e0e0e0;
}

[data-theme='dark'] .setting-value {
  color: #b0b0b0;
}

[data-theme='dark'] .setting-hint {
  color: #888;
}

/* 字体大小 */
[data-font-size='small'] .settings-view {
  font-size: 12px;
}

[data-font-size='medium'] .settings-view {
  font-size: 14px;
}

[data-font-size='large'] .settings-view {
  font-size: 16px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .settings-view {
    padding: 16px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .setting-label {
    flex: none;
  }

  .setting-control {
    width: 100%;
  }

  .token-control {
    flex-direction: column;
  }

  .token-input {
    width: 100%;
  }
}
</style>
