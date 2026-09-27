<!--
  主布局组件 (Header + Sidebar + Content + Footer)
  主侧栏可整栏收纳（桌面窄轨 / 移动端滑出），状态走 UI store 持久化
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <button
          type="button"
          class="menu-toggle"
          :aria-label="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          :title="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          @click="toggleSidebar"
        >
          <el-icon :size="20">
            <Expand v-if="sidebarCollapsed" />
            <Fold v-else />
          </el-icon>
        </button>
        <BrandMark size="sm" class="header-logo" />
        <h1 class="app-title">CYP-memo</h1>
      </div>
      <div class="header-center">
        <slot name="header-center" />
      </div>
      <div class="header-right">
        <slot name="header-right">
          <NotifyBell />
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
      <aside
        :class="[
          'app-sidebar',
          {
            collapsed: sidebarCollapsed,
            rail: sidebarCollapsed && !isMobile,
          },
        ]"
      >
        <div class="sidebar-scroll">
          <slot name="sidebar">
            <AppSidebar :compact="sidebarCollapsed && !isMobile" />
          </slot>
        </div>
        <button
          v-if="!isMobile"
          type="button"
          class="sidebar-fold-btn"
          :aria-label="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          :title="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          @click="toggleSidebar"
        >
          <el-icon :size="16">
            <DArrowRight v-if="sidebarCollapsed" />
            <DArrowLeft v-else />
          </el-icon>
          <span v-if="!sidebarCollapsed" class="sidebar-fold-label">收纳侧栏</span>
        </button>
      </aside>

      <!-- 移动端展开时的遮罩 -->
      <div
        v-if="isMobile && !sidebarCollapsed"
        class="sidebar-backdrop"
        aria-hidden="true"
        @click="toggleSidebar"
      />

      <main class="app-content">
        <slot />
      </main>
    </div>

    <AppFooter />

    <MobileBottomNav v-if="isMobile" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import {
  User,
  ArrowDown,
  SwitchButton,
  Fold,
  Expand,
  DArrowLeft,
  DArrowRight,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { useUIStore } from '../stores/ui'
import AppFooter from './AppFooter.vue'
import MobileBottomNav from './MobileBottomNav.vue'
import AppSidebar from './AppSidebar.vue'
import NotifyBell from './NotifyBell.vue'
import BrandMark from './BrandMark.vue'

const router = useRouter()
const authStore = useAuthStore()
const uiStore = useUIStore()
const { sidebarCollapsed } = storeToRefs(uiStore)

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
const isMobile = computed(() => windowWidth.value < 768)
/** 进入移动端前的桌面折叠偏好，返回桌面时恢复 */
const desktopCollapsedPref = ref(sidebarCollapsed.value)

const toggleSidebar = () => {
  uiStore.toggleSidebar()
  if (!isMobile.value) {
    desktopCollapsedPref.value = sidebarCollapsed.value
  }
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
  } catch {
    // 用户取消退出
  }
}

const handleResize = () => {
  const wasMobile = isMobile.value
  windowWidth.value = window.innerWidth
  const nowMobile = windowWidth.value < 768

  if (!wasMobile && nowMobile) {
    desktopCollapsedPref.value = sidebarCollapsed.value
    uiStore.setSidebarCollapsed(true)
  } else if (wasMobile && !nowMobile) {
    uiStore.setSidebarCollapsed(desktopCollapsedPref.value)
  }
}

watch(isMobile, (mobile) => {
  uiStore.setMobile(mobile)
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  if (isMobile.value) {
    desktopCollapsedPref.value = sidebarCollapsed.value
    uiStore.setSidebarCollapsed(true)
  }
  uiStore.setMobile(isMobile.value)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--cyp-bg-page);
}

.app-header {
  height: 60px;
  flex-shrink: 0;
  background: var(--cyp-bg-card);
  border-bottom: 1px solid var(--cyp-border);
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
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.menu-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
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
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.app-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--cyp-bg-card);
  border-right: 1px solid var(--cyp-border);
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  overflow: hidden;
}

.app-sidebar.rail {
  width: 64px;
}

.sidebar-scroll {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
}

.sidebar-fold-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 10px 8px;
  border: none;
  border-top: 1px solid var(--cyp-border);
  background: transparent;
  color: var(--cyp-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.sidebar-fold-btn:hover {
  background: var(--cyp-bg-muted);
  color: var(--cyp-brand);
}

.sidebar-fold-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 98;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--cyp-bg-page);
}

.app-content > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

@media (max-width: 768px) {
  .app-header {
    padding: 0 12px;
  }

  .app-title {
    font-size: 18px;
  }

  .username {
    display: none;
  }

  .app-sidebar {
    position: fixed;
    left: 0;
    top: 60px;
    bottom: 60px;
    width: 240px;
    z-index: 99;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.12);
    transition: transform 0.25s ease;
  }

  .app-sidebar.collapsed {
    transform: translateX(-100%);
    width: 240px;
    box-shadow: none;
  }

  .app-sidebar.rail {
    width: 240px;
  }

  .sidebar-fold-btn {
    display: none;
  }

  .app-content {
    padding: 12px;
    padding-bottom: 72px;
  }
}

.header-logo {
  margin-right: 4px;
}
</style>
