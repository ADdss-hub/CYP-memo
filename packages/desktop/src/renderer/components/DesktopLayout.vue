<script setup lang="ts">
/**
 * 桌面客户端主布局组件
 * Desktop client main layout component
 * 
 * 基于 web app 的 AppLayout，但使用桌面客户端特有的侧边栏
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, User, ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@app-stores/auth'
import AppFooter from '@app-components/AppFooter.vue'
import MobileBottomNav from '@app-components/MobileBottomNav.vue'
import DesktopSidebar from './DesktopSidebar.vue'

const router = useRouter()
const authStore = useAuthStore()

const sidebarCollapsed = ref(false)
const windowWidth = ref(window.innerWidth)

const isMobile = computed(() => windowWidth.value < 768)

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const goToProfile = () => {
  router.push('/profile')
}

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '确认退出', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })

    await authStore.logout()
    router.push('/login')
  } catch (error) {
    // 用户取消退出
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

<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <button class="menu-toggle" @click="toggleSidebar">
          <Menu />
        </button>
        <h1 class="app-title">CYP-memo</h1>
        <span class="app-badge">桌面版</span>
      </div>
      <div class="header-center">
        <slot name="header-center" />
      </div>
      <div class="header-right">
        <slot name="header-right">
          <!-- 默认头部右侧内容 -->
          <div v-if="authStore.isAuthenticated" class="user-info">
            <el-dropdown trigger="click">
              <div class="user-dropdown-trigger">
                <el-icon class="user-icon">
                  <User />
                </el-icon>
                <span class="username">{{ authStore.username }}</span>
                <el-icon class="dropdown-icon">
                  <ArrowDown />
                </el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="goToProfile">
                    <el-icon><User /></el-icon>
                    <span>个人资料</span>
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleLogout">
                    <el-icon><SwitchButton /></el-icon>
                    <span>退出登录</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </slot>
      </div>
    </header>

    <!-- Main Content Area -->
    <div class="app-main">
      <!-- Sidebar -->
      <aside :class="['app-sidebar', { collapsed: sidebarCollapsed }]">
        <nav class="sidebar-nav">
          <slot name="sidebar">
            <!-- 使用桌面客户端侧边栏 -->
            <DesktopSidebar />
          </slot>
        </nav>
      </aside>

      <!-- Content -->
      <main class="app-content">
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <AppFooter />

    <!-- Mobile Bottom Navigation -->
    <MobileBottomNav v-if="isMobile" />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f7fa;
}

.app-header {
  height: 60px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  font-size: 20px;
  color: #606266;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.menu-toggle:hover {
  background: #f5f7fa;
  color: #409eff;
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.app-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 4px;
  font-weight: 500;
}

.header-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
}

.user-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.user-dropdown-trigger:hover {
  background: #f5f7fa;
}

.user-icon {
  font-size: 20px;
  color: #606266;
}

.username {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  font-size: 14px;
  color: #909399;
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-sidebar {
  width: 240px;
  background: white;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  transition: all 0.3s;
}

.app-sidebar.collapsed {
  width: 0;
  border-right: none;
}

.sidebar-nav {
  padding: 16px 0;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .app-header {
    padding: 0 12px;
  }

  .app-title {
    font-size: 18px;
  }

  .app-badge {
    display: none;
  }

  .username {
    display: none;
  }

  .app-sidebar {
    position: fixed;
    left: 0;
    top: 60px;
    bottom: 60px;
    z-index: 99;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .app-sidebar.collapsed {
    transform: translateX(-100%);
  }

  .app-content {
    padding: 12px;
    padding-bottom: 72px; /* 为底部导航栏留空间 */
  }
}

/* 深色主题支持 */
[data-theme='dark'] .app-layout {
  background: #0a0a0a;
}

[data-theme='dark'] .app-header {
  background: #1d1e1f;
  border-bottom-color: #414243;
}

[data-theme='dark'] .app-title {
  color: #e5eaf3;
}

[data-theme='dark'] .menu-toggle {
  color: #cfd3dc;
}

[data-theme='dark'] .menu-toggle:hover {
  background: #262727;
  color: #409eff;
}

[data-theme='dark'] .user-dropdown-trigger:hover {
  background: #262727;
}

[data-theme='dark'] .user-icon,
[data-theme='dark'] .username {
  color: #cfd3dc;
}

[data-theme='dark'] .app-sidebar {
  background: #1d1e1f;
  border-right-color: #414243;
}

[data-theme='dark'] .app-content {
  background: #0a0a0a;
}
</style>
