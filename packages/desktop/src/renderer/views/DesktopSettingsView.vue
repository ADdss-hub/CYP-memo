<script setup lang="ts">
/**
 * 桌面客户端设置页面
 * Desktop client settings view
 */

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Connection, Bell, Refresh } from '@element-plus/icons-vue'
import { DesktopLayout } from '../components'
import { getElectronAPI } from '../composables'
import type { ServerConnectionConfig, NotificationPreferences, ShortcutConfig } from '../../shared/types'

const router = useRouter()
const api = getElectronAPI()

// 状态
const isLoading = ref(true)
const serverConfig = ref<ServerConnectionConfig | null>(null)
const notificationPrefs = ref<NotificationPreferences | null>(null)
const shortcutConfig = ref<ShortcutConfig | null>(null)
const isSwitching = ref(false)

// 新服务器配置
const newServerUrl = ref('')
const isTesting = ref(false)
const testSuccess = ref(false)

// 加载配置
async function loadConfig() {
  if (!api) return

  isLoading.value = true
  try {
    serverConfig.value = await api.server.getConfig()
    notificationPrefs.value = await api.notification.getPreferences()
    shortcutConfig.value = await api.shortcut.getConfig()
  } catch (err) {
    console.error('加载配置失败:', err)
    ElMessage.error('加载配置失败')
  } finally {
    isLoading.value = false
  }
}

// 测试新服务器连接
async function testNewServer() {
  if (!api || !newServerUrl.value) return

  isTesting.value = true
  testSuccess.value = false

  try {
    const result = await api.server.testConnection(newServerUrl.value)
    if (result.success) {
      testSuccess.value = true
      ElMessage.success('连接成功')
    } else {
      ElMessage.error(result.error || '连接失败')
    }
  } catch (err) {
    ElMessage.error('连接测试失败')
  } finally {
    isTesting.value = false
  }
}

