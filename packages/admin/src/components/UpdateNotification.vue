<!--
  版本更新提示组件
  检测到新版本时显示更新提示
  支持 Web 端刷新和 Docker 容器更新提示
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Transition name="slide-down">
    <div v-if="showNotification" class="update-notification">
      <div class="update-content">
        <el-icon class="update-icon"><Promotion /></el-icon>
        <span class="update-text">
          发现新版本 <strong>v{{ latestVersion }}</strong>
          <span v-if="isDocker">（当前 v{{ currentVersion }}）</span>
        </span>
        
        <!-- Web 端：刷新按钮 -->
        <template v-if="!isDocker">
          <el-button type="primary" size="small" @click="handleRefresh">
            立即刷新
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

  <!-- Docker 更新对话框 -->
  <el-dialog
    v-model="showDockerDialog"
    title="更新 Docker 容器"
    width="500px"
    :close-on-click-modal="false"
  >
    <div class="docker-update-guide">
      <p class="update-info">
        当前版本: <strong>v{{ currentVersion }}</strong> → 
        最新版本: <strong>v{{ latestVersion }}</strong>
      </p>
      
      <div class="update-steps">
        <h4>更新方式：</h4>
        
        <!-- 自动更新选项 -->
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
import { ref, onMounted, onUnmounted } from 'vue'
import { Promotion, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const showNotification = ref(false)
const showDockerDialog = ref(false)
const currentVersion = ref('')
const latestVersion = ref('')
const releaseUrl = ref('')
const isDocker = ref(false)
const activeCollapse = ref(['auto'])

const CHECK_INTERVAL = 5 * 60 * 1000
let checkTimer: number | null = null

function detectDockerEnvironment(): boolean {
  return window.location.port === '5170' || 
         localStorage.getItem('deployMode') === 'docker'
}

async function checkForUpdates() {
  try {
    const serverUrl = localStorage.getItem('serverUrl') || window.location.origin
    const response = await fetch(`${serverUrl}/api/version/latest`)
    
    if (!response.ok) return

    const result = await response.json()
    if (result.success && result.data.hasUpdate) {
      currentVersion.value = result.data.currentVersion
      latestVersion.value = result.data.latestVersion
      releaseUrl.value = result.data.releaseUrl || ''
      isDocker.value = detectDockerEnvironment()
      showNotification.value = true
    }
  } catch (error) {
    console.warn('[UpdateNotification] 版本检测失败:', error)
  }
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
    ElMessage.error('复制失败')
  }
}

function openReleaseUrl() {
  if (releaseUrl.value) window.open(releaseUrl.value, '_blank')
}

onMounted(() => {
  checkForUpdates()
  checkTimer = window.setInterval(checkForUpdates, CHECK_INTERVAL)
})

onUnmounted(() => {
  if (checkTimer) clearInterval(checkTimer)
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
  max-width: 800px;
  margin: 0 auto;
}

.update-icon {
  font-size: 20px;
}

.update-text {
  font-size: 14px;
}

.update-text strong {
  font-weight: 600;
}

.docker-update-guide { padding: 0 10px; }
.update-info { text-align: center; margin-bottom: 20px; font-size: 15px; }
.update-steps { margin-bottom: 20px; }
.update-steps h4 { margin-bottom: 15px; color: #303133; }

.code-block {
  display: flex; align-items: center; gap: 8px;
  background: #f5f7fa; padding: 8px 12px; border-radius: 4px;
  margin-bottom: 8px;
}
.code-block code { flex: 1; font-size: 12px; color: #303133; font-family: monospace; overflow: hidden; text-overflow: ellipsis; }
.source-label { font-size: 11px; color: #909399; min-width: 65px; }

.tip { color: #606266; font-size: 13px; margin: 0 0 10px 0; }
.note { color: #909399; font-size: 12px; margin: 8px 0 0 0; font-style: italic; }

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

/* 深色主题 */
[data-theme='dark'] .update-notification {
  background: linear-gradient(135deg, #434343 0%, #000000 100%);
}

[data-theme='dark'] .code-block { background: #262727; }
[data-theme='dark'] .code-block code { color: #e5eaf3; }

/* 移动端适配 */
@media (max-width: 768px) {
  .update-content {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .update-text {
    width: 100%;
    text-align: center;
  }
}
</style>
