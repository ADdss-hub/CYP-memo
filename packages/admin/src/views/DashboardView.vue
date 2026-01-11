<!--
  管理员控制台主页
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AdminLayout>
    <div class="dashboard-content">
      <div class="welcome-card">
        <div class="welcome-header">
          <div class="welcome-icon">🎛️</div>
          <div class="welcome-text">
            <h2>欢迎使用 CYP-memo 管理端</h2>
            <p>您可以在这里管理系统用户、数据库和监控系统运行状态。</p>
          </div>
        </div>
        <div class="welcome-version">
          <span class="version-label">当前版本</span>
          <span class="version-value">v{{ version }}</span>
        </div>
      </div>

      <div class="quick-links">
        <el-card class="link-card" shadow="hover" @click="goToUsers">
          <template #header>
            <div class="card-header">
              <el-icon size="24"><User /></el-icon>
              <span>用户管理</span>
            </div>
          </template>
          <p>查看、搜索和管理所有用户</p>
          <div class="card-badge">👥 用户数据</div>
        </el-card>

        <el-card class="link-card" shadow="hover" @click="goToDatabase">
          <template #header>
            <div class="card-header">
              <el-icon size="24"><Coin /></el-icon>
              <span>数据库管理</span>
            </div>
          </template>
          <p>查看数据库状态、备份和恢复</p>
          <div class="card-badge">🗄️ SQLite</div>
        </el-card>

        <el-card class="link-card" shadow="hover" @click="goToMonitor">
          <template #header>
            <div class="card-header">
              <el-icon size="24"><Monitor /></el-icon>
              <span>系统监控</span>
            </div>
          </template>
          <p>查看系统日志和性能指标</p>
          <div class="card-badge">📊 实时监控</div>
        </el-card>
      </div>

      <div class="system-info">
        <div class="info-item">
          <span class="info-icon">📝</span>
          <span class="info-text">CYP-memo 容器备忘录系统</span>
        </div>
        <div class="info-item">
          <span class="info-icon">👤</span>
          <span class="info-text">作者: {{ author }}</span>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AdminLayout from '../components/AdminLayout.vue'
import { User, Coin, Monitor } from '@element-plus/icons-vue'
import { VERSION } from '@cyp-memo/shared'

const router = useRouter()
const version = VERSION.full
const author = VERSION.author

/**
 * 导航到用户管理
 */
const goToUsers = () => {
  router.push('/users')
}

/**
 * 导航到数据库管理
 */
const goToDatabase = () => {
  router.push('/database')
}

/**
 * 导航到系统监控
 */
const goToMonitor = () => {
  router.push('/monitor')
}
</script>

<style scoped>
.dashboard-content {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.welcome-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
  margin-bottom: 32px;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.welcome-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.welcome-icon {
  font-size: 48px;
}

.welcome-text h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.welcome-text p {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
  line-height: 1.6;
}

.welcome-version {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}

.version-label {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.version-value {
  font-size: 20px;
  font-weight: 700;
  margin-top: 4px;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.link-card {
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 12px;
}

.link-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.link-card p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}

.card-badge {
  display: inline-block;
  padding: 4px 12px;
  background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
  border-radius: 12px;
  font-size: 12px;
  color: #667eea;
  font-weight: 500;
}

.system-info {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.info-icon {
  font-size: 16px;
}

/* 深色主题 */
[data-theme='dark'] .welcome-card {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
}

[data-theme='dark'] .card-header {
  color: #e5eaf3;
}

[data-theme='dark'] .link-card p {
  color: #a8abb2;
}

[data-theme='dark'] .card-badge {
  background: linear-gradient(135deg, #312e81 0%, #4c1d95 100%);
  color: #c4b5fd;
}

[data-theme='dark'] .system-info {
  background: #262727;
}

[data-theme='dark'] .info-item {
  color: #a8abb2;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .welcome-card {
    flex-direction: column;
    text-align: center;
    gap: 20px;
  }

  .welcome-header {
    flex-direction: column;
  }

  .quick-links {
    grid-template-columns: 1fr;
  }

  .system-info {
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
}
</style>
