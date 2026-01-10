<!--
  系统监控界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AdminLayout>
    <div class="monitor-view">
      <div class="view-header">
        <h2>系统监控</h2>
        <button class="btn btn-primary" @click="refreshData">刷新</button>
      </div>

      <!-- 系统日志 -->
      <div class="logs-section">
        <div class="section-header">
          <h3>系统日志</h3>
          <div class="header-actions">
            <select v-model="logLevelFilter" class="filter-select">
              <option value="all">全部级别</option>
              <option value="debug">调试</option>
              <option value="info">信息</option>
              <option value="warn">警告</option>
              <option value="error">错误</option>
            </select>
            <button class="btn btn-sm btn-info" @click="exportLogs">导出日志</button>
          </div>
        </div>

        <div class="logs-table">
          <table>
            <thead>
              <tr>
                <th style="width: 80px">级别</th>
                <th style="width: 180px">时间</th>
                <th>消息</th>
                <th style="width: 100px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in filteredLogs" :key="log.id">
                <td>
                  <span :class="['log-level', `log-level-${log.level}`]">
                    {{ getLevelText(log.level) }}
                  </span>
                </td>
                <td>{{ formatDate(log.timestamp) }}</td>
                <td class="log-message">{{ log.message }}</td>
                <td>
                  <button
                    class="btn btn-sm btn-secondary"
                    @click="viewLogDetail(log)"
                    title="查看详情"
                  >
                    详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="filteredLogs.length === 0" class="empty-state">没有日志记录</div>
        </div>

        <div class="pagination">
          <button class="btn btn-sm btn-secondary" @click="prevPage" :disabled="currentPage === 1">
            上一页
          </button>
          <span class="page-info">第 {{ currentPage }} 页，共 {{ totalPages }} 页</span>
          <button
            class="btn btn-sm btn-secondary"
            @click="nextPage"
            :disabled="currentPage === totalPages"
          >
            下一页
          </button>
        </div>
      </div>

      <!-- 存储使用情况 -->
      <div class="storage-section">
        <h3>存储使用情况</h3>
        <div class="storage-stats">
          <div class="storage-item">
            <div class="storage-label">用户数据</div>
            <div class="storage-value">{{ formatSize(storageStats.usersSize) }}</div>
          </div>
          <div class="storage-item">
            <div class="storage-label">备忘录数据</div>
            <div class="storage-value">{{ formatSize(storageStats.memosSize) }}</div>
          </div>
          <div class="storage-item">
            <div class="storage-label">文件数据</div>
            <div class="storage-value">{{ formatSize(storageStats.filesSize) }}</div>
          </div>
          <div class="storage-item">
            <div class="storage-label">日志数据</div>
            <div class="storage-value">{{ formatSize(storageStats.logsSize) }}</div>
          </div>
          <div class="storage-item total">
            <div class="storage-label">总计</div>
            <div class="storage-value">{{ formatSize(storageStats.totalSize) }}</div>
          </div>
        </div>
      </div>

      <!-- 用户活跃度 -->
      <div class="activity-section">
        <h3>用户活跃度</h3>
        <div class="activity-stats">
          <div class="activity-item">
            <div class="activity-label">今日活跃用户</div>
            <div class="activity-value">{{ activityStats.todayActive }}</div>
          </div>
          <div class="activity-item">
            <div class="activity-label">本周活跃用户</div>
            <div class="activity-value">{{ activityStats.weekActive }}</div>
          </div>
          <div class="activity-item">
            <div class="activity-label">本月活跃用户</div>
            <div class="activity-value">{{ activityStats.monthActive }}</div>
          </div>
          <div class="activity-item">
            <div class="activity-label">总用户数</div>
            <div class="activity-value">{{ activityStats.totalUsers }}</div>
          </div>
        </div>
      </div>

      <!-- 日志详情对话框 -->
      <div v-if="showLogDetail" class="modal" @click.self="showLogDetail = false">
        <div class="modal-content">
          <h3>日志详情</h3>
          <div class="log-detail">
            <div class="detail-row">
              <span class="detail-label">级别：</span>
              <span :class="['log-level', `log-level-${selectedLog?.level}`]">
                {{ getLevelText(selectedLog?.level || 'info') }}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">时间：</span>
              <span>{{ formatDate(selectedLog?.timestamp || new Date()) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">消息：</span>
              <span>{{ selectedLog?.message }}</span>
            </div>
            <div v-if="selectedLog?.context" class="detail-row">
              <span class="detail-label">上下文：</span>
              <pre class="context-pre">{{ JSON.stringify(selectedLog.context, null, 2) }}</pre>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="showLogDetail = false">关闭</button>
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
import { ref, computed, onMounted } from 'vue'
import { logManager, getStorage } from '@cyp-memo/shared'
import type { LogEntry, LogLevel } from '@cyp-memo/shared'
import AdminLayout from '../components/AdminLayout.vue'

// 状态
const logs = ref<LogEntry[]>([])
const logLevelFilter = ref<'all' | LogLevel>('all')
const currentPage = ref(1)
const pageSize = 20
const selectedLog = ref<LogEntry | null>(null)
const showLogDetail = ref(false)

const storageStats = ref({
  usersSize: 0,
  memosSize: 0,
  filesSize: 0,
  logsSize: 0,
  totalSize: 0,
})

const activityStats = ref({
  todayActive: 0,
  weekActive: 0,
  monthActive: 0,
  totalUsers: 0,
})

// Toast 状态
const toast = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error' | 'info',
})

