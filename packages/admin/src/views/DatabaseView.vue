<!--
  数据库管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AdminLayout>
    <div class="database-view">
      <div class="view-header">
        <h2>数据库管理</h2>
      </div>

      <!-- 数据库统计 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-info">
            <div class="stat-label">用户数</div>
            <div class="stat-value">{{ stats.userCount }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📝</div>
          <div class="stat-info">
            <div class="stat-label">备忘录数</div>
            <div class="stat-value">{{ stats.memoCount }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📎</div>
          <div class="stat-info">
            <div class="stat-label">文件数</div>
            <div class="stat-value">{{ stats.fileCount }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🔗</div>
          <div class="stat-info">
            <div class="stat-label">分享链接数</div>
            <div class="stat-value">{{ stats.shareCount }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-info">
            <div class="stat-label">日志数</div>
            <div class="stat-value">{{ stats.logCount }}</div>
          </div>
        </div>
      </div>

      <!-- 数据库操作 -->
      <div class="operations-section">
        <h3>数据库操作</h3>

        <div class="operation-card">
          <div class="operation-info">
            <h4>备份数据库</h4>
            <p>导出所有数据为 JSON 文件</p>
          </div>
          <button class="btn btn-primary" @click="handleBackup" :disabled="loading">
            {{ loading ? '处理中...' : '备份' }}
          </button>
        </div>

        <div class="operation-card">
          <div class="operation-info">
            <h4>恢复数据库</h4>
            <p>从 JSON 文件恢复数据（将覆盖现有数据）</p>
          </div>
          <div class="operation-actions">
            <input
              ref="fileInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="handleFileSelect"
            />
            <button class="btn btn-warning" @click="selectFile" :disabled="loading">
              {{ loading ? '处理中...' : '选择文件' }}
            </button>
          </div>
        </div>

        <div class="operation-card">
          <div class="operation-info">
            <h4>清理数据库</h4>
            <p>手动触发数据清理（删除过期数据、孤立文件等）</p>
          </div>
          <button class="btn btn-info" @click="handleCleanup" :disabled="loading">
            {{ loading ? '处理中...' : '清理' }}
          </button>
        </div>

        <div class="operation-card danger">
          <div class="operation-info">
            <h4>清空数据库</h4>
            <p class="warning">⚠️ 危险操作：将删除所有数据，无法恢复</p>
          </div>
          <button class="btn btn-danger" @click="showClearDialog = true" :disabled="loading">
            清空
          </button>
        </div>
      </div>

      <!-- 数据库表结构 -->
      <div class="schema-section">
        <h3>数据库表结构</h3>
        <div class="schema-table">
          <div class="schema-item">
            <div class="schema-name">users</div>
            <div class="schema-desc">用户表 - 存储用户账号信息</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">memos</div>
            <div class="schema-desc">备忘录表 - 存储备忘录内容</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">memoHistory</div>
            <div class="schema-desc">备忘录历史表 - 存储备忘录修改历史</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">files</div>
            <div class="schema-desc">文件元数据表 - 存储文件信息</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">fileBlobs</div>
            <div class="schema-desc">文件内容表 - 存储文件二进制数据</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">shares</div>
            <div class="schema-desc">分享链接表 - 存储分享链接信息</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">logs</div>
            <div class="schema-desc">日志表 - 存储系统日志</div>
          </div>
          <div class="schema-item">
            <div class="schema-name">settings</div>
            <div class="schema-desc">设置表 - 存储应用设置</div>
          </div>
        </div>
      </div>

      <!-- 清空数据库确认对话框 -->
      <div v-if="showClearDialog" class="modal" @click.self="showClearDialog = false">
        <div class="modal-content">
          <h3>清空数据库</h3>
          <p class="warning">⚠️ 此操作将删除所有数据，且无法恢复！</p>
          <p>请输入 <strong>确认</strong> 确认操作：</p>
          <input v-model="clearConfirmText" type="text" placeholder="输入 确认" class="input" />
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeClearDialog">取消</button>
            <button
              class="btn btn-danger"
              @click="confirmClear"
              :disabled="clearConfirmText !== '确认'"
            >
              确认清空
            </button>
          </div>
        </div>
      </div>

      <!-- 清理结果对话框 -->
      <div v-if="showCleanupResult" class="modal" @click.self="showCleanupResult = false">
        <div class="modal-content">
          <h3>清理完成</h3>
          <div class="cleanup-result">
            <div class="result-item">
              <span>已删除备忘录：</span>
              <strong>{{ cleanupResult.deletedMemosRemoved }}</strong>
            </div>
            <div class="result-item">
              <span>孤立文件：</span>
              <strong>{{ cleanupResult.orphanedFilesRemoved }}</strong>
            </div>
            <div class="result-item">
              <span>过期分享链接：</span>
              <strong>{{ cleanupResult.expiredSharesRemoved }}</strong>
            </div>
            <div class="result-item">
              <span>旧日志：</span>
              <strong>{{ cleanupResult.oldLogsRemoved }}</strong>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="showCleanupResult = false">关闭</button>
          </div>
        </div>
      </div>

      <!-- Toast 提示 -->
      <div v-if="toast.show" :class="['toast', `toast-${toast.type}`]">
        {{ toast.message }}
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { dataManager, cleanupManager, storageManager } from '@cyp-memo/shared'
import type { CleanupResult } from '@cyp-memo/shared'
import AdminLayout from '../components/AdminLayout.vue'

// 状态
const stats = ref({
  userCount: 0,
  memoCount: 0,
  fileCount: 0,
  shareCount: 0,
  logCount: 0,
})

const loading = ref(false)
const showClearDialog = ref(false)
const clearConfirmText = ref('')
const showCleanupResult = ref(false)
const cleanupResult = ref<CleanupResult>({
  deletedMemosRemoved: 0,
  orphanedFilesRemoved: 0,
  expiredSharesRemoved: 0,
  oldLogsRemoved: 0,
})

const fileInput = ref<HTMLInputElement | null>(null)

// Toast 状态
const toast = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error' | 'info',
})

// 显示 Toast
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// 加载统计信息
async function loadStats() {
  try {
    // 优先使用 dataManager 获取统计信息（会自动使用正确的存储适配器）
    stats.value = await dataManager.getStatistics()
  } catch (err) {
    console.error('加载统计信息失败:', err)
    showToast('加载统计信息失败', 'error')
  }
}

// 备份数据库
async function handleBackup() {
  loading.value = true
  try {
    const jsonData = await dataManager.exportToJSON()

    // 创建下载链接
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cyp-memo-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast('数据备份成功')
  } catch (err) {
    showToast('数据备份失败', 'error')
    console.error(err)
  } finally {
    loading.value = false
  }
}

// 选择文件
function selectFile() {
  fileInput.value?.click()
}

// 处理文件选择
async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  loading.value = true
  try {
    const text = await file.text()
    await dataManager.recoverData(text)

    showToast('数据恢复成功')
    await loadStats()
  } catch (err) {
    showToast('数据恢复失败', 'error')
    console.error(err)
  } finally {
    loading.value = false
    // 清空文件输入
    if (target) target.value = ''
  }
}

// 清理数据库
async function handleCleanup() {
  loading.value = true
  try {
    const result = await cleanupManager.performCleanup()
    cleanupResult.value = result
    
    // 检查是否有实际清理的数据
    const totalCleaned = result.deletedMemosRemoved + result.orphanedFilesRemoved + 
                         result.expiredSharesRemoved + result.oldLogsRemoved
    
    if (totalCleaned === 0) {
      showToast('数据库已是最新状态，无需清理', 'info')
    } else {
      showCleanupResult.value = true
    }
    
    await loadStats()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    console.error('数据清理失败:', err)
    showToast(`数据清理失败: ${errorMessage}`, 'error')
  } finally {
    loading.value = false
  }
}

// 清空数据库
async function confirmClear() {
  if (clearConfirmText.value !== '确认') return

  loading.value = true
  try {
    // 使用 dataManager 清空数据（会自动使用正确的存储适配器）
    await dataManager.clearAllData()
    
    showToast('数据库已清空')
    closeClearDialog()
    await loadStats()
  } catch (err) {
    showToast('清空数据库失败: ' + (err instanceof Error ? err.message : '未知错误'), 'error')
    console.error(err)
  } finally {
    loading.value = false
  }
}

function closeClearDialog() {
  showClearDialog.value = false
  clearConfirmText.value = ''
}

// 生命周期
onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.database-view {
  /* Removed padding as AdminLayout provides it */
}

.view-header {
  margin-bottom: 24px;
}

.view-header h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 32px;
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

/* 操作区域 */
.operations-section,
.schema-section {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
}

.operations-section h3,
.schema-section h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: #303133;
}

