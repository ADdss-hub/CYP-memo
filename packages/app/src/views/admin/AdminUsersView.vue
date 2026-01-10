<!--
  管理员 - 用户管理（集成在用户端）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="admin-users">
    <div class="admin-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">← 返回</button>
        <h1>用户管理</h1>
      </div>
      <div class="header-actions">
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

    <div v-else class="users-table-wrapper">
      <table class="users-table">
        <thead>
          <tr>
            <th>用户名</th>
            <th>账号类型</th>
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
            <td>{{ formatDate(user.createdAt) }}</td>
            <td>{{ formatDate(user.lastLoginAt) }}</td>
            <td class="actions">
              <button class="btn btn-warning" @click="handleResetPassword(user)">
                重置密码
              </button>
              <button class="btn btn-danger" @click="handleDeleteUser(user)">
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="filteredUsers.length === 0" class="empty-state">
        没有找到用户
      </div>
    </div>

    <!-- 重置密码对话框 -->
    <div v-if="showResetDialog" class="modal" @click.self="showResetDialog = false">
      <div class="modal-content">
        <h3>重置密码</h3>
        <p>为用户 <strong>{{ selectedUser?.username }}</strong> 设置新密码</p>
        <input
          v-model="newPassword"
          type="password"
          placeholder="新密码（至少8位）"
          class="modal-input"
        />
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showResetDialog = false">取消</button>
          <button class="btn btn-primary" @click="confirmResetPassword">确认</button>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteDialog" class="modal" @click.self="showDeleteDialog = false">
      <div class="modal-content">
        <h3>删除用户</h3>
        <p>确定要删除用户 <strong>{{ selectedUser?.username }}</strong> 吗？</p>
        <p class="warning">⚠️ 此操作将删除该用户的所有数据，无法恢复</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteDialog = false">取消</button>
          <button class="btn btn-danger" @click="confirmDeleteUser">确认删除</button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast.show" :class="['toast', `toast-${toast.type}`]">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storageManager, adminAuthManager, hashPassword } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'

const router = useRouter()

const users = ref<User[]>([])
const loading = ref(true)
const searchQuery = ref('')
const filterType = ref<'all' | 'main' | 'sub'>('all')

const showResetDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedUser = ref<User | null>(null)
const newPassword = ref('')

const toast = ref({ show: false, message: '', type: 'success' as 'success' | 'error' })

const filteredUsers = computed(() => {
  let result = users.value

  if (filterType.value === 'main') {
    result = result.filter(u => u.isMainAccount)
  } else if (filterType.value === 'sub') {
    result = result.filter(u => !u.isMainAccount)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(u => u.username.toLowerCase().includes(query))
  }

  return result
})

async function checkAuth() {
  const admin = await adminAuthManager.autoLogin()
  if (!admin) {
    router.push('/admin/login')
  }
}

async function loadUsers() {
  loading.value = true
  try {
    const storage = storageManager.getAdapter()
    users.value = await storage.getAllUsers()
  } catch (err) {
    console.error('加载用户失败:', err)
  } finally {
    loading.value = false
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN')
}

function goBack() {
  router.push('/admin/dashboard')
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function handleResetPassword(user: User) {
  selectedUser.value = user
  newPassword.value = ''
  showResetDialog.value = true
}

async function confirmResetPassword() {
  if (!selectedUser.value || !newPassword.value) return

  if (newPassword.value.length < 8) {
    showToast('密码至少需要8位', 'error')
    return
  }

  try {
    const passwordHash = await hashPassword(newPassword.value)
    const storage = storageManager.getAdapter()
    await storage.updateUser(selectedUser.value.id, { passwordHash })
    showToast('密码重置成功')
    showResetDialog.value = false
  } catch (err) {
    showToast('密码重置失败', 'error')
  }
}

function handleDeleteUser(user: User) {
  selectedUser.value = user
  showDeleteDialog.value = true
}

async function confirmDeleteUser() {
  if (!selectedUser.value) return

  try {
    const storage = storageManager.getAdapter()
    const userId = selectedUser.value.id

    // 删除用户相关数据
    const memos = await storage.getMemosByUserId(userId)
    for (const memo of memos) {
      await storage.deleteMemo(memo.id)
    }

    const files = await storage.getFilesByUserId(userId)
    for (const file of files) {
      await storage.deleteFile(file.id)
    }

    await storage.deleteUser(userId)

    showToast('用户删除成功')
    showDeleteDialog.value = false
    await loadUsers()
  } catch (err) {
    showToast('删除失败', 'error')
  }
}

onMounted(async () => {
  await checkAuth()
  await loadUsers()
})
</script>

<style scoped>
.admin-users {
  min-height: 100vh;
  background: #f0f2f5;
  padding: 24px;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 24px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  background: none;
  border: none;
  color: #409eff;
  cursor: pointer;
  font-size: 14px;
}

.admin-header h1 {
  margin: 0;
  font-size: 24px;
  color: #1e3c72;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.search-input, .filter-select {
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}

.search-input {
  width: 200px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #909399;
}

.users-table-wrapper {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
}

.users-table thead {
  background: #f5f7fa;
}

.users-table th, .users-table td {
  padding: 12px 16px;
  text-align: left;
  font-size: 14px;
}

.users-table td {
  border-top: 1px solid #ebeef5;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.badge-primary {
  background: #ecf5ff;
  color: #409eff;
}

.badge-secondary {
  background: #f4f4f5;
  color: #909399;
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
}

.btn-primary {
  background: #409eff;
  color: white;
}

.btn-secondary {
  background: #dcdfe6;
  color: #606266;
}

.btn-warning {
  background: #e6a23c;
  color: white;
}

.btn-danger {
  background: #f56c6c;
  color: white;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #909399;
}

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
}

.modal-content h3 {
  margin: 0 0 16px 0;
}

.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  margin: 12px 0;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.warning {
  color: #e6a23c;
}

.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 4px;
  color: white;
  z-index: 2000;
}

.toast-success {
  background: #67c23a;
}

.toast-error {
  background: #f56c6c;
}

[data-theme='dark'] .admin-users {
  background: #0a0a0a;
}

[data-theme='dark'] .admin-header,
[data-theme='dark'] .users-table-wrapper,
[data-theme='dark'] .modal-content {
  background: #1d1e1f;
}

[data-theme='dark'] .admin-header h1 {
  color: #5b8fd8;
}

[data-theme='dark'] .search-input,
[data-theme='dark'] .filter-select,
[data-theme='dark'] .modal-input {
  background: #262727;
  border-color: #414243;
  color: #e5eaf3;
}

[data-theme='dark'] .users-table thead {
  background: #262727;
}

[data-theme='dark'] .users-table td {
  border-top-color: #414243;
}
</style>
