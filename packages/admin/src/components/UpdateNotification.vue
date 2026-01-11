<!--
  管理端版本更新提示组件
  检测到新版本时显示更新提示
  支持 Web 端刷新和 Docker 容器更新提示
  
  功能:
  - 自动检测新版本（每5分钟）
  - 支持手动检查更新
  - 显示更新日志
  - Docker 环境自动检测
  - 失败重试机制（最多3次）
  - 阿里云镜像支持
  
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
        
        <!-- Web 端：刷新按钮 -->
        <template v-if="!isDocker">
          <el-button type="primary" size="small" @click="handleRefresh">
            立即刷新
          </el-button>
          <el-button v-if="releaseNotes" size="small" @click="showReleaseNotesDialog = true">
            更新日志
          </el-button>
        </template>
        
        <!-- Docker 端：显示更新命令 -->
        <template v-else>
          <el-button type="primary" size="small" @click="showDockerDialog = true">
            查看更新方法
          </el-button>
        </template>
        
        <el-button size="small" text @click="handleDismiss">
          稍后
        </el-button>
      </div>
    </div>
  </Transition>

  <!-- 更新日志对话框 -->
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
      <div class="notes-content" v-html="formattedReleaseNotes"></div>
    </div>
    <template #footer>
      <el-button @click="showReleaseNotesDialog = false">关闭</el-button>
      <el-button v-if="releaseUrl" type="primary" @click="openReleaseUrl">
        查看完整日志
      </el-button>
    </template>
  </el-dialog>

  <!-- Docker 更新对话框 -->
  <el-dialog
    v-model="showDockerDialog"
    title="更新 Docker 容器"
    width="520px"
    :close-on-click-modal="false"
  >
    <div class="docker-update-guide">
      <p class="update-info">
        当前版本: <strong>v{{ currentVersion }}</strong> → 
        最新版本: <strong>v{{ latestVersion }}</strong>
      </p>
      
      <div class="update-steps">
        <h4>更新方式：</h4>
        
        <el-collapse v-model="activeCollapse">
          <el-collapse-item title="🔄 方式一：自动更新（推荐）" name="auto">
            <p class="tip">使用 Watchtower 实现自动更新，无需手动操作</p>
            <div class="code-block">
              <code>docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower cyp-memo --interval 86400</code>
              <el-button size="small" text @click="copyCommand('docker run -d --name watchtower -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower cyp-memo --interval 86400')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
            <p class="note">每 24 小时自动检查并更新 cyp-memo 容器</p>
          </el-collapse-item>
          
          <el-collapse-item title="📦 方式二：手动更新" name="manual">
            <p class="tip">选择您使用的镜像源执行更新</p>
            
            <div class="code-block">
              <span class="source-label">Docker Hub:</span>
              <code>docker pull cyp97/cyp-memo:latest</code>
              <el-button size="small" text @click="copyCommand('docker pull cyp97/cyp-memo:latest')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
            
            <div class="code-block">
              <span class="source-label">GHCR:</span>
              <code>docker pull ghcr.io/addss-hub/cyp-memo:latest</code>
              <el-button size="small" text @click="copyCommand('docker pull ghcr.io/addss-hub/cyp-memo:latest')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>

            <div class="code-block">
              <span class="source-label">阿里云:</span>
              <code>docker pull registry.cn-hangzhou.aliyuncs.com/cyp-memo/cyp-memo:latest</code>
              <el-button size="small" text @click="copyCommand('docker pull registry.cn-hangzhou.aliyuncs.com/cyp-memo/cyp-memo:latest')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>

            <p class="tip" style="margin-top: 12px;">拉取后重启容器</p>
            <div class="code-block">
              <span class="source-label">Compose:</span>
              <code>docker-compose up -d</code>
              <el-button size="small" text @click="copyCommand('docker-compose up -d')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
            <div class="code-block">
              <span class="source-label">单容器:</span>
              <code>docker restart cyp-memo</code>
              <el-button size="small" text @click="copyCommand('docker restart cyp-memo')">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- 更新日志预览 -->
      <div v-if="releaseNotes" class="release-notes-preview">
        <h4>更新内容：</h4>
        <div class="notes-content" v-html="formattedReleaseNotes"></div>
      </div>

      <el-alert type="info" :closable="false" show-icon>
        数据安全提示：更新不会影响您的数据，数据存储在挂载的数据目录中。
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="showDockerDialog = false">关闭</el-button>
      <el-button v-if="releaseUrl" type="primary" @click="openReleaseUrl">
        查看更新日志
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Promotion, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const showNotification = ref(false)
const showDockerDialog = ref(false)
const showReleaseNotesDialog = ref(false)
const currentVersion = ref('')
const latestVersion = ref('')
const releaseUrl = ref('')
const releaseNotes = ref('')
const publishedAt = ref('')
const isDocker = ref(false)
const activeCollapse = ref(['auto'])
const retryCount = ref(0)

