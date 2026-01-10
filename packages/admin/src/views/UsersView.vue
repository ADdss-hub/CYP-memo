<!--
  用户管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AdminLayout>
    <div class="users-view">
      <div class="view-header">
        <h2>用户管理</h2>
        <div class="header-actions">
          <button class="btn btn-info" @click="loadUsers" title="刷新列表">
            刷新
          </button>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索用户名..."
            class="search-input"
          />
          <select v-model="filterType" class="filter-select">
            <option value="all">全部用户</option>
            <option value="main">主账号</option>
            <option value="sub">子账号</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="users-table">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>账号类型</th>
              <th>创建者/所属主账号</th>
              <th>创建时间</th>
              <th>最后登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id">
              <td>{{ user.username }}</td>
              <td>
                <span :class="['badge', user.isMainAccount ? 'badge-primary' : 'badge-secondary']">
                  {{ user.isMainAccount ? '主账号' : '子账号' }}
                </span>
              </td>
              <td>
                <span v-if="user.isMainAccount" class="creator-info">-</span>
                <span v-else class="creator-info">
                  <span class="creator-label">所属：</span>
                  <span class="creator-name">{{ getParentUsername(user.parentUserId) }}</span>
                </span>
              </td>
              <td>{{ formatDate(user.createdAt) }}</td>
              <td>{{ formatDate(user.lastLoginAt) }}</td>
              <td class="actions">
                <button
                  class="btn btn-sm btn-secondary"
                  @click="handleViewPassword(user)"
                  title="查看密码"
                >
                  查看密码
                </button>
                <button
                  v-if="user.token"
                  class="btn btn-sm btn-secondary"
                  @click="handleViewToken(user)"
                  title="查看令牌"
                >
                  查看令牌
                </button>
                <button
                  class="btn btn-sm btn-warning"
                  @click="handleResetPassword(user)"
                  title="重置密码"
                >
                  重置密码
                </button>
                <button
                  v-if="user.token"
                  class="btn btn-sm btn-info"
                  @click="handleResetToken(user)"
                  title="重置令牌"
                >
                  重置令牌
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  @click="handleDeleteUser(user)"
                  title="删除用户"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="filteredUsers.length === 0" class="empty-state">没有找到用户</div>
      </div>

      <!-- 查看密码对话框 -->
      <div v-if="showViewPasswordDialog" class="modal" @click.self="closeViewPasswordDialog">
        <div class="modal-content">
          <h3>查看密码</h3>
          <p>
            用户 <strong>{{ selectedUser?.username }}</strong> 的密码信息
          </p>
          <div class="info-display">
            <div class="info-label">密码哈希值：</div>
            <div class="info-value">
              <code v-if="showPasswordHash">{{ selectedUser?.passwordHash || '未设置' }}</code>
              <code v-else>••••••••••••••••</code>
              <button class="btn btn-sm btn-secondary" @click="showPasswordHash = !showPasswordHash">
                {{ showPasswordHash ? '隐藏' : '显示' }}
              </button>
            </div>
          </div>
          <p class="info-note">
            <span class="note-icon">ℹ️</span>
            密码以哈希形式存储，无法查看原始密码。如需修改，请使用"重置密码"功能。
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeViewPasswordDialog">关闭</button>
          </div>
        </div>
      </div>

      <!-- 查看令牌对话框 -->
      <div v-if="showViewTokenDialog" class="modal" @click.self="closeViewTokenDialog">
        <div class="modal-content">
          <h3>查看令牌</h3>
          <p>
            用户 <strong>{{ selectedUser?.username }}</strong> 的个人令牌
          </p>
          <div class="token-display">
            <code v-if="showTokenValue">{{ selectedUser?.token || '未设置' }}</code>
            <code v-else>••••••••••••••••••••••••••••••••</code>
            <div class="token-actions">
              <button class="btn btn-sm btn-secondary" @click="showTokenValue = !showTokenValue">
                {{ showTokenValue ? '隐藏' : '显示' }}
              </button>
              <button v-if="selectedUser?.token" class="btn btn-sm btn-info" @click="copyUserToken">复制</button>
            </div>
          </div>
          <p class="info-note">
            <span class="note-icon">⚠️</span>
            令牌是用户的重要凭证，请妥善保管，不要泄露给他人。
          </p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeViewTokenDialog">关闭</button>
          </div>
        </div>
      </div>

      <!-- 重置密码对话框 -->
      <div v-if="showResetPasswordDialog" class="modal" @click.self="closeResetPasswordDialog">
        <div class="modal-content">
          <h3>重置密码</h3>
          <p>
            为用户 <strong>{{ selectedUser?.username }}</strong> 设置新密码
          </p>
          <input
            v-model="newPassword"
            type="password"
            placeholder="新密码（至少8位，包含字母和数字）"
            class="input"
          />
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeResetPasswordDialog">取消</button>
            <button class="btn btn-primary" @click="confirmResetPassword">确认</button>
          </div>
        </div>
      </div>

      <!-- 重置令牌对话框 -->
      <div v-if="showResetTokenDialog" class="modal" @click.self="closeResetTokenDialog">
        <div class="modal-content">
          <h3>重置个人令牌</h3>
          <p>
            为用户 <strong>{{ selectedUser?.username }}</strong> 生成新的个人令牌
          </p>
          <p class="warning">⚠️ 旧令牌将失效，请将新令牌告知用户</p>
          <div v-if="newToken" class="token-display">
            <code>{{ newToken }}</code>
            <button class="btn btn-sm btn-info" @click="copyToken">复制</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeResetTokenDialog">关闭</button>
            <button v-if="!newToken" class="btn btn-primary" @click="confirmResetToken">
              生成新令牌
            </button>
          </div>
        </div>
      </div>

      <!-- 删除用户确认对话框 -->
      <div v-if="showDeleteDialog" class="modal" @click.self="closeDeleteDialog">
        <div class="modal-content">
          <h3>删除用户</h3>
          <p>
            确定要删除用户 <strong>{{ selectedUser?.username }}</strong> 吗？
          </p>
          <p class="warning">⚠️ 此操作将删除该用户的所有数据，且无法恢复</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeDeleteDialog">取消</button>
            <button class="btn btn-danger" @click="confirmDeleteUser">确认删除</button>
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
import { ref, computed, onMounted, onActivated } from 'vue'
import { storageManager, authManager } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'
import AdminLayout from '../components/AdminLayout.vue'