// 计算属性
const filteredLogs = computed(() => {
  let result = logs.value

  // 按级别筛选
  if (logLevelFilter.value !== 'all') {
    result = result.filter((log) => log.level === logLevelFilter.value)
  }

  // 分页
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return result.slice(start, end)
})

const totalPages = computed(() => {
  const filtered =
    logLevelFilter.value === 'all'
      ? logs.value
      : logs.value.filter((log) => log.level === logLevelFilter.value)
  return Math.ceil(filtered.length / pageSize)
})

// 显示 Toast
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// 加载日志
async function loadLogs() {
  try {
    const allLogs = await getStorage().getLogs()
    // 按时间戳倒序排序（确保时间戳是Date对象）
    logs.value = allLogs.map(log => ({
      ...log,
      timestamp: new Date(log.timestamp)
    })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  } catch (err) {
    console.error('加载日志失败:', err)
  }
}

// 加载存储统计
async function loadStorageStats() {
  try {
    const stats = await getStorage().getStatistics()
    
    // 粗略估算大小（简化版本）
    storageStats.value = {
      usersSize: stats.userCount * 500, // 估算每个用户 500 字节
      memosSize: stats.memoCount * 1000, // 估算每个备忘录 1KB
      filesSize: stats.fileCount * 5000, // 估算每个文件元数据 5KB
      logsSize: stats.logCount * 300, // 估算每条日志 300 字节
      totalSize: 0,
    }

    storageStats.value.totalSize =
      storageStats.value.usersSize +
      storageStats.value.memosSize +
      storageStats.value.filesSize +
      storageStats.value.logsSize
  } catch (err) {
    console.error('加载存储统计失败:', err)
  }
}

// 加载活跃度统计
async function loadActivityStats() {
  try {
    const users = await getStorage().getAllUsers()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    activityStats.value = {
      todayActive: users.filter((u) => {
        const lastLogin = new Date(u.lastLoginAt)
        return lastLogin >= today
      }).length,
      weekActive: users.filter((u) => {
        const lastLogin = new Date(u.lastLoginAt)
        return lastLogin >= weekAgo
      }).length,
      monthActive: users.filter((u) => {
        const lastLogin = new Date(u.lastLoginAt)
        return lastLogin >= monthAgo
      }).length,
      totalUsers: users.length,
    }
  } catch (err) {
    console.error('加载活跃度统计失败:', err)
  }
}

// 刷新数据
async function refreshData() {
  await Promise.all([loadLogs(), loadStorageStats(), loadActivityStats()])
  showToast('数据已刷新', 'info')
}

// 导出日志
async function exportLogs() {
  try {
    const blob = await logManager.exportLogs()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cyp-memo-logs-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast('日志导出成功')
  } catch (err) {
    showToast('日志导出失败', 'error')
    console.error(err)
  }
}

// 查看日志详情
function viewLogDetail(log: LogEntry) {
  selectedLog.value = log
  showLogDetail.value = true
}

// 分页
function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

// 格式化
function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function getLevelText(level: LogLevel): string {
  const map: Record<LogLevel, string> = {
    debug: '调试',
    info: '信息',
    warn: '警告',
    error: '错误',
  }
  return map[level] || level
}

// 生命周期
onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.monitor-view {
  /* Removed padding as AdminLayout provides it */
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.view-header h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

/* 日志区域 */
.logs-section,
.storage-section,
.activity-section {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filter-select {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}

.logs-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #f5f7fa;
}

th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #606266;
  font-size: 14px;
}

td {
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
  font-size: 14px;
  color: #606266;
}

.log-level {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.log-level-debug {
  background: #f4f4f5;
  color: #909399;
}

.log-level-info {
  background: #ecf5ff;
  color: #409eff;
}

.log-level-warn {
  background: #fdf6ec;
  color: #e6a23c;
}

.log-level-error {
  background: #fef0f0;
  color: #f56c6c;
}

.log-message {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #909399;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.page-info {
  font-size: 14px;
  color: #606266;
}

/* 存储统计 */
.storage-section h3,
.activity-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #303133;
}

.storage-stats,
.activity-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.storage-item,
.activity-item {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 4px;
}

.storage-item.total {
  background: #ecf5ff;
}

.storage-label,
.activity-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.storage-value,
.activity-value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

/* 按钮 */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-primary:hover {
  background: #66b1ff;
}

.btn-secondary {
  background: #dcdfe6;
  color: #606266;
}

.btn-secondary:hover:not(:disabled) {
  background: #c0c4cc;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-info {
  background: #909399;
  color: white;
}

.btn-info:hover {
  background: #a6a9ad;
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
  min-width: 500px;
  max-width: 700px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #303133;
}

.log-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  gap: 12px;
}