.operation-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  margin-bottom: 12px;
}

.operation-card.danger {
  border-color: #f56c6c;
  background: #fef0f0;
}

.operation-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #303133;
}

.operation-info p {
  margin: 0;
  font-size: 14px;
  color: #606266;
}

.warning {
  color: #e6a23c;
  font-weight: 500;
}

.operation-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #66b1ff;
}

.btn-secondary {
  background: #dcdfe6;
  color: #606266;
}

.btn-secondary:hover:not(:disabled) {
  background: #c0c4cc;
}

.btn-warning {
  background: #e6a23c;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #ebb563;
}

.btn-info {
  background: #909399;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #a6a9ad;
}

.btn-danger {
  background: #f56c6c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #f78989;
}

/* 表结构 */
.schema-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-item {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.schema-name {
  font-family: monospace;
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 4px;
}

.schema-desc {
  font-size: 13px;
  color: #606266;
}

/* 模态框 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 24px;
  border-radius: 8px;
  min-width: 400px;
  max-width: 500px;
}

.modal-content h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #303133;
}

.modal-content p {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #606266;
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cleanup-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.result-item span {
  color: #606266;
}

.result-item strong {
  color: #409eff;
}

/* Toast */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  z-index: 2000;
  animation: slideIn 0.3s ease-out;
}

