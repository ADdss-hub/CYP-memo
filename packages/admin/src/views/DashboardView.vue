<!--
  管理员控制台主页
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AdminLayout>
    <div class="dashboard-content">
      <div class="welcome-card">
        <h2>欢迎使用 CYP-memo 管理员端</h2>
        <p>您可以在这里管理系统用户、数据库和监控系统运行状态。</p>
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
        </el-card>

        <el-card class="link-card" shadow="hover" @click="goToDatabase">
          <template #header>
            <div class="card-header">
              <el-icon size="24"><Coin /></el-icon>
              <span>数据库管理</span>
            </div>
          </template>
          <p>查看数据库状态、备份和恢复</p>
        </el-card>

        <el-card class="link-card" shadow="hover" @click="goToMonitor">
          <template #header>
            <div class="card-header">
              <el-icon size="24"><Monitor /></el-icon>
              <span>系统监控</span>
            </div>
          </template>
          <p>查看系统日志和性能指标</p>
        </el-card>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AdminLayout from '../components/AdminLayout.vue'
import { User, Coin, Monitor } from '@element-plus/icons-vue'

const router = useRouter()

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
  background: white;
  padding: 32px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 32px;
}

.welcome-card h2 {
  margin: 0 0 16px 0;
  font-size: 20px;
  color: #303133;
}

.welcome-card p {
  margin: 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.link-card {
  cursor: pointer;
  transition: all 0.2s;
}

.link-card:hover {
  transform: translateY(-2px);
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
  margin: 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .quick-links {
    grid-template-columns: 1fr;
  }
}
</style>
