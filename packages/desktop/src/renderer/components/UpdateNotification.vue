<!--
  桌面端版本更新提示组件
  检测到新版本时显示更新提示，支持后台下载和安装
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Transition name="slide-down">
    <div v-if="showNotification" class="update-notification" :class="notificationClass">
      <div class="update-content">
        <span class="update-icon">{{ statusIcon }}</span>
        <span class="update-text">{{ statusText }}</span>
        
        <!-- 下载进度 -->
        <div v-if="isDownloading" class="progress-bar">
          <div class="progress-fill" :style="{ width: `${downloadProgress}%` }"></div>
        </div>
        
        <!-- 操作按钮 -->
        <template v-if="updateState === 'available'">
          <button class="btn btn-primary" @click="startDownload">下载更新</button>
          <button class="btn btn-text" @click="handleDismiss">稍后</button>
        </template>
        
        <template v-else-if="updateState === 'downloaded'">
          <button class="btn btn-primary" @click="installUpdate">立即安装</button>
          <button class="btn btn-text" @click="handleDismiss">稍后</button>
        </template>
        
        <template v-else-if="updateState === 'error'">
          <button class="btn btn-primary" @click="retryDownload">重试</button>
          <button class="btn btn-text" @click="handleDismiss">关闭</button>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

type UpdateState = 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'none'

const showNotification = ref(false)
const updateState = ref<UpdateState>('none')
const latestVersion = ref('')
const downloadProgress = ref(0)
const errorMessage = ref('')

const api = window.electronAPI

const isDownloading = computed(() => updateState.value === 'downloading')

const notificationClass = computed(() => ({
  'notification--downloading': isDownloading.value,
  'notification--ready': updateState.value === 'downloaded',
  'notification--error': updateState.value === 'error',
}))

const statusIcon = computed(() => {
  switch (updateState.value) {
    case 'checking': return '🔍'
    case 'available': return '🎉'
    case 'downloading': return '⬇️'
    case 'downloaded': return '✅'
    case 'error': return '❌'
    default: return ''
  }
})

const statusText = computed(() => {
  switch (updateState.value) {
    case 'checking': return '正在检查更新...'
    case 'available': return `发现新版本 v${latestVersion.value}`
    case 'downloading': return `正在下载 v${latestVersion.value} (${downloadProgress.value.toFixed(0)}%)`
    case 'downloaded': return `v${latestVersion.value} 已下载完成，重启后生效`
    case 'error': return `更新失败: ${errorMessage.value}`
    default: return ''
  }
})

async function checkForUpdates() {
  if (!api) return
  
  try {
    updateState.value = 'checking'
    const info = await api.update.check()
    
    if (info) {
      latestVersion.value = info.version
      updateState.value = 'available'
      showNotification.value = true
    } else {
      updateState.value = 'none'
    }
  } catch (error) {
    console.warn('[UpdateNotification] 检查更新失败:', error)
    updateState.value = 'none'
  }
}

async function startDownload() {
  if (!api) return
  
  try {
    updateState.value = 'downloading'
    downloadProgress.value = 0
    await api.update.download()
  } catch (error) {
    console.error('[UpdateNotification] 下载失败:', error)
    updateState.value = 'error'
    errorMessage.value = '下载失败，请重试'
  }
}

function retryDownload() {
  startDownload()
}

async function installUpdate() {
  if (!api) return
  await api.update.install()
}

function handleDismiss() {
  showNotification.value = false
  
  // 如果有可用更新，30分钟后再次提醒
  if (updateState.value === 'available' || updateState.value === 'downloaded') {
    setTimeout(() => {
      showNotification.value = true
    }, 30 * 60 * 1000)
  }
}

function setupUpdateListeners() {
  if (!api) return
  
  api.update.onUpdateAvailable((info) => {
    latestVersion.value = info.version
    updateState.value = 'available'
    showNotification.value = true
  })
  
  api.update.onDownloadProgress((progress) => {
    downloadProgress.value = progress
  })
  
  api.update.onUpdateDownloaded(() => {
    updateState.value = 'downloaded'
    downloadProgress.value = 100
  })
}

onMounted(() => {
  setupUpdateListeners()
  // 启动时检查更新
  setTimeout(checkForUpdates, 3000)
})

onUnmounted(() => {
  if (api) {
    api.update.removeListeners()
  }
})
</script>

<style scoped>
.update-notification {
  position: fixed;
  top: 32px; /* 为标题栏留出空间 */
  left: 0;
  right: 0;
  z-index: 9999;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.update-notification.notification--ready {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.update-notification.notification--error {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.update-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 600px;
  margin: 0 auto;
  flex-wrap: wrap;
}

.update-icon {
  font-size: 18px;
}

.update-text {
  font-size: 14px;
  font-weight: 500;
}

.progress-bar {
  width: 120px;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: white;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-primary:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-text {
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
}

.btn-text:hover {
  color: white;
}

/* 动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
