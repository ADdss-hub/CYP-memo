<template>
  <div
    class="app-root"
    :data-theme="settingsStore.settings.theme"
    :data-font-size="settingsStore.settings.fontSize"
  >
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

// 尽早应用主题（避免首屏 Element Plus 浅色闪一下）
applyTheme()

// 监听主题变化
watch(
  () => settingsStore.settings.theme,
  () => {
    applyTheme()
  },
  { immediate: true }
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
.app-root {
  font-family: var(--cyp-font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
  min-height: 100%;
}

/* 全局主题变量：权威源见 styles/theme.css（军械库 #0099FF） */
:root {
  --bg-primary: var(--cyp-bg-card);
  --bg-secondary: var(--cyp-bg-page);
  --text-primary: var(--cyp-text);
  --text-secondary: var(--cyp-text-secondary);
  --text-tertiary: var(--cyp-text-muted);
  --border-color: var(--cyp-border);
  --primary-color: var(--cyp-brand);
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

/* Element Plus / 滚动条皮肤已上移至 styles/theme.css */
</style>
