<script setup lang="ts">
/**
 * 桌面客户端侧边栏导航组件
 * Desktop client sidebar navigation component
 * 
 * 扩展自 web app 的 AppSidebar，添加桌面客户端特有的菜单项
 */

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@app-stores/auth'
import { Permission } from '@cyp-memo/shared'
import { isElectron } from '../composables'

const route = useRoute()
const authStore = useAuthStore()
const isDesktop = isElectron()

// 主要功能菜单
const mainMenuItems = computed(() => {
  const items = []
  
  if (authStore.permissions.includes(Permission.MEMO_MANAGE)) {
    items.push({ path: '/memos', icon: '📝', label: '备忘录' })
  }
  
  if (authStore.permissions.includes(Permission.STATISTICS_VIEW)) {
    items.push({ path: '/statistics', icon: '📊', label: '数据统计' })
  }
  
  return items
})

// 管理菜单
const manageMenuItems = computed(() => {
  const items = []
  
  if (authStore.permissions.includes(Permission.ATTACHMENT_MANAGE)) {
    items.push({ path: '/attachments', icon: '📎', label: '附件管理' })
  }
  
  if (authStore.permissions.includes(Permission.MEMO_MANAGE)) {
    items.push({ path: '/memo-data', icon: '💾', label: '备忘录数据管理' })
    items.push({ path: '/shares', icon: '🔗', label: '分享管理' })
  }
  
  if (authStore.permissions.includes(Permission.ACCOUNT_MANAGE)) {
    items.push({ path: '/accounts', icon: '👥', label: '账号管理' })
  }
  
  return items
})

// 系统菜单
const systemMenuItems = computed(() => {
  const items = []
  
  if (authStore.permissions.includes(Permission.SETTINGS_MANAGE)) {
    items.push({ path: '/settings', icon: '⚙️', label: '系统设置' })
  }
  
  // 桌面客户端特有的设置
  if (isDesktop) {
    items.push({ path: '/desktop-settings', icon: '💻', label: '桌面客户端设置' })
  }
  
  return items
})

// 判断是否激活
const isActive = (path: string) => {
  return route.path.startsWith(path)
}
</script>

<template>
  <nav class="app-sidebar-nav">
    <div class="nav-section">
      <h3 class="nav-section-title">主要功能</h3>
      <router-link
        v-for="item in mainMenuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-section">
      <h3 class="nav-section-title">管理</h3>
      <router-link
        v-for="item in manageMenuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-section">
      <h3 class="nav-section-title">系统</h3>
      <router-link
        v-for="item in systemMenuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-section">
      <h3 class="nav-section-title">个人</h3>
      <router-link
        to="/profile"
        class="nav-item"
        :class="{ active: isActive('/profile') }"
      >
        <span class="nav-icon">👤</span>
        <span class="nav-label">个人资料</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.app-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 0;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 20px;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: #606266;
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

.nav-item.active {
  background: #ecf5ff;
  color: #409eff;
  border-left-color: #409eff;
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.nav-label {
  font-size: 14px;
}

/* 深色主题支持 */
[data-theme='dark'] .nav-section-title {
  color: #8a8f99;
}

[data-theme='dark'] .nav-item {
  color: #cfd3dc;
}

[data-theme='dark'] .nav-item:hover {
  background: #262727;
  color: #409eff;
}

[data-theme='dark'] .nav-item.active {
  background: #1a3a52;
  color: #409eff;
}
</style>
