<!--
  主布局组件 (Header + Sidebar + Content + Footer)
  主侧栏可整栏收纳（桌面窄轨 / 移动端滑出），状态走 UI store 持久化
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="app-layout">
    <a href="#main-content" class="skip-link">跳到主内容</a>

    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <button
          type="button"
          class="menu-toggle"
          :aria-label="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          :aria-expanded="!sidebarCollapsed"
          :aria-controls="isMobile ? 'app-sidebar-nav' : undefined"
          :title="sidebarCollapsed ? '展开侧边栏' : '收纳侧边栏'"
          @click="toggleSidebar"
        >
          <el-icon :size="20" aria-hidden="true">
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
              <button
                type="button"
                class="user-dropdown-trigger"
                aria-label="用户菜单"
                aria-haspopup="menu"
              >
                <el-icon class="user-icon" aria-hidden="true">
                  <User />
                </el-icon>
                <span class="username">{{ authStore.username }}</span>
                <el-icon class="dropdown-icon" aria-hidden="true">
                  <ArrowDown />
                </el-icon>
              </button>
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
      <aside
        id="app-sidebar-nav"
        :class="[
          'app-sidebar',
          {
            collapsed: sidebarCollapsed,
            rail: sidebarCollapsed && !isMobile,
          },
        ]"
        :aria-hidden="isMobile && sidebarCollapsed ? true : undefined"
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
          <el-icon :size="16" aria-hidden="true">
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

      <main id="main-content" class="app-content" tabindex="-1">
        <slot />
      </main>
    </div>

    <!-- 移动端由底栏承担导航，隐藏页脚避免与底栏重叠 -->
    <AppFooter v-if="!isMobile" />

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

const onEscapeSidebar = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (isMobile.value && !sidebarCollapsed.value) {
    uiStore.setSidebarCollapsed(true)
  }
}

watch(isMobile, (mobile) => {
  uiStore.setMobile(mobile)
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('keydown', onEscapeSidebar)
  if (isMobile.value) {
    desktopCollapsedPref.value = sidebarCollapsed.value
    uiStore.setSidebarCollapsed(true)
  }
  uiStore.setMobile(isMobile.value)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('keydown', onEscapeSidebar)
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
  /* 透出全站氛围底；工作区由顶栏/侧栏/内容实体层构成 */
  background: transparent;
  position: relative;
  z-index: 0;
}

.skip-link {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10000;
  padding: 10px 16px;
  background: var(--cyp-brand);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  border-radius: 0 0 6px 0;
  transform: translateY(-120%);
  transition: transform 0.15s ease;
}

.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid #0099ff;
  outline-offset: 2px;
}

.app-header {
  height: 60px;
  flex-shrink: 0;
  background: var(--cyp-chrome-bg);
  border-bottom: 1px solid var(--cyp-chrome-border);
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  display: flex;
  align-items: center;
  padding: 0 20px;
  padding-top: env(safe-area-inset-top, 0px);
  gap: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-sizing: content-box;
  min-height: 60px;
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
  min-width: 44px;
  min-height: 44px;
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
  min-height: 44px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  color: inherit;
  font: inherit;
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
  background: var(--cyp-chrome-bg);
  border-right: 1px solid var(--cyp-chrome-border);
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
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
  border-top: 1px solid var(--cyp-chrome-border);
  background: color-mix(in srgb, var(--cyp-chrome-bg-soft) 80%, transparent);
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
  background: transparent;
  box-sizing: border-box;
}

.app-content > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

/* 全幅工作区（列表/编辑/详情）：取消壳内边距，避免「悬浮岛」断裂布局 */
.app-content:has(.memo-list-view),
.app-content:has(.memo-edit-view),
.app-content:has(.memo-detail-view) {
  padding: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .app-header {
    padding: 0 12px;
    padding-top: env(safe-area-inset-top, 0px);
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
    top: calc(60px + env(safe-area-inset-top, 0px));
    bottom: calc(60px + env(safe-area-inset-bottom, 0px));
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
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  }

  .app-content:has(.memo-list-view),
  .app-content:has(.memo-edit-view),
  .app-content:has(.memo-detail-view) {
    padding: 0;
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
    overflow: hidden;
  }
}

.header-logo {
  margin-right: 4px;
}
</style>