// 状态
const users = ref<User[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')
const filterType = ref<'all' | 'main' | 'sub'>('all')

// 对话框状态
const showViewPasswordDialog = ref(false)
const showViewTokenDialog = ref(false)
const showResetPasswordDialog = ref(false)
const showResetTokenDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedUser = ref<User | null>(null)
const newPassword = ref('')
const newToken = ref('')
const showPasswordHash = ref(false)
const showTokenValue = ref(false)

// Toast 状态
const toast = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error' | 'info',
})

// 计算属性
const filteredUsers = computed(() => {
  let result = users.value

  // 按类型筛选
  if (filterType.value === 'main') {
    result = result.filter((u) => u.isMainAccount)
  } else if (filterType.value === 'sub') {
    result = result.filter((u) => !u.isMainAccount)
  }

  // 按搜索词筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((u) => u.username.toLowerCase().includes(query))
  }

  return result
})

// 加载用户列表
async function loadUsers() {
  loading.value = true
  error.value = null

  try {
    const storage = storageManager.getAdapter()
    users.value = await storage.getAllUsers()
  } catch (err) {
    error.value = '加载用户列表失败'
    console.error(err)
  } finally {
    loading.value = false
  }
}

// 格式化日期
function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN')
}

// 获取父账号用户名
function getParentUsername(parentUserId: string | undefined): string {
  if (!parentUserId) return '未知'
  const parent = users.value.find(u => u.id === parentUserId)
  return parent ? parent.username : '未知用户'
}

// 显示 Toast
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// 查看密码
function handleViewPassword(user: User) {
  selectedUser.value = user
  showPasswordHash.value = false
  showViewPasswordDialog.value = true
}

function closeViewPasswordDialog() {
  showViewPasswordDialog.value = false
  selectedUser.value = null
  showPasswordHash.value = false
}

// 查看令牌
function handleViewToken(user: User) {
  selectedUser.value = user
  showTokenValue.value = false
  showViewTokenDialog.value = true
}

function copyUserToken() {
  if (selectedUser.value?.token) {
    navigator.clipboard.writeText(selectedUser.value.token)
    showToast('令牌已复制到剪贴板', 'info')
  }
}

function closeViewTokenDialog() {
  showViewTokenDialog.value = false
  selectedUser.value = null
  showTokenValue.value = false
}

// 重置密码
function handleResetPassword(user: User) {
  selectedUser.value = user
  newPassword.value = ''
  showResetPasswordDialog.value = true
}

