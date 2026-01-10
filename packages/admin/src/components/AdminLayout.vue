<!--
  管理员端主布局组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="admin-layout">
    <!-- Header -->
    <header class="admin-header">
      <div class="header-left">
        <button class="menu-toggle" @click="toggleSidebar">
          <el-icon><Menu /></el-icon>
        </button>
        <h1 class="app-title">CYP-memo 管理端</h1>
      </div>
      <div class="header-right">
        <span class="username">{{ username }}</span>
        <el-button type="danger" size="small" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
          注销
        </el-button>
      </div>
    </header>

    <!-- Main Content Area -->
    <div class="admin-main">
      <!-- Sidebar -->
      <aside :class="['admin-sidebar', { collapsed: sidebarCollapsed }]">
        <nav class="sidebar-nav">
          <el-menu
            :default-active="activeMenu"
            :collapse="sidebarCollapsed"
            :router="true"
            background-color="#001529"
            text-color="#ffffff"
            active-text-color="#1890ff"
          >
            <el-menu-item index="/dashboard">
              <el-icon><HomeFilled /></el-icon>
              <template #title>控制台</template>
            </el-menu-item>

            <el-menu-item index="/users">
              <el-icon><User /></el-icon>
              <template #title>用户管理</template>
            </el-menu-item>

            <el-menu-item index="/database">
              <el-icon><Coin /></el-icon>
              <template #title>数据库管理</template>
            </el-menu-item>

            <el-menu-item index="/monitor">
              <el-icon><Monitor /></el-icon>
              <template #title>系统监控</template>
            </el-menu-item>
          </el-menu>
        </nav>
      </aside>

      <!-- Content -->
      <main class="admin-content">
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <footer class="admin-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <span class="brand-name">{{ copyrightLines.line1 }}</span>
          <span class="brand-divider">|</span>
          <span class="brand-author">{{ copyrightLines.line2 }}</span>
        </div>
        <div class="footer-copyright">
          <span>{{ copyrightLines.line3 }}</span>
          <span class="separator">·</span>
          <span>{{ copyrightLines.line4 }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAdminAuthStore } from '../stores/auth'
import { VERSION } from '@cyp-memo/shared'
import { Menu, SwitchButton, HomeFilled, User, Coin, Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const adminAuthStore = useAdminAuthStore()

const sidebarCollapsed = ref(false)
const windowWidth = ref(window.innerWidth)

const username = computed(() => adminAuthStore.username || '管理员')
const activeMenu = computed(() => route.path)
const copyrightLines = VERSION.copyrightLines

const isMobile = computed(() => windowWidth.value < 768)

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/**
 * 注销
 */
const handleLogout = async () => {
  try {
    await adminAuthStore.logout()
    ElMessage.success('注销成功')
    router.push('/login')
  } catch (err) {
    console.error('注销失败:', err)
    ElMessage.error('注销失败')
  }
}

const handleResize = () => {
  windowWidth.value = window.innerWidth
  // 自动折叠侧边栏在移动设备上
  if (isMobile.value) {
    sidebarCollapsed.value = true
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f0f2f5;
}

.admin-header {
  height: 64px;
  background: #001529;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.menu-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  font-size: 20px;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.menu-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  color: #ffffff;
  font-size: 14px;
}

.admin-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.admin-sidebar {
  width: 200px;
  background: #001529;
  overflow-y: auto;
  transition: all 0.3s;
}

.admin-sidebar.collapsed {
  width: 64px;
}

.sidebar-nav {
  height: 100%;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #f0f2f5;
}

.admin-footer {
  background: #001529;
  padding: 16px 24px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.admin-footer .footer-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.admin-footer .footer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-footer .brand-name {
  font-size: 14px;
  font-weight: 600;
  color: #1890ff;
  letter-spacing: 0.5px;
}

.admin-footer .brand-divider {
  color: rgba(255, 255, 255, 0.25);
}

.admin-footer .brand-author {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.admin-footer .footer-copyright {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.admin-footer .separator {
  color: rgba(255, 255, 255, 0.25);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .admin-header {
    padding: 0 16px;
    height: 56px;
  }

  .app-title {
    font-size: 16px;
  }

  .username {
    display: none;
  }

  .admin-sidebar {
    position: fixed;
    left: 0;
    top: 56px;
    bottom: 0;
    z-index: 99;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  }

  .admin-sidebar.collapsed {
    transform: translateX(-100%);
  }

  .admin-content {
    padding: 16px;
  }

  .admin-footer {
    padding: 12px 16px;
  }

  .admin-footer .footer-brand {
    flex-direction: column;
    gap: 4px;
  }

  .admin-footer .brand-divider {
    display: none;
  }

  .admin-footer .footer-copyright {
    font-size: 10px;
  }
}

/* 滚动条样式 */
.admin-sidebar::-webkit-scrollbar {
  width: 6px;
}

.admin-sidebar::-webkit-scrollbar-track {
  background: #001529;
}

.admin-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.admin-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
