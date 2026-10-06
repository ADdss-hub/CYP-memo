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

      <!-- 账号与数据 -->
      <section class="settings-section">
        <h2 class="section-title">账号与数据</h2>

        <div class="setting-item">
          <label class="setting-label" for="purge-related-toggle">账号注销后清除内容</label>
          <div class="setting-control">
            <label class="setting-switch">
              <input
                id="purge-related-toggle"
                v-model="localPurgeRelated"
                type="checkbox"
                @change="handlePurgeRelatedChange"
              />
              <span
                >仅在账号被注销或删除时生效（退出当前账号不会清除数据）。开启后自动清除该账号全部相关内容（备忘录、文件、分享等）</span
              >
            </label>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">退出当前账号</label>
          <div class="setting-control">
            <Button type="secondary" @click="handleLogoutSession">退出当前账号</Button>
            <span class="setting-hint">仅退出登录会话，不注销账号，不清除数据</span>
          </div>
        </div>

        <div class="setting-item">
          <label class="setting-label">注销本账号</label>
          <div class="setting-control">
            <Button type="danger" @click="handleCancelAccount">注销本账号</Button>
            <span class="setting-hint">{{
              authStore.isMainAccount
                ? '将注销主账号及全部子账号；是否清除内容取决于上方开关'
                : '将注销当前子账号；是否清除内容取决于上方开关'
            }}</span>
          </div>
        </div>
        <div class="setting-item">
          <label class="setting-label">MCP</label>
          <div class="setting-control">
            <Button type="secondary" @click="router.push('/help/mcp')">打开 MCP 界面</Button>
            <span class="setting-hint">令牌签发与客户端配置在独立 MCP 页</span>
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
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { dataManager, resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
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
const localPurgeRelated = ref(settingsStore.purgeRelatedOnAccountDelete)
const showImportConfirm = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)
const pendingImportData = ref<string | null>(null)

async function syncPurgeSettingToServer(value: boolean) {
  try {
    const adapter = storageManager.getAdapter() as {
      getAccessToken?: () => string | undefined
      setSetting?: (key: string, value: unknown) => Promise<void>
    }
    if (typeof adapter.setSetting === 'function') {
      await adapter.setSetting('purgeRelatedOnAccountDelete', value)
      return
    }
    const token = adapter.getAccessToken?.()
    if (!token) return
    const api = resolveApiBaseUrl({
      VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
      PROD: import.meta.env.PROD,
    })
    await fetch(`${api}/settings/purgeRelatedOnAccountDelete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    })
  } catch (err) {
    console.warn('同步注销清除设置到服务端失败（已保留本地）:', err)
  }
}

async function handlePurgeRelatedChange() {
  try {
    await settingsStore.setPurgeRelatedOnAccountDelete(localPurgeRelated.value)
    await syncPurgeSettingToServer(localPurgeRelated.value)
    toast.success(
      localPurgeRelated.value ? '已开启账号注销后自动清除内容' : '已关闭账号注销后自动清除内容'
    )
  } catch (error) {
    localPurgeRelated.value = settingsStore.purgeRelatedOnAccountDelete
    toast.error('设置更新失败')
    console.error('Purge related setting error:', error)
  }
}

async function handleLogoutSession() {
  try {
    await ElMessageBox.confirm(
      '确定退出当前账号吗？退出后需重新登录。不会注销账号，也不会清除数据。',
      '退出当前账号',
      {
        confirmButtonText: '退出',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    await authStore.logout()
    router.push('/login')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    toast.error(err instanceof Error ? err.message : '退出失败')
  }
}

async function handleCancelAccount() {
  const purgeHint = localPurgeRelated.value
    ? '并按设置清除相关内容（备忘录、文件、分享等）'
    : '但不会自动清除业务内容（可在上方开启「账号注销后清除内容」）'
  const scopeHint = authStore.isMainAccount
    ? '将注销主账号及全部子账号'
    : '将注销当前子账号'
  try {
    await ElMessageBox.confirm(
      `确定注销本账号吗？${scopeHint}，${purgeHint}。此操作不可撤销。`,
      '注销本账号',
      {
        confirmButtonText: '注销',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }
  try {
    const result = await authStore.cancelOwnAccount()
    toast.success(result.message || '已注销本账号')
    router.push('/login')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '注销账号失败')
  }
}

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
onMounted(async () => {
  document.body.setAttribute('data-theme', localTheme.value)
  document.body.setAttribute('data-font-size', localFontSize.value)
  document.documentElement.setAttribute('data-theme', localTheme.value)
  document.documentElement.setAttribute('data-font-size', localFontSize.value)

  if (localTheme.value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }

  try {
    const adapter = storageManager.getAdapter()
    const remote = await adapter.getSetting<boolean>('purgeRelatedOnAccountDelete')
    if (typeof remote === 'boolean') {
      localPurgeRelated.value = remote
      await settingsStore.setPurgeRelatedOnAccountDelete(remote)
    } else {
      localPurgeRelated.value = settingsStore.purgeRelatedOnAccountDelete
      await syncPurgeSettingToServer(localPurgeRelated.value)
    }
  } catch {
    localPurgeRelated.value = settingsStore.purgeRelatedOnAccountDelete
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
  color: var(--cyp-text);
}

.settings-section {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--cyp-text);
  border-bottom: 2px solid var(--cyp-border);
  padding-bottom: 10px;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--cyp-border);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  flex: 0 0 150px;
  font-weight: 500;
  color: var(--cyp-text);
}

.setting-control {
  flex: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.setting-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  line-height: 1.45;
  color: var(--cyp-text-secondary);
  cursor: pointer;
}

.setting-switch input {
  margin-top: 3px;
  flex-shrink: 0;
}

.setting-value {
  flex: 1;
  color: var(--cyp-text-secondary);
}

.setting-select {
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 4px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-size: 14px;
  cursor: pointer;
  min-width: 120px;
}

.setting-select:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.setting-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.token-control {
  display: flex;
  gap: 8px;
}

.token-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 4px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-family: var(--cyp-font-mono);
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
  color: var(--cyp-text);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 4px;
  font-size: 14px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
}

.form-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
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
  color: var(--cyp-text);
  line-height: 1.6;
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
