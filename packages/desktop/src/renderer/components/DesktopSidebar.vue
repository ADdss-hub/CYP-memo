<script setup lang="ts">
/**
 * 桌面客户端侧边栏 · 消费 app navigation/menu.ts（VIEW-03 单一数据源）
 * 仅追加桌面专有「桌面客户端设置」项，禁止再维护第二套业务菜单
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@app-stores/auth'
import { APP_MENU_SECTIONS, DESKTOP_SETTINGS_ITEM, filterMenuByPermissions } from '@app/navigation/menu'
import { isElectron } from '../composables'

const route = useRoute()
const authStore = useAuthStore()
const isDesktop = isElectron()

const visibleSections = computed(() => {
  const sections = filterMenuByPermissions(APP_MENU_SECTIONS, authStore.permissions).map(
    (section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item })),
    })
  )

  if (isDesktop) {
    const system = sections.find((s) => s.id === 'system')
    if (system && !system.items.some((i) => i.path === '/desktop-settings')) {
      system.items.push({ ...DESKTOP_SETTINGS_ITEM })
    } else if (!system) {
      sections.push({
        id: 'system',
        title: '系统',
        items: [{ ...DESKTOP_SETTINGS_ITEM }],
      })
    }
  }

  return sections
})

const isActive = (path: string) => {
  if (path === '/tenant') {
    return route.path === '/tenant' || route.path === '/tenant/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<template>
  <nav class="app-sidebar-nav">
    <div v-for="section in visibleSections" :key="section.id" class="nav-section">
      <h3 class="nav-section-title">{{ section.title }}</h3>
      <router-link
        v-for="item in section.items"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        :title="item.label"
      >
        <span class="nav-icon" aria-hidden="true">
          <el-icon :size="18">
            <component :is="item.icon" />
          </el-icon>
        </span>
        <span class="nav-label">{{ item.label }}</span>
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
  color: var(--cyp-text-muted);
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
  color: var(--cyp-text-secondary);
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: var(--cyp-bg-muted);
  color: var(--cyp-brand);
}

.nav-item.active {
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand);
  border-left-color: var(--cyp-brand);
  font-weight: 500;
}

.nav-icon {
  width: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;
}

.nav-label {
  font-size: 14px;
}
</style>
