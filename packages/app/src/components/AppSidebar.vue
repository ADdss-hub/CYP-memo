<!--
  应用侧边栏 · 消费 navigation/menu.ts（VIEW-03 单一数据源）
  分组可收纳；主侧栏窄轨时仅显示图标
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <nav class="sidebar-nav" :class="{ compact }">
    <div
      v-for="section in visibleSections"
      :key="section.id"
      class="nav-section"
      :class="{ collapsed: !compact && isCollapsed(section.id) }"
    >
      <button
        v-if="!compact"
        type="button"
        class="nav-section-toggle"
        :aria-expanded="!isCollapsed(section.id)"
        :aria-controls="`nav-section-${section.id}`"
        @click="toggleSection(section.id)"
      >
        <span class="nav-section-title">{{ section.title }}</span>
        <el-icon class="nav-section-chevron" :size="14">
          <ArrowDown />
        </el-icon>
      </button>
      <div
        v-else
        class="nav-section-divider"
        :title="section.title"
        aria-hidden="true"
      />
      <div
        :id="`nav-section-${section.id}`"
        class="nav-section-body"
        role="region"
        :aria-label="section.title"
      >
        <router-link
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          :title="item.label"
        >
          <span class="nav-icon" aria-hidden="true">
            <el-icon :size="compact ? 20 : 18">
              <component :is="item.icon" />
            </el-icon>
          </span>
          <span v-if="!compact" class="nav-label">{{ item.label }}</span>
        </router-link>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowDown } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { APP_MENU_SECTIONS, filterMenuByPermissions } from '../navigation/menu'

defineProps<{
  /** 主侧栏收纳为窄轨时仅显示图标 */
  compact?: boolean
}>()

const SECTION_STORAGE_KEY = 'cyp-memo-nav-sections-collapsed'

const route = useRoute()
const authStore = useAuthStore()

const visibleSections = computed(() =>
  filterMenuByPermissions(APP_MENU_SECTIONS, authStore.permissions)
)

const collapsedIds = ref<Set<string>>(loadCollapsed())

function loadCollapsed(): Set<string> {
  try {
    const raw =
      localStorage.getItem(SECTION_STORAGE_KEY) ??
      localStorage.getItem('cyp-memo-sidebar-collapsed')
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistCollapsed() {
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify([...collapsedIds.value]))
  } catch {
    /* ignore */
  }
}

function isCollapsed(sectionId: string): boolean {
  return collapsedIds.value.has(sectionId)
}

function toggleSection(sectionId: string) {
  const next = new Set(collapsedIds.value)
  if (next.has(sectionId)) next.delete(sectionId)
  else next.add(sectionId)
  collapsedIds.value = next
  persistCollapsed()
}

function expandSection(sectionId: string) {
  if (!collapsedIds.value.has(sectionId)) return
  const next = new Set(collapsedIds.value)
  next.delete(sectionId)
  collapsedIds.value = next
  persistCollapsed()
}

const isActive = (path: string) => {
  const current = route?.path ?? ''
  if (path === '/tenant') {
    return current === '/tenant' || current === '/tenant/'
  }
  return current === path || current.startsWith(`${path}/`)
}

watch(
  () => [route?.path ?? '', visibleSections.value] as const,
  () => {
    for (const section of visibleSections.value) {
      if (section.items.some((item) => isActive(item.path))) {
        expandSection(section.id)
        break
      }
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}

.sidebar-nav.compact {
  gap: 4px;
  padding: 8px 0;
  align-items: center;
}

.nav-section {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.sidebar-nav.compact .nav-section {
  align-items: center;
}

.nav-section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  padding: 8px 16px 8px 20px;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--cyp-text-muted);
  transition: background 0.15s, color 0.15s;
}

.nav-section-toggle:hover {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
}

.nav-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: left;
}

.nav-section-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.nav-section.collapsed .nav-section-chevron {
  transform: rotate(-90deg);
}

.nav-section-divider {
  width: 24px;
  height: 1px;
  margin: 6px 0;
  background: var(--cyp-border);
  opacity: 0.7;
}

.nav-section-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  max-height: 480px;
  opacity: 1;
  transition: max-height 0.22s ease, opacity 0.18s ease;
}

.sidebar-nav.compact .nav-section-body {
  align-items: center;
  max-height: none;
  opacity: 1;
}

.nav-section.collapsed .nav-section-body {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
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

.sidebar-nav.compact .nav-item {
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-left: none;
  border-radius: 8px;
  gap: 0;
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

.sidebar-nav.compact .nav-item.active {
  border-left-color: transparent;
}

.nav-icon {
  width: 24px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.sidebar-nav.compact .nav-icon {
  width: auto;
}

.nav-label {
  font-size: 14px;
}

</style>
