<!--
  移动端底部导航栏组件
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
      <component :is="item.icon" class="nav-icon" />
      <span class="nav-label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Document, DataAnalysis, Setting, User } from '@element-plus/icons-vue'
import type { Component } from 'vue'

interface NavItem {
  path: string
  label: string
  icon: Component
}

const route = useRoute()

const navItems: NavItem[] = [
  {
    path: '/memos',
    label: '备忘录',
    icon: Document,
  },
  {
    path: '/statistics',
    label: '统计',
    icon: DataAnalysis,
  },
  {
    path: '/settings',
    label: '设置',
    icon: Setting,
  },
  {
    path: '/account',
    label: '账号',
    icon: User,
  },
]

const isActive = (path: string) => {
  return route.path.startsWith(path)
}
</script>

<style scoped>
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: white;
  border-top: 1px solid #e4e7ed;
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
  color: #909399;
  transition: all 0.2s;
  border-radius: 8px;
}

.nav-item:active {
  background: #f5f7fa;
}

.nav-item.active {
  color: #409eff;
}

.nav-icon {
  font-size: 22px;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
}

/* 深色主题支持 */
[data-theme='dark'] .mobile-bottom-nav {
  background: #1d1e1f;
  border-top-color: #414243;
}

[data-theme='dark'] .nav-item {
  color: #8a8f99;
}

[data-theme='dark'] .nav-item:active {
  background: #262727;
}

[data-theme='dark'] .nav-item.active {
  color: #409eff;
}
</style>
