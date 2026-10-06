<!--
  桌面端版本更新提示组件
  检测到新版本时显示更新提示，支持后台下载和安装
  
  功能:
  - 自动检测新版本
  - 后台下载更新
  - 下载进度显示
  - 更新日志显示
  - 失败重试机制
  - 安装提示
  
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Transition name="slide-down">
    <div v-if="showNotification" class="update-notification" :class="notificationClass">
      <div class="update-content">
        <span class="update-icon">{{ statusIcon }}</span>
        <span class="update-text">{{ statusText }}</span>
        
        <!-- 下载进度 -->
        <div v-if="isDownloading" class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${downloadProgress}%` }"></div>
          </div>
          <span class="progress-text">{{ downloadProgress.toFixed(0) }}%</span>
        </div>
        
        <!-- 操作按钮 -->
        <template v-if="updateState === 'available'">
          <button class="btn btn-primary" @click="startDownload">
            <span class="btn-icon">⬇️</span> 下载更新
          </button>
          <button v-if="releaseNotes" class="btn btn-secondary" @click="showReleaseNotes = true">
            更新日志
          </button>
          <button class="btn btn-text" @click="handleDismiss">稍后</button>
        </template>
        
        <template v-else-if="updateState === 'downloaded'">
          <button class="btn btn-success" @click="installUpdate">
            <span class="btn-icon">🚀</span> 立即安装
          </button>
          <button class="btn btn-text" @click="handleDismiss">稍后</button>
        </template>
        
        <template v-else-if="updateState === 'error'">
          <button class="btn btn-primary" @click="retryDownload">
            <span class="btn-icon">🔄</span> 重试
          </button>
          <button class="btn btn-text" @click="handleDismiss">关闭</button>
        </template>
      </div>
    </div>
  </Transition>

  <!-- 更新日志弹窗 -->
  <Transition name="fade">
    <div v-if="showReleaseNotes" class="modal-overlay" @click.self="showReleaseNotes = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>更新日志 - v{{ latestVersion }}</h3>
          <button class="modal-close" @click="showReleaseNotes = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="releaseDate" class="release-date">
            发布时间: {{ formatDate(releaseDate) }}
          </div>
          <div class="release-notes-content" v-html="formattedReleaseNotes"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-text" @click="showReleaseNotes = false">关闭</button>
          <button class="btn btn-primary" @click="startDownload">下载更新</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { sanitizeHtml } from '@cyp-memo/shared'

type UpdateState = 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'none'

const showNotification = ref(false)
const showReleaseNotes = ref(false)
const updateState = ref<UpdateState>('none')
const latestVersion = ref('')
const releaseNotes = ref('')
const releaseDate = ref('')
const downloadProgress = ref(0)
const errorMessage = ref('')

const api = window.electronAPI

const isDownloading = computed(() => updateState.value === 'downloading')

const notificationClass = computed(() => ({
  'notification--checking': updateState.value === 'checking',
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
    case 'downloading': return `正在下载 v${latestVersion.value}`
    case 'downloaded': return `v${latestVersion.value} 已下载完成，重启后生效`
    case 'error': return `更新失败: ${errorMessage.value}`
    default: return ''
  }
})

/**
 * 格式化更新日志
 */
const formattedReleaseNotes = computed(() => {
  if (!releaseNotes.value) return '<p>暂无更新说明</p>'

  const html = releaseNotes.value
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  return sanitizeHtml(html)
})

/**
 * 格式化日期
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 检查更新
 */
async function checkForUpdates() {
  if (!api) return
  
  try {
    updateState.value = 'checking'
    const info = await api.update.check()
    
    if (info) {
      latestVersion.value = info.version
      releaseNotes.value = info.releaseNotes || ''
      releaseDate.value = info.releaseDate || ''
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

/**
 * 开始下载
 */
async function startDownload() {
  if (!api) return
  
  showReleaseNotes.value = false
  
  try {
    updateState.value = 'downloading'
    downloadProgress.value = 0
    await api.update.download()
  } catch (error) {
    console.error('[UpdateNotification] 下载失败:', error)
    updateState.value = 'error'
    errorMessage.value = '下载失败，请检查网络连接'
  }
}

/**
 * 重试下载
 */
function retryDownload() {
  errorMessage.value = ''
  startDownload()
}

/**
 * 安装更新
 */
async function installUpdate() {
  if (!api) return
  await api.update.install()
}

/**
 * 稍后提醒
 */
function handleDismiss() {
  showNotification.value = false
  
  // 如果有可用更新或已下载，30分钟后再次提醒
  if (updateState.value === 'available' || updateState.value === 'downloaded') {
    setTimeout(() => {
      showNotification.value = true
    }, 30 * 60 * 1000)
  }
}

/**
 * 设置更新事件监听
 */
function setupUpdateListeners() {
  if (!api) return
  
  api.update.onUpdateAvailable((info) => {
    latestVersion.value = info.version
    releaseNotes.value = info.releaseNotes || ''
    releaseDate.value = info.releaseDate || ''
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
  // 启动时延迟检查更新
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
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  padding: 12px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.update-notification.notification--checking {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-soft) 100%);
}

.update-notification.notification--ready {
  background: linear-gradient(135deg, var(--cyp-success) 0%, var(--cyp-success-hover) 100%);
}

.update-notification.notification--error {
  background: linear-gradient(135deg, var(--cyp-danger) 0%, var(--cyp-danger-hover) 100%);
}

.update-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 700px;
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

.progress-container {
  display: flex;
  align-items: center;
  gap: 8px;
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
  background: #ffffff;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  min-width: 36px;
}

.btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-icon {
  font-size: 14px;
}

.btn-primary {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.btn-primary:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.btn-success {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.btn-success:hover {
  background: rgba(255, 255, 255, 0.35);
}

.btn-text {
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
}

.btn-text:hover {
  color: #ffffff;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--cyp-chrome-shadow), 0 20px 60px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  color: var(--cyp-text);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cyp-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--cyp-text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--cyp-text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: var(--cyp-text);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.release-date {
  font-size: 13px;
  color: var(--cyp-text-secondary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cyp-border);
}

.release-notes-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--cyp-text-secondary);
}

.release-notes-content :deep(h2),
.release-notes-content :deep(h3),
.release-notes-content :deep(h4) {
  margin: 16px 0 8px;
  color: var(--cyp-text);
}

.release-notes-content :deep(li) {
  margin: 4px 0;
  padding-left: 8px;
}

.release-notes-content :deep(code) {
  background: var(--cyp-bg-muted);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--cyp-border);
}

.modal-footer .btn-primary {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
}

.modal-footer .btn-text {
  color: var(--cyp-text-secondary);
}

.modal-footer .btn-text:hover {
  color: var(--cyp-text);
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 深色主题 */
@media (prefers-color-scheme: dark) {
  .modal-content {
    background: var(--cyp-bg-card-solid);
  }
  
  .modal-header {
    border-bottom-color: var(--cyp-text-secondary);
  }
  
  .modal-header h3 {
    color: var(--cyp-text);
  }
  
  .modal-close {
    color: var(--cyp-text-muted);
  }
  
  .modal-close:hover {
    color: var(--cyp-text);
  }
  
  .release-date {
    color: var(--cyp-text-muted);
    border-bottom-color: var(--cyp-text-secondary);
  }
  
  .release-notes-content {
    color: var(--cyp-text-secondary);
  }
  
  .release-notes-content :deep(h2),
  .release-notes-content :deep(h3),
  .release-notes-content :deep(h4) {
    color: var(--cyp-text);
  }
  
  .release-notes-content :deep(code) {
    background: var(--cyp-bg-muted-solid);
  }
  
  .modal-footer {
    border-top-color: var(--cyp-text-secondary);
  }
  
  .modal-footer .btn-text {
    color: var(--cyp-text-muted);
  }
  
  .modal-footer .btn-text:hover {
    color: var(--cyp-text);
  }
}
</style>