async function confirmResetPassword() {
  if (!selectedUser.value || !newPassword.value) return

  // 验证密码强度
  if (
    newPassword.value.length < 8 ||
    !/[a-zA-Z]/.test(newPassword.value) ||
    !/\d/.test(newPassword.value)
  ) {
    showToast('密码必须至少8位，包含字母和数字', 'error')
    return
  }

  try {
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash(newPassword.value, 10)

    const storage = storageManager.getAdapter()
    await storage.updateUser(selectedUser.value.id, { passwordHash })

    showToast('密码重置成功')
    closeResetPasswordDialog()
  } catch (err) {
    showToast('密码重置失败', 'error')
    console.error(err)
  }
}

function closeResetPasswordDialog() {
  showResetPasswordDialog.value = false
  selectedUser.value = null
  newPassword.value = ''
}

// 重置令牌
function handleResetToken(user: User) {
  selectedUser.value = user
  newToken.value = ''
  showResetTokenDialog.value = true
}

async function confirmResetToken() {
  if (!selectedUser.value) return

  try {
    const token = authManager.generateToken()
    newToken.value = token

    const storage = storageManager.getAdapter()
    await storage.updateUser(selectedUser.value.id, { token })

    showToast('令牌重置成功', 'success')
  } catch (err) {
    showToast('令牌重置失败', 'error')
    console.error(err)
  }
}

function copyToken() {
  if (newToken.value) {
    navigator.clipboard.writeText(newToken.value)
    showToast('令牌已复制到剪贴板', 'info')
  }
}

function closeResetTokenDialog() {
  showResetTokenDialog.value = false
  selectedUser.value = null
  newToken.value = ''
}

// 删除用户
function handleDeleteUser(user: User) {
  selectedUser.value = user
  showDeleteDialog.value = true
}

async function confirmDeleteUser() {
  if (!selectedUser.value) return

  try {
    const storage = storageManager.getAdapter()
    const userId = selectedUser.value.id

    // 直接调用删除用户 API（服务器端会自动删除用户的所有相关数据）
    await storage.deleteUser(userId)

    showToast('用户删除成功')
    closeDeleteDialog()
    await loadUsers()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    showToast(`用户删除失败: ${errorMessage}`, 'error')
    console.error('删除用户失败:', err)
  }
}

function closeDeleteDialog() {
  showDeleteDialog.value = false
  selectedUser.value = null
}

// 生命周期
onMounted(() => {
  loadUsers()
})

// 当组件被激活时（从其他页面返回）重新加载数据
onActivated(() => {
  loadUsers()
})
</script>

<style scoped>
.users-view {
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

.header-actions {
  display: flex;
  gap: 12px;
}

.search-input,
.filter-select {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}

.search-input {
  width: 200px;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
  color: #909399;
}

.error {
  color: #f56c6c;
}

.users-table {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
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

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-primary {
  background: #ecf5ff;
  color: #409eff;
}

.badge-secondary {
  background: #f4f4f5;
  color: #909399;
}

.creator-info {
  font-size: 13px;
  color: #606266;
}

.creator-label {
  color: #909399;
}

.creator-name {
  color: #409eff;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
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

.btn-secondary:hover {
  background: #c0c4cc;
}

.btn-warning {
  background: #e6a23c;
  color: white;
}

.btn-warning:hover {
  background: #ebb563;
}

.btn-info {
  background: #909399;
  color: white;
}

.btn-info:hover {
  background: #a6a9ad;
}

.btn-danger {
  background: #f56c6c;
  color: white;
}

.btn-danger:hover {
  background: #f78989;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #909399;
}

/* 模态框样式 */
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

.warning {
  color: #e6a23c;
  font-weight: 500;
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

.token-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 16px;
}

.token-display code {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.token-actions {
  display: flex;
  gap: 8px;
}

.info-display {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 16px;
}

.info-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.info-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-value code {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
  background: #e8e8e8;
  padding: 4px 8px;
  border-radius: 4px;
}

.info-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #fdf6ec;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #e6a23c;
}

.note-icon {
  flex-shrink: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Toast 样式 */
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

[data-theme='dark'] .search-input,
[data-theme='dark'] .filter-select,
[data-theme='dark'] .input {
  background: #262727;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] .users-table {
  background: #262727;
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

[data-theme='dark'] .creator-info {
  color: #cfd3dc;
}

[data-theme='dark'] .creator-label {
  color: #8a8f99;
}

[data-theme='dark'] .creator-name {
  color: #79bbff;
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

[data-theme='dark'] .token-display {
  background: #1d1e1f;
}

[data-theme='dark'] .info-display {
  background: #1d1e1f;
}

[data-theme='dark'] .info-value code {
  background: #333;
  color: #e5eaf3;
}

[data-theme='dark'] .info-note {
  background: #3a3020;
}
</style>
