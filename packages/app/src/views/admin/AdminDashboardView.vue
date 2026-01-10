<!--
  管理员仪表盘（集成在用户端）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="admin-dashboard">
    <div class="admin-header">
      <h1>系统管理</h1>
      <div class="header-actions">
        <span class="admin-name">{{ adminName }}</span>
        <button class="logout-btn" @click="handleLogout">退出管理</button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.userCount }}</div>
          <div class="stat-label">用户数</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.memoCount }}</div>
          <div class="stat-label">备忘录数</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📎</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.fileCount }}</div>
          <div class="stat-label">文件数</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">🔗</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.shareCount }}</div>
          <div class="stat-label">分享链接</div>
        </div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="quick-links">
      <div class="link-card" @click="goToUsers">
        <div class="link-icon">👥</div>
        <div class="link-content">
          <h3>用户管理</h3>
          <p>查看和管理所有用户</p>
        </div>
        <div class="link-arrow">→</div>
      </div>

      <div class="link-card" @click="goToDatabase">
        <div class="link-icon">💾</div>
        <div class="link-content">
          <h3>数据库管理</h3>
          <p>备份、恢复和清理数据</p>
        </div>
        <div class="link-arrow">→</div>
      </div>

      <div class="link-card" @click="goToLogs">
        <div class="link-icon">📋</div>
        <div class="link-content">
          <h3>系统日志</h3>
          <p>查看系统运行日志</p>
        </div>
        <div class="link-arrow">→</div>
      </div>
    </div>

    <div class="back-link">
      <router-link to="/">← 返回用户端</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storageManager, adminAuthManager } from '@cyp-memo/shared'

const router = useRouter()

const adminName = ref('管理员')
const stats = ref({
  userCount: 0,
  memoCount: 0,
  fileCount: 0,
  shareCount: 0,
  logCount: 0,
})

async function loadStats() {
  try {
    const storage = storageManager.getAdapter()
    stats.value = await storage.getStatistics()
  } catch (err) {
    console.error('加载统计信息失败:', err)
  }
}

async function checkAuth() {
  const admin = await adminAuthManager.autoLogin()
  if (!admin) {
    router.push('/admin/login')
    return
  }
  adminName.value = admin.username
}

function handleLogout() {
  adminAuthManager.logout()
  router.push('/admin/login')
}

function goToUsers() {
  router.push('/admin/users')
}

function goToDatabase() {
  router.push('/admin/database')
}

function goToLogs() {
  router.push('/admin/logs')
}

onMounted(async () => {
  await checkAuth()
  await loadStats()
})
</script>

<style scoped>
.admin-dashboard {
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
}

.admin-header h1 {
  margin: 0;
  font-size: 24px;
  color: #1e3c72;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.admin-name {
  color: #606266;
  font-size: 14px;
}

.logout-btn {
  padding: 8px 16px;
  background: #f56c6c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.logout-btn:hover {
  background: #f78989;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.link-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.link-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.link-icon {
  font-size: 32px;
}

.link-content {
  flex: 1;
}

.link-content h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #303133;
}

.link-content p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.link-arrow {
  font-size: 20px;
  color: #c0c4cc;
}

.back-link {
  text-align: center;
  padding: 16px;
}

.back-link a {
  color: #909399;
  text-decoration: none;
  font-size: 14px;
}

.back-link a:hover {
  color: #1e3c72;
}

[data-theme='dark'] .admin-dashboard {
  background: #0a0a0a;
}

[data-theme='dark'] .admin-header,
[data-theme='dark'] .stat-card,
[data-theme='dark'] .link-card {
  background: #1d1e1f;
}

[data-theme='dark'] .admin-header h1 {
  color: #5b8fd8;
}

[data-theme='dark'] .stat-value {
  color: #e5eaf3;
}

[data-theme='dark'] .link-content h3 {
  color: #e5eaf3;
}
</style>
