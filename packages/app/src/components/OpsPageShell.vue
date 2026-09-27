<!--
  运维页统一壳（标题 / 说明 / 实时徽标 / 返回）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div class="ops-page-titles">
        <h1 class="ops-page-title">{{ title }}</h1>
        <p v-if="desc" class="ops-page-desc">{{ desc }}</p>
      </div>
      <div class="ops-page-actions">
        <template v-if="live">
          <span class="ops-live-dot" aria-hidden="true" />
          <span class="ops-meta">{{ meta || '实时' }}</span>
        </template>
        <span v-else-if="meta" class="ops-meta">{{ meta }}</span>
        <router-link v-if="showBack" class="ops-back" to="/tenant">← 运维概览</router-link>
        <slot name="actions" />
      </div>
    </header>
    <div v-if="error" class="ops-error">{{ error }}</div>
    <div v-else-if="empty" class="ops-empty">{{ empty }}</div>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    desc?: string
    live?: boolean
    meta?: string
    showBack?: boolean
    error?: string
    empty?: string
  }>(),
  {
    live: false,
    showBack: true,
    desc: '',
    meta: '',
    error: '',
    empty: '',
  }
)
</script>

<style scoped>
.ops-page {
  max-width: 1200px;
  color: var(--cyp-text);
}

.ops-page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.ops-page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--cyp-text);
}

.ops-page-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--cyp-text-muted);
  max-width: 52rem;
}

.ops-page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.ops-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyp-success);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--cyp-success) 55%, transparent);
  animation: ops-pulse 1.6s ease-out infinite;
}

@keyframes ops-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cyp-success) 45%, transparent);
  }
  70% {
    box-shadow: 0 0 0 8px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.ops-meta {
  font-size: 12px;
  color: var(--cyp-text-muted);
  font-variant-numeric: tabular-nums;
}

.ops-back {
  font-size: 13px;
  color: var(--cyp-brand);
  text-decoration: none;
}

.ops-back:hover {
  text-decoration: underline;
}

.ops-error,
.ops-empty {
  padding: 28px 20px;
  text-align: center;
  border: 1px dashed var(--cyp-border);
  border-radius: 10px;
  background: var(--cyp-bg-card);
  color: var(--cyp-text-muted);
  font-size: 14px;
}

.ops-error {
  border-color: color-mix(in srgb, var(--cyp-danger) 45%, var(--cyp-border));
  color: var(--cyp-danger);
}

/* 子页共用面板 / KPI（经 :deep 或全局 class） */
:deep(.ops-panel) {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 16px;
}

:deep(.ops-panel-title) {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--cyp-text);
}

:deep(.ops-kpi-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

:deep(.ops-kpi) {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 10px;
  padding: 14px 16px;
}

:deep(.ops-kpi-label) {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin-bottom: 6px;
}

:deep(.ops-kpi-value) {
  font-size: 22px;
  font-weight: 600;
  color: var(--cyp-text);
  font-variant-numeric: tabular-nums;
}

:deep(.ops-kpi.tone-ok) {
  border-color: color-mix(in srgb, var(--cyp-success) 40%, var(--cyp-border));
}

:deep(.ops-kpi.tone-warn) {
  border-color: color-mix(in srgb, var(--cyp-warning) 45%, var(--cyp-border));
}

:deep(.ops-kpi.tone-bad) {
  border-color: color-mix(in srgb, var(--cyp-danger) 45%, var(--cyp-border));
}

:deep(.ops-link-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

:deep(.ops-link-card) {
  display: block;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--cyp-border);
  background: var(--cyp-bg-card);
  color: var(--cyp-text);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

:deep(.ops-link-card:hover) {
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

:deep(.ops-link-card strong) {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
  color: var(--cyp-brand);
}

:deep(.ops-link-card span) {
  font-size: 12px;
  color: var(--cyp-text-muted);
  line-height: 1.4;
}
</style>
