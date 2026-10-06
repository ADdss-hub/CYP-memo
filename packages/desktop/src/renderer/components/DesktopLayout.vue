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
    await ElMessageBox.confirm(
      '确定退出当前账号吗？退出后需重新登录。不会注销账号，也不会清除数据。',
      '退出当前账号',
      {
        confirmButtonText: '退出',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

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
                    <span>退出当前账号</span>
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
  background: transparent;
}

.app-header {
  height: 60px;
  background: var(--cyp-chrome-bg);
  border-bottom: 1px solid var(--cyp-chrome-border);
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
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
  color: var(--cyp-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.menu-toggle:hover {
  background: var(--cyp-bg-muted);
  color: var(--cyp-brand);
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--cyp-text);
}

.app-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
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
  background: var(--cyp-bg-muted);
}

.user-icon {
  font-size: 20px;
  color: var(--cyp-text-secondary);
}

.username {
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  font-size: 14px;
  color: var(--cyp-text-muted);
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-sidebar {
  width: 240px;
  background: var(--cyp-chrome-bg);
  border-right: 1px solid var(--cyp-chrome-border);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
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
  background: transparent;
}

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
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.28);
  }

  .app-sidebar.collapsed {
    transform: translateX(-100%);
  }

  .app-content {
    padding: 12px;
    padding-bottom: 72px;
  }
}
</style>