.toast-success {
  background: #67c23a;
}

.toast-error {
  background: #f56c6c;
}

.toast-info {
  background: #909399;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 深色主题 */
[data-theme='dark'] .view-header h2 {
  color: #e5eaf3;
}

[data-theme='dark'] .stat-card,
[data-theme='dark'] .operations-section,
[data-theme='dark'] .schema-section {
  background: #262727;
}

[data-theme='dark'] .stat-label {
  color: #8a8f99;
}

[data-theme='dark'] .stat-value {
  color: #e5eaf3;
}

[data-theme='dark'] .operations-section h3,
[data-theme='dark'] .schema-section h3 {
  color: #e5eaf3;
}

[data-theme='dark'] .operation-card {
  border-color: #414243;
  background: #1d1e1f;
}

[data-theme='dark'] .operation-card.danger {
  border-color: #f56c6c;
  background: #3a2626;
}

[data-theme='dark'] .operation-info h4 {
  color: #e5eaf3;
}

[data-theme='dark'] .operation-info p {
  color: #cfd3dc;
}

[data-theme='dark'] .schema-item {
  background: #1d1e1f;
}

[data-theme='dark'] .schema-desc {
  color: #cfd3dc;
}

[data-theme='dark'] .modal-content {
  background: #262727;
}

[data-theme='dark'] .modal-content h3 {
  color: #e5eaf3;
}

[data-theme='dark'] .modal-content p {
  color: #cfd3dc;
}

[data-theme='dark'] .input {
  background: #1d1e1f;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] .result-item {
  background: #1d1e1f;
}

[data-theme='dark'] .result-item span {
  color: #cfd3dc;
}
</style>
