<!--
  运维概览 · 健康总览 + 快捷入口（VIEW 页面级拆分）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <OpsPageShell
      title="运维概览"
      desc="本范围运行健康与运维入口。子账号创建与权限请用「子用户管理」。"
      :show-back="false"
      :meta="healthMeta"
      :error="loadError"
    >
      <div class="ops-kpi-grid">
        <div class="ops-kpi" :class="toneClass(healthTone)">
          <div class="ops-kpi-label">整体健康</div>
          <div class="ops-kpi-value">{{ healthLabel }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">运行时长</div>
          <div class="ops-kpi-value">{{ uptimeLabel }}</div>
        </div>
        <div class="ops-kpi" :class="toneClass(diskTone)">
          <div class="ops-kpi-label">存储空间可用</div>
          <div class="ops-kpi-value">{{ diskAvailableLabel }}</div>
        </div>
        <div class="ops-kpi" :class="toneClass(alertTone)">
          <div class="ops-kpi-label">活跃告警</div>
          <div class="ops-kpi-value">{{ alertCount }}</div>
        </div>
      </div>

      <section class="ops-panel">
        <h2 class="ops-panel-title">运维入口</h2>
        <nav class="ops-link-grid" aria-label="运维相关入口">
          <router-link v-if="canMonitor" class="ops-link-card" to="/tenant/monitor">
            <strong>运行监控</strong>
            <span>健康、性能、告警与自动闭环</span>
          </router-link>
          <router-link v-if="canLogs" class="ops-link-card" to="/tenant/logs">
            <strong>运行日志</strong>
            <span>运行流水与操作审计</span>
          </router-link>
          <router-link v-if="canDb" class="ops-link-card" to="/tenant/database">
            <strong>数据维护</strong>
            <span>统计、数据源、导入导出与流转</span>
          </router-link>
          <router-link v-if="canAccounts" class="ops-link-card" to="/accounts">
            <strong>子用户管理</strong>
            <span>子账号与权限</span>
          </router-link>
        </nav>
        <p v-if="!canMonitor && !canLogs && !canDb && !canAccounts" class="ops-empty-inline">
          当前账号暂无运维相关权限。
        </p>
      </section>
    </OpsPageShell>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Permission, resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
import { useAuthStore } from '../../stores/auth'
import { AppLayout, OpsPageShell } from '../../components'

type Tone = 'ok' | 'warn' | 'bad' | ''

const authStore = useAuthStore()
const loadError = ref('')
const health = ref<Record<string, unknown> | null>(null)
const alertCount = ref(0)

const canDb = computed(() => authStore.permissions.includes(Permission.TENANT_DATABASE))
const canMonitor = computed(() => authStore.permissions.includes(Permission.TENANT_MONITOR))
const canLogs = computed(() => authStore.permissions.includes(Permission.TENANT_LOGS))
const canAccounts = computed(() => authStore.permissions.includes(Permission.ACCOUNT_MANAGE))

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function formatBytes(n: unknown): string {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return '—'
  if (v < 1024) return `${v} B`
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`
  return `${(v / 1024 ** 3).toFixed(2)} GB`
}

function formatUptime(sec: unknown): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}天 ${h}时`
  if (h > 0) return `${h}时 ${m}分`
  return `${m}分 ${s % 60}秒`
}

function toneClass(t: Tone): string {
  if (t === 'ok') return 'tone-ok'
  if (t === 'warn') return 'tone-warn'
  if (t === 'bad') return 'tone-bad'
  return ''
}

const healthStatus = computed(() => String(health.value?.status || 'unknown'))
const healthLabel = computed(() => {
  const s = healthStatus.value
  if (s === 'ok') return '正常'
  if (s === 'degraded') return '降级'
  if (s === 'unhealthy') return '异常'
  return health.value?.ready ? '就绪' : '未知'
})
const healthTone = computed<Tone>(() => {
  const s = healthStatus.value
  if (s === 'ok') return 'ok'
  if (s === 'degraded') return 'warn'
  if (s === 'unhealthy') return 'bad'
  return ''
})
const healthMeta = computed(() => {
  const v = health.value?.version
  return v ? `版本 ${v}` : ''
})
const uptimeLabel = computed(() => formatUptime(health.value?.uptime))
const disk = computed(() => asRecord(health.value?.storageSpace ?? health.value?.diskSpace))
const diskAvailableLabel = computed(() => formatBytes(disk.value.available))
const diskTone = computed<Tone>(() => {
  const avail = Number(disk.value.available)
  const total = Number(disk.value.total)
  if (!Number.isFinite(avail) || !Number.isFinite(total) || total <= 0) return ''
  const ratio = avail / total
  if (ratio < 0.1) return 'bad'
  if (ratio < 0.2) return 'warn'
  return 'ok'
})
const alertTone = computed<Tone>(() => (alertCount.value > 0 ? 'warn' : 'ok'))

function authHeaders(): Record<string, string> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

onMounted(async () => {
  try {
    const api = resolveApiBaseUrl({
      VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
      PROD: import.meta.env.PROD,
    })
    const headers = authHeaders()
    if (canMonitor.value) {
      const r = await fetch(`${api}/ops/snapshot`, { headers })
      const json = await r.json()
      if (!r.ok || !json?.success) {
        loadError.value = String(json?.message || '无法加载运维快照')
        return
      }
      const data = asRecord(json.data)
      health.value = asRecord(data.health)
      const tickets = data.tickets
      alertCount.value = Array.isArray(tickets) ? tickets.length : 0
    } else {
      const r = await fetch(`${api}/health`)
      const json = await r.json()
      health.value = asRecord(json?.data || json)
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载失败'
  }
})
</script>

<style scoped>
.ops-empty-inline {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--cyp-text-muted);
}
</style>
