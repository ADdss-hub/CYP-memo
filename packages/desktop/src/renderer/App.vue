<script setup lang="ts">
/**
 * CYP-memo 桌面客户端主应用组件
 * Main application component for desktop client
 * 
 * 需求 10.1: 桌面客户端应在每个平台上提供原生外观和体验
 * 需求 8.1: 首次启动时提示用户选择连接模式
 */

import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useElectron, useNavigation, useNetworkStatus } from './composables'
import { TitleBar, ServerSetupWizard, UpdateNotification } from './components'

// Electron 环境检测
const { api, isElectronEnv, platform, features, versions, isMac } = useElectron()

// 网络状态
const { isOnline, checkStatus } = useNetworkStatus()

// 应用状态
const isFirstLaunch = ref(false)
const isLoading = ref(true)
const currentPath = ref('/')
const serverStatus = ref<{ running: boolean; port: number } | null>(null)

// 计算属性
const showTitleBar = computed(() => isElectronEnv.value && !isMac.value)
const appVersion = computed(() => versions.value?.electron || 'unknown')

// 导航处理
useNavigation((path: string) => {
  console.log('[App] Navigate to:', path)
  currentPath.value = path
  // TODO: 集成 Vue Router 后，这里应该调用 router.push(path)
})

// 初始化应用
async function initializeApp() {
  if (!api) {
    isLoading.value = false
    return
  }

  try {
    // 检查是否首次启动
    isFirstLaunch.value = await api.server.isFirstLaunch()

    if (!isFirstLaunch.value) {
      // 获取服务器状态
      serverStatus.value = await api.server.getStatus()
      
      // 检查网络状态
      await checkStatus()
    }
  } catch (error) {
    console.error('[App] Initialization error:', error)
  } finally {
    isLoading.value = false
  }
}

// 设置完成处理
async function handleSetupComplete() {
  isFirstLaunch.value = false
  
  // 重新获取服务器状态
  if (api) {
    serverStatus.value = await api.server.getStatus()
  }
}

// 生命周期
onMounted(() => {
  initializeApp()
})

onUnmounted(() => {
  // 清理资源
  if (api) {
    api.removeNavigateListener()
    api.startup.removeListeners()
  }
})
</script>

<template>
  <div 
    class="app-container"
    :class="{
      'app-container--electron': isElectronEnv,
      'app-container--with-titlebar': showTitleBar
    }"
  >
    <!-- 自定义标题栏 (Windows/Linux) -->
    <TitleBar v-if="showTitleBar" title="CYP-memo" />

    <!-- 更新通知 -->
    <UpdateNotification />

    <!-- 加载状态 -->
    <div v-if="isLoading" class="app-loading">
      <div class="app-loading__spinner"></div>
      <p>正在加载...</p>
    </div>

    <!-- 首次启动设置向导 -->
    <ServerSetupWizard 
      v-else-if="isFirstLaunch" 
      @complete="handleSetupComplete"
    />

    <!-- 主应用内容 -->
    <main v-else class="app-main">
      <header class="app-header">
        <h1>CYP-memo 桌面客户端</h1>
        <p class="subtitle">Desktop Client</p>
      </header>

      <div class="app-content">
        <!-- 系统状态卡片 -->
        <div class="status-card">
          <h2>系统状态</h2>
          <div class="status-item">
            <span class="label">运行环境:</span>
            <span class="value" :class="{ electron: isElectronEnv }">
              {{ isElectronEnv ? 'Electron' : 'Web Browser' }}
            </span>
          </div>
          <div class="status-item">
            <span class="label">操作系统:</span>
            <span class="value">{{ platform }}</span>
          </div>
          <div v-if="versions" class="status-item">
            <span class="label">Electron 版本:</span>
            <span class="value">{{ versions.electron }}</span>
          </div>
          <div class="status-item">
            <span class="label">网络状态:</span>
            <span class="value" :class="{ online: isOnline, offline: !isOnline }">
              {{ isOnline ? '在线' : '离线' }}
            </span>
          </div>
          <div v-if="serverStatus" class="status-item">
            <span class="label">服务器状态:</span>
            <span class="value" :class="{ running: serverStatus.running }">
              {{ serverStatus.running ? `运行中 (端口 ${serverStatus.port})` : '未运行' }}
            </span>
          </div>
        </div>

        <!-- 平台功能卡片 -->
        <div v-if="features" class="status-card">
          <h2>平台功能</h2>
          <div class="status-item">
            <span class="label">任务栏进度:</span>
            <span class="value">{{ features.supportsTaskbarProgress ? '支持' : '不支持' }}</span>
          </div>
          <div class="status-item">
            <span class="label">Dock 徽章:</span>
            <span class="value">{{ features.supportsDockBadge ? '支持' : '不支持' }}</span>
          </div>
          <div class="status-item">
            <span class="label">桌面集成:</span>
            <span class="value">{{ features.supportsDesktopIntegration ? '支持' : '不支持' }}</span>
          </div>
          <div class="status-item">
            <span class="label">原生通知:</span>
            <span class="value">{{ features.supportsNativeNotifications ? '支持' : '不支持' }}</span>
          </div>
        </div>

        <!-- 开发说明卡片 -->
        <div class="info-card">
          <h2>开发说明</h2>
          <p>此页面为桌面客户端的临时占位页面。</p>
          <p>后续将集成现有 Vue 3 应用 (packages/app)。</p>
          <p v-if="currentPath !== '/'">当前导航路径: {{ currentPath }}</p>
        </div>
      </div>

      <footer class="app-footer">
        <p>CYP-memo v1.7.9 | Electron {{ appVersion }}</p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.app-container--with-titlebar {
  /* 为自定义标题栏留出空间 */
}

.app-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.app-loading__spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.app-header {
  text-align: center;
  padding: 2rem;
}

.app-header h1 {
  margin: 0;
  font-size: 2.5rem;
  font-weight: 600;
}

.subtitle {
  margin: 0.5rem 0 0;
  opacity: 0.8;
  font-size: 1.1rem;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
}

.status-card,
.info-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 1.5rem 2rem;
  width: 100%;
  max-width: 400px;
}

.status-card h2,
.info-card h2 {
  margin: 0 0 1rem;
  font-size: 1.2rem;
  font-weight: 500;
}

.status-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.status-item:last-child {
  border-bottom: none;
}

.label {
  opacity: 0.8;
}

.value {
  font-weight: 500;
}

.value.electron {
  color: #4ade80;
}

.value.online {
  color: #4ade80;
}

.value.offline {
  color: #f87171;
}

.value.running {
  color: #4ade80;
}

.info-card p {
  margin: 0.5rem 0;
  opacity: 0.9;
  line-height: 1.6;
}

.app-footer {
  text-align: center;
  padding: 1rem;
  opacity: 0.7;
  font-size: 0.9rem;
}

.app-footer p {
  margin: 0;
}
</style>
