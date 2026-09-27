<!--
  移动端底部导航 · 从 menu SSOT 取主要入口（VIEW-03）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <nav class="mobile-bottom-nav">
    <router-link
      v-for="item in navItems"
      :key="item.path"
      :to="item.path"
      class="nav-item"
      :class="{ active: isActive(item.path) }"
    >
      <el-icon class="nav-ep-icon" :size="20" aria-hidden="true">
        <component :is="item.icon" />
      </el-icon>
      <span class="nav-label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { APP_MENU_SECTIONS, filterMenuByPermissions } from '../navigation/menu'

const route = useRoute()
const authStore = useAuthStore()

/** 底栏只展示高频入口，仍从同一菜单源裁剪 */
const MOBILE_PATHS = ['/memos', '/statistics', '/tenant', '/settings', '/profile'] as const

const navItems = computed(() => {
  const flat = filterMenuByPermissions(APP_MENU_SECTIONS, authStore.permissions).flatMap(
    (s) => s.items
  )
  return MOBILE_PATHS.map((path) => flat.find((i) => i.path === path)).filter(
    (i): i is NonNullable<typeof i> => Boolean(i)
  )
})

const isActive = (path: string) => {
  if (path === '/tenant') {
    return route.path === '/tenant' || route.path.startsWith('/tenant/')
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped>
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: var(--cyp-bg-card);
  border-top: 1px solid var(--cyp-border);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-height: 44px;
  min-width: 44px;
  padding: 4px 8px;
  text-decoration: none;
  color: var(--cyp-text-muted);
  transition: all 0.2s;
  border-radius: 8px;
}

.nav-item:active {
  background: var(--cyp-bg-muted);
}

.nav-item.active {
  color: var(--cyp-brand);
}

.nav-ep-icon {
  color: inherit;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
}
</style>
