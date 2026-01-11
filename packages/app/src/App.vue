<template>
  <div id="app" :data-theme="settingsStore.settings.theme" :data-font-size="settingsStore.settings.fontSize">
    <router-view />
    <TermsDialog />
    <SessionExpiredDialog 
      :visible="showSessionExpired" 
      :message="sessionExpiredMessage"
      :type="sessionExpiredType"
      :title="sessionExpiredTitle"
      :hint="sessionExpiredHint"
      @confirm="handleSessionExpiredConfirm"
    />
    <UpdateNotification />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { VERSION } from '@cyp-memo/shared'
import { useSettingsStore } from './stores/settings'
import { useAuthStore } from './stores/auth'
import TermsDialog from './components/TermsDialog.vue'
import SessionExpiredDialog from './components/SessionExpiredDialog.vue'
import UpdateNotification from './components/UpdateNotification.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()

// 会话失效状态
const showSessionExpired = ref(false)
const sessionExpiredMessage = ref('')
const sessionExpiredType = ref<'expired' | 'restricted' | 'warning'>('restricted')
const sessionExpiredTitle = ref('使用受限')
const sessionExpiredHint = ref('请重新登录本系统才能继续使用，如有问题请联系系统管理员')
let sessionCheckTimer: number | null = null

console.log(`CYP-memo v${VERSION.full}`)

// 应用主题到 body
function applyTheme() {
  const theme = settingsStore.settings.theme
  const fontSize = settingsStore.settings.fontSize
  
  // 设置 data-theme 属性
  document.body.setAttribute('data-theme', theme)
  document.body.setAttribute('data-font-size', fontSize)
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-font-size', fontSize)
  
  // Element Plus 深色主题需要在 html 元素上添加 dark 类
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// 监听主题变化
watch(
  () => settingsStore.settings.theme,
  () => {
    applyTheme()
  }
)

// 监听字体大小变化
watch(
  () => settingsStore.settings.fontSize,
  () => {
    applyTheme()
  }
)

/**
 * 验证会话有效性
 */
async function checkSession() {
  // 只在已登录状态下检查
  if (!authStore.isAuthenticated) {
    return
  }

  const result = await authStore.validateSession()
  
  if (!result.valid) {
    // 会话失效，显示提示
    // 根据失效原因设置不同的提示类型
    if (result.reason?.includes('已被删除') || result.reason?.includes('不存在')) {
      sessionExpiredType.value = 'restricted'
      sessionExpiredTitle.value = '账号受限'
      sessionExpiredMessage.value = result.reason || '您的账号已被删除或不存在'
      sessionExpiredHint.value = '您的账号可能已被管理员删除，如有疑问请联系系统管理员'
    } else if (result.reason?.includes('数据库') || result.reason?.includes('重置')) {
      sessionExpiredType.value = 'warning'
      sessionExpiredTitle.value = '数据异常'
      sessionExpiredMessage.value = result.reason || '系统数据可能已被重置'
      sessionExpiredHint.value = '系统数据可能已被重置，请重新登录。如有问题请联系系统管理员'
    } else {
      sessionExpiredType.value = 'expired'
      sessionExpiredTitle.value = '会话过期'
      sessionExpiredMessage.value = result.reason || '您的登录会话已过期'
      sessionExpiredHint.value = '为了您的账号安全，请重新登录'
    }
    showSessionExpired.value = true
    
    // 停止定时检查
    stopSessionCheck()
  }
}

/**
 * 启动会话检查定时器
 */
function startSessionCheck() {
  // 每30秒检查一次会话
  sessionCheckTimer = window.setInterval(checkSession, 30000)
}

/**
 * 停止会话检查定时器
 */
function stopSessionCheck() {
  if (sessionCheckTimer) {
    clearInterval(sessionCheckTimer)
    sessionCheckTimer = null
  }
}

/**
 * 处理会话失效确认
 */
function handleSessionExpiredConfirm() {
  showSessionExpired.value = false
  authStore.forceLogout()
  router.push('/login')
}

// 监听登录状态变化
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      // 登录后启动会话检查
      startSessionCheck()
    } else {
      // 退出后停止会话检查
      stopSessionCheck()
    }
  }
)

// 初始化时应用主题
onMounted(() => {
  applyTheme()
  
  // 如果已登录，启动会话检查
  if (authStore.isAuthenticated) {
    startSessionCheck()
  }
})

// 组件卸载时清理定时器
onUnmounted(() => {
  stopSessionCheck()
})
</script>

<style>
#app {
  font-family:
    'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑',
    Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 全局主题变量 */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f7fa;
  --text-primary: #303133;
  --text-secondary: #606266;
  --text-tertiary: #909399;
  --border-color: #dcdfe6;
  --primary-color: #409eff;
}