const CHECK_INTERVAL = 5 * 60 * 1000 // 5分钟
const MAX_RETRY = 3
const RETRY_DELAY = 30 * 1000 // 30秒后重试

let checkTimer: number | null = null
let retryTimer: number | null = null

/**
 * 检测 Docker 环境
 */
function detectDockerEnvironment(): boolean {
  if (window.location.port === '5170') return true
  if (localStorage.getItem('deployMode') === 'docker') return true
  const metaEnv = document.querySelector('meta[name="deploy-mode"]')
  if (metaEnv?.getAttribute('content') === 'docker') return true
  const hostname = window.location.hostname
  if (hostname === 'localhost' && window.location.port === '5170') return true
  return false
}

/**
 * 检查更新
 */
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
      isDocker.value = detectDockerEnvironment()
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
      console.log(`[UpdateNotification] 将在 ${RETRY_DELAY / 1000} 秒后重试 (${retryCount.value}/${MAX_RETRY})`)
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = window.setTimeout(checkForUpdates, RETRY_DELAY)
    }
  }
}

/**
 * 手动检查更新
 */
async function manualCheckForUpdates() {
  retryCount.value = 0
  ElMessage.info('正在检查更新...')
  
  try {
    await checkForUpdates()
    if (!showNotification.value) {
      ElMessage.success('当前已是最新版本')
    }
  } catch {
    ElMessage.error('检查更新失败，请稍后重试')
  }
}

/**
 * 格式化更新日志
 */
const formattedReleaseNotes = computed(() => {
  if (!releaseNotes.value) return ''
  
  return releaseNotes.value
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
  })
}

function handleRefresh() {
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name))
    })
  }
  window.location.reload()
}

function handleDismiss() {
  showNotification.value = false
  setTimeout(() => {
    if (latestVersion.value) showNotification.value = true
  }, 30 * 60 * 1000)
}

async function copyCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    ElMessage.success('已复制到剪贴板')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = command
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    ElMessage.success('已复制到剪贴板')
  }
}

function openReleaseUrl() {
  if (releaseUrl.value) window.open(releaseUrl.value, '_blank')
}

defineExpose({ checkForUpdates: manualCheckForUpdates })

onMounted(() => {
  checkForUpdates()
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.update-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 900px;
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
  border-bottom: 1px solid var(--el-border-color-light);
}
.publish-date { color: var(--el-text-color-secondary); font-size: 13px; }
.notes-content { 
  font-size: 14px; 
  line-height: 1.8; 
  color: var(--el-text-color-regular);
  max-height: 300px;
  overflow-y: auto;
}
.notes-content :deep(h2),
.notes-content :deep(h3),
.notes-content :deep(h4) {
  margin: 16px 0 8px;
  color: var(--el-text-color-primary);
}
.notes-content :deep(li) { margin: 4px 0; padding-left: 8px; }
.notes-content :deep(code) {
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.docker-update-guide { padding: 0 10px; }
.update-info { text-align: center; margin-bottom: 20px; font-size: 15px; }
.update-steps { margin-bottom: 20px; }
.update-steps h4 { margin-bottom: 15px; color: var(--el-text-color-primary); }

.code-block {
  display: flex; 
  align-items: center; 
  gap: 8px;
  background: var(--el-fill-color-light); 
  padding: 8px 12px; 
  border-radius: 4px;
  margin-bottom: 8px;
}
.code-block code { 
  flex: 1; 
  font-size: 12px; 
  color: var(--el-text-color-primary); 
  font-family: 'Consolas', 'Monaco', monospace; 
  overflow: hidden; 
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-label { font-size: 11px; color: var(--el-text-color-secondary); min-width: 65px; }

.tip { color: var(--el-text-color-regular); font-size: 13px; margin: 0 0 10px 0; }
.note { color: var(--el-text-color-secondary); font-size: 12px; margin: 8px 0 0 0; font-style: italic; }

.release-notes-preview {
  margin: 16px 0;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}
.release-notes-preview h4 { margin: 0 0 8px 0; font-size: 14px; color: var(--el-text-color-primary); }
.release-notes-preview .notes-content { max-height: 150px; font-size: 13px; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { transform: translateY(-100%); opacity: 0; }

[data-theme='dark'] .update-notification,
html.dark .update-notification { background: linear-gradient(135deg, #434343 0%, #1a1a2e 100%); }

@media (max-width: 768px) {
  .update-content { flex-wrap: wrap; gap: 8px; }
  .update-text { width: 100%; text-align: center; }
  .current-version { display: block; margin-top: 4px; }
}
</style>
