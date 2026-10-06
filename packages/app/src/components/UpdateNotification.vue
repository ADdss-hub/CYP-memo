<!--
  版本更新提示（Web）
  本机联调 / 原生部署：仅刷新页面 / 查看 Release 日志
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Transition name="slide-down">
    <div v-if="showNotification" class="update-notification">
      <div class="update-content">
        <el-icon class="update-icon"><Promotion /></el-icon>
        <span class="update-text">
          发现新版本 <strong>v{{ latestVersion }}</strong>
          <span class="current-version">（当前 v{{ currentVersion }}）</span>
        </span>
        <el-button type="primary" size="small" @click="handleRefresh">立即刷新</el-button>
        <el-button v-if="releaseNotes" size="small" @click="showReleaseNotesDialog = true">更新日志</el-button>
        <el-button v-if="releaseUrl" size="small" @click="openReleaseUrl">下载安装包</el-button>
        <el-button size="small" text @click="handleDismiss">稍后</el-button>
      </div>
    </div>
  </Transition>

  <el-dialog
    v-model="showReleaseNotesDialog"
    title="更新日志"
    width="500px"
    :close-on-click-modal="true"
  >
    <div class="release-notes">
      <p class="version-info">
        <strong>v{{ latestVersion }}</strong>
        <span v-if="publishedAt" class="publish-date">{{ formatDate(publishedAt) }}</span>
      </p>
      <div class="notes-content">{{ releaseNotes || '暂无更新说明' }}</div>
      <p class="deploy-hint">面板 / NAS / Windows / Unix 请使用 GitHub Release 中的 server 包或桌面安装包升级。</p>
    </div>
    <template #footer>
      <el-button @click="showReleaseNotesDialog = false">关闭</el-button>
      <el-button v-if="releaseUrl" type="primary" @click="openReleaseUrl">查看完整日志</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const showNotification = ref(false)
const showReleaseNotesDialog = ref(false)
const currentVersion = ref('')
const latestVersion = ref('')
const releaseUrl = ref('')
const releaseNotes = ref('')
const publishedAt = ref('')
const retryCount = ref(0)

const CHECK_INTERVAL = 5 * 60 * 1000
const MAX_RETRY = 3
const RETRY_DELAY = 30 * 1000

let checkTimer: number | null = null
let retryTimer: number | null = null

async function checkForUpdates() {
  try {
    const serverUrl = localStorage.getItem('serverUrl') || window.location.origin
    const response = await fetch(`${serverUrl}/api/version/latest`, {
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (result.success && result.data.hasUpdate) {
      currentVersion.value = result.data.currentVersion
      latestVersion.value = result.data.latestVersion
      releaseUrl.value = result.data.releaseUrl || ''
      releaseNotes.value = result.data.releaseNotes || ''
      publishedAt.value = result.data.publishedAt || ''
      showNotification.value = true
      retryCount.value = 0
    } else if (result.success) {
      currentVersion.value = result.data.currentVersion
      retryCount.value = 0
    }
  } catch (error) {
    console.warn('[UpdateNotification] 版本检测失败:', error)
    if (retryCount.value < MAX_RETRY) {
      retryCount.value++
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = window.setTimeout(checkForUpdates, RETRY_DELAY)
    }
  }
}

async function manualCheckForUpdates() {
  retryCount.value = 0
  ElMessage.info('正在检查更新...')
  try {
    await checkForUpdates()
    if (!showNotification.value) ElMessage.success('当前已是最新版本')
  } catch {
    ElMessage.error('检查更新失败，请稍后重试')
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function handleRefresh() {
  if ('caches' in window) {
    caches.keys().then((names) => names.forEach((name) => caches.delete(name)))
  }
  window.location.reload()
}

function handleDismiss() {
  showNotification.value = false
  setTimeout(() => {
    if (latestVersion.value) showNotification.value = true
  }, 30 * 60 * 1000)
}

function openReleaseUrl() {
  if (releaseUrl.value) window.open(releaseUrl.value, '_blank')
}

defineExpose({ checkForUpdates: manualCheckForUpdates })

onMounted(() => {
  window.setTimeout(() => {
    void checkForUpdates()
  }, 12000)
  checkTimer = window.setInterval(checkForUpdates, CHECK_INTERVAL)
})

onUnmounted(() => {
  if (checkTimer) clearInterval(checkTimer)
  if (retryTimer) clearTimeout(retryTimer)
})
</script>

<style scoped>
.update-notification {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  padding: 12px 20px;
  box-shadow: var(--cyp-chrome-shadow), 0 2px 12px rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid color-mix(in srgb, #ffffff 22%, transparent);
}
.update-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 960px;
  margin: 0 auto;
  flex-wrap: wrap;
}
.update-icon { font-size: 20px; }
.update-text { font-size: 14px; }
.update-text strong { font-weight: 600; }
.current-version { opacity: 0.85; font-size: 13px; }
.release-notes { padding: 0 10px; }
.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--cyp-border);
}
.publish-date { color: var(--cyp-text-muted); font-size: 13px; }
.notes-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--cyp-text-secondary);
  max-height: 300px;
  overflow-y: auto;
}
.deploy-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}
.slide-down-enter-active,
.slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from,
.slide-down-leave-to { transform: translateY(-100%); opacity: 0; }
@media (max-width: 768px) {
  .update-content { flex-wrap: wrap; gap: 8px; }
  .update-text { width: 100%; text-align: center; }
}
</style>