[data-theme='dark'],
html.dark {
  --bg-primary: #1d1e1f;
  --bg-secondary: #262727;
  --text-primary: #e5eaf3;
  --text-secondary: #cfd3dc;
  --text-tertiary: #8a8f99;
  --border-color: #414243;
  --primary-color: #409eff;
}

/* 全局字体大小 */
[data-font-size='small'] {
  font-size: 12px;
}

[data-font-size='medium'] {
  font-size: 14px;
}

[data-font-size='large'] {
  font-size: 16px;
}

/* 应用主题到 body */
body[data-theme='dark'],
html.dark body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

/* Element Plus 深色主题全局覆盖 */
html.dark .el-card {
  --el-card-bg-color: var(--bg-secondary);
  --el-card-border-color: var(--border-color);
  background-color: var(--bg-secondary);
  border-color: var(--border-color);
}

html.dark .el-card__header {
  border-bottom-color: var(--border-color);
}

html.dark .el-dialog {
  --el-dialog-bg-color: var(--bg-secondary);
  --el-dialog-title-font-size: 18px;
  background-color: var(--bg-secondary);
}

html.dark .el-dialog__header {
  border-bottom-color: var(--border-color);
}

html.dark .el-dialog__title {
  color: var(--text-primary);
}

html.dark .el-dialog__body {
  color: var(--text-secondary);
}

html.dark .el-form-item__label {
  color: var(--text-secondary);
}

html.dark .el-input__wrapper {
  background-color: var(--bg-primary);
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

html.dark .el-input__inner {
  color: var(--text-primary);
}

html.dark .el-input__inner::placeholder {
  color: var(--text-tertiary);
}

html.dark .el-select .el-input__wrapper {
  background-color: var(--bg-primary);
}

html.dark .el-select-dropdown {
  background-color: var(--bg-secondary);
  border-color: var(--border-color);
}

html.dark .el-select-dropdown__item {
  color: var(--text-primary);
}

html.dark .el-select-dropdown__item.hover,
html.dark .el-select-dropdown__item:hover {
  background-color: var(--bg-primary);
}

html.dark .el-table {
  --el-table-bg-color: var(--bg-secondary);
  --el-table-tr-bg-color: var(--bg-secondary);
  --el-table-header-bg-color: var(--bg-primary);
  --el-table-row-hover-bg-color: var(--bg-primary);
  --el-table-border-color: var(--border-color);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-primary);
}

html.dark .el-table th.el-table__cell {
  background-color: var(--bg-primary);
}

html.dark .el-menu {
  --el-menu-bg-color: var(--bg-secondary);
  --el-menu-text-color: var(--text-primary);
  --el-menu-hover-bg-color: var(--bg-primary);
  --el-menu-active-color: var(--primary-color);
  background-color: var(--bg-secondary);
  border-right-color: var(--border-color);
}

html.dark .el-menu-item {
  color: var(--text-primary);
}

html.dark .el-menu-item:hover {
  background-color: var(--bg-primary);
}

html.dark .el-menu-item.is-active {
  color: var(--primary-color);
  background-color: var(--bg-primary);
}

html.dark .el-empty__description {
  color: var(--text-tertiary);
}

html.dark .el-alert {
  --el-alert-bg-color: var(--bg-primary);
}

html.dark .el-checkbox__label {
  color: var(--text-primary);
}

html.dark .el-date-picker {
  --el-datepicker-bg-color: var(--bg-secondary);
  --el-datepicker-border-color: var(--border-color);
  --el-datepicker-text-color: var(--text-primary);
}

html.dark .el-picker-panel {
  background-color: var(--bg-secondary);
  border-color: var(--border-color);
}

html.dark .el-date-picker__header-label {
  color: var(--text-primary);
}

html.dark .el-picker-panel__content {
  color: var(--text-primary);
}

html.dark .el-date-table td.available:hover {
  background-color: var(--bg-primary);
}

html.dark .el-textarea__inner {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

html.dark .el-textarea__inner::placeholder {
  color: var(--text-tertiary);
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #999;
}

/* 深色主题滚动条 */
html.dark ::-webkit-scrollbar-thumb {
  background: #555;
}

html.dark ::-webkit-scrollbar-thumb:hover {
  background: #777;
}

/* Firefox 滚动条 */
* {
  scrollbar-width: thin;
  scrollbar-color: #ccc transparent;
}

*:hover {
  scrollbar-color: #999 transparent;
}

html.dark * {
  scrollbar-color: #555 transparent;
}

html.dark *:hover {
  scrollbar-color: #777 transparent;
}
</style>