.detail-label {
  font-weight: 600;
  color: #606266;
  min-width: 60px;
}

.context-pre {
  flex: 1;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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

[data-theme='dark'] .logs-section,
[data-theme='dark'] .storage-section,
[data-theme='dark'] .activity-section {
  background: #262727;
}

[data-theme='dark'] .section-header h3,
[data-theme='dark'] .storage-section h3,
[data-theme='dark'] .activity-section h3 {
  color: #e5eaf3;
}

[data-theme='dark'] .filter-select {
  background: #1d1e1f;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] thead {
  background: #1d1e1f;
}

[data-theme='dark'] th {
  color: #cfd3dc;
}

[data-theme='dark'] td {
  color: #cfd3dc;
  border-top-color: #414243;
}

[data-theme='dark'] .page-info {
  color: #cfd3dc;
}

[data-theme='dark'] .storage-item,
[data-theme='dark'] .activity-item {
  background: #1d1e1f;
}

[data-theme='dark'] .storage-item.total {
  background: #1a2332;
}

[data-theme='dark'] .storage-label,
[data-theme='dark'] .activity-label {
  color: #8a8f99;
}

[data-theme='dark'] .storage-value,
[data-theme='dark'] .activity-value {
  color: #e5eaf3;
}

[data-theme='dark'] .modal-content {
  background: #262727;
}

[data-theme='dark'] .modal-content h3 {
  color: #e5eaf3;
}

[data-theme='dark'] .detail-label {
  color: #cfd3dc;
}

[data-theme='dark'] .context-pre {
  background: #1d1e1f;
  color: #e5eaf3;
}
</style>