// 切换到远程服务器
async function switchToRemote() {
  if (!api || !newServerUrl.value || !testSuccess.value) return

  try {
    await ElMessageBox.confirm(
      '切换服务器后需要重新登录，确定要切换吗？',
      '切换服务器',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    isSwitching.value = true
    const success = await api.server.switchMode('remote', newServerUrl.value)
    
    if (success) {
      ElMessage.success('服务器切换成功，请重新登录')
      router.push('/login')
    } else {
      ElMessage.error('服务器切换失败')
    }
  } catch (err) {
    // 用户取消
  } finally {
    isSwitching.value = false
  }
}

// 切换到内置服务器
async function switchToEmbedded() {
  if (!api) return

  try {
    await ElMessageBox.confirm(
      '切换到内置服务器后，数据将存储在本地，确定要切换吗？',
      '切换到内置服务器',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    isSwitching.value = true
    const success = await api.server.switchMode('embedded')
    
    if (success) {
      ElMessage.success('已切换到内置服务器，请重新登录')
      router.push('/login')
    } else {
      ElMessage.error('切换失败')
    }
  } catch (err) {
    // 用户取消
  } finally {
    isSwitching.value = false
  }
}

// 更新通知设置
async function updateNotificationPrefs(key: keyof NotificationPreferences, value: boolean) {
  if (!api || !notificationPrefs.value) return

  try {
    const newPrefs = { ...notificationPrefs.value, [key]: value }
    await api.notification.setPreferences(newPrefs)
    notificationPrefs.value = newPrefs
    ElMessage.success('设置已保存')
  } catch (err) {
    ElMessage.error('保存设置失败')
  }
}

// 检查更新
async function checkUpdate() {
  if (!api) return

  try {
    const updateInfo = await api.update.check()
    if (updateInfo) {
      ElMessage.success(`发现新版本: ${updateInfo.version}`)
    } else {
      ElMessage.info('当前已是最新版本')
    }
  } catch (err) {
    ElMessage.error('检查更新失败')
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <DesktopLayout>
    <div class="desktop-settings">
      <div class="page-header">
        <h1>
          <el-icon><Setting /></el-icon>
          桌面客户端设置
        </h1>
        <p>管理桌面客户端的连接和功能设置</p>
      </div>

      <div v-if="isLoading" class="loading">
        <el-icon class="is-loading"><Refresh /></el-icon>
        <span>加载中...</span>
      </div>

      <template v-else>
        <!-- 服务器连接设置 -->
        <div class="settings-section">
          <div class="section-header">
            <el-icon><Connection /></el-icon>
            <h2>服务器连接</h2>
          </div>

          <div class="section-content">
            <div class="setting-item">
              <div class="setting-label">当前模式</div>
              <div class="setting-value">
                <el-tag :type="serverConfig?.connectionMode === 'remote' ? 'primary' : 'success'">
                  {{ serverConfig?.connectionMode === 'remote' ? '远程服务器' : '内置服务器' }}
                </el-tag>
              </div>
            </div>

            <div v-if="serverConfig?.connectionMode === 'remote'" class="setting-item">
              <div class="setting-label">服务器地址</div>
              <div class="setting-value">{{ serverConfig?.serverUrl }}</div>
            </div>

            <!-- 切换服务器 -->
            <div class="setting-group">
              <h3>切换服务器</h3>
              
              <div v-if="serverConfig?.connectionMode === 'embedded'" class="switch-server">
                <p>切换到远程服务器以实现多设备同步</p>
                <div class="input-row">
                  <el-input 
                    v-model="newServerUrl" 
                    placeholder="https://your-server.com"
                    :disabled="isTesting || isSwitching"
                  />
                  <el-button 
                    :loading="isTesting"
                    :disabled="!newServerUrl"
                    @click="testNewServer"
                  >
                    测试连接
                  </el-button>
                </div>
                <el-button 
                  type="primary"
                  :loading="isSwitching"
                  :disabled="!testSuccess"
                  @click="switchToRemote"
                >
                  切换到远程服务器
                </el-button>
              </div>

              <div v-else class="switch-server">
                <p>切换到内置服务器以离线使用</p>
                <el-button 
                  type="warning"
                  :loading="isSwitching"
                  @click="switchToEmbedded"
                >
                  切换到内置服务器
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 通知设置 -->
        <div class="settings-section">
          <div class="section-header">
            <el-icon><Bell /></el-icon>
            <h2>通知设置</h2>
          </div>

          <div class="section-content" v-if="notificationPrefs">
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">启用通知</div>
                <div class="setting-desc">接收系统通知提醒</div>
              </div>
              <el-switch 
                :model-value="notificationPrefs.enabled"
                @change="(val: boolean) => updateNotificationPrefs('enabled', val)"
              />
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">分享通知</div>
                <div class="setting-desc">当有人查看您的分享时通知</div>
              </div>
              <el-switch 
                :model-value="notificationPrefs.showOnShare"
                :disabled="!notificationPrefs.enabled"
                @change="(val: boolean) => updateNotificationPrefs('showOnShare', val)"
              />
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">同步通知</div>
                <div class="setting-desc">数据同步完成时通知</div>
              </div>
              <el-switch 
                :model-value="notificationPrefs.showOnSync"
                :disabled="!notificationPrefs.enabled"
                @change="(val: boolean) => updateNotificationPrefs('showOnSync', val)"
              />
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">通知声音</div>
                <div class="setting-desc">播放通知提示音</div>
              </div>
              <el-switch 
                :model-value="notificationPrefs.sound"
                :disabled="!notificationPrefs.enabled"
                @change="(val: boolean) => updateNotificationPrefs('sound', val)"
              />
            </div>
          </div>
        </div>

        <!-- 更新设置 -->
        <div class="settings-section">
          <div class="section-header">
            <el-icon><Refresh /></el-icon>
            <h2>软件更新</h2>
          </div>

          <div class="section-content">
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">检查更新</div>
                <div class="setting-desc">检查是否有新版本可用</div>
              </div>
              <el-button @click="checkUpdate">检查更新</el-button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </DesktopLayout>
</template>

<style scoped>
.desktop-settings {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin: 0 0 8px;
}

.page-header p {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin: 0;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px;
  color: var(--text-secondary, #909399);
}

.settings-section {
  background: var(--bg-primary, white);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e4e7ed);
  margin-bottom: 24px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: var(--bg-secondary, #f5f7fa);
  border-bottom: 1px solid var(--border-color, #e4e7ed);
}

.section-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin: 0;
}

.section-content {
  padding: 24px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #e4e7ed);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #303133);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin-top: 4px;
}

.setting-value {
  font-size: 14px;
  color: var(--text-secondary, #606266);
}

.setting-group {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color, #e4e7ed);
}

.setting-group h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin: 0 0 16px;
}

.switch-server p {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin: 0 0 16px;
}

.input-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.input-row .el-input {
  flex: 1;
}

/* 深色主题 */
html.dark .page-header h1 {
  color: #e5eaf3;
}

html.dark .settings-section {
  background: #1d1e1f;
  border-color: #414243;
}

html.dark .section-header {
  background: #262727;
  border-color: #414243;
}

html.dark .section-header h2 {
  color: #e5eaf3;
}

html.dark .setting-item {
  border-color: #414243;
}

html.dark .setting-label {
  color: #e5eaf3;
}

html.dark .setting-group {
  border-color: #414243;
}

html.dark .setting-group h3 {
  color: #e5eaf3;
}
</style>
