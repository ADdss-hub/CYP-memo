<!--
  运行日志（独立页面 · tenant_logs）
  运行流水 + 操作审计；数据流转归「数据维护」
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="tenant-logs" v-loading="bootLoading">
      <OpsPageShell
        title="运行日志"
        desc="本范围运行流水与敏感操作审计。数据流转请到「数据维护」。"
        live
        :meta="updatedLabel"
      >
        <div class="toolbar">
          <el-select v-model="kindFilter" style="width: 140px">
            <el-option label="全部操作" value="" />
            <el-option label="运行日志" value="运行日志" />
            <el-option label="操作审计" value="操作审计" />
          </el-select>
          <el-select v-model="levelFilter" style="width: 120px">
            <el-option label="全部级别" value="" />
            <el-option label="错误" value="error" />
            <el-option label="警告" value="warn" />
            <el-option label="信息" value="info" />
            <el-option label="调试" value="debug" />
          </el-select>
          <el-input
            v-model="keyword"
            clearable
            placeholder="搜索操作、说明、操作者"
            style="max-width: 280px"
          />
          <span class="count">{{ filtered.length }} 条</span>
        </div>

        <el-table :data="filtered" stripe empty-text="暂无操作记录" max-height="640" size="small">
          <el-table-column label="时间" width="168">
            <template #default="{ row }">{{ row.timeLabel }}</template>
          </el-table-column>
          <el-table-column label="类别" width="96">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="kindTag(row.kind)">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="级别" width="72">
            <template #default="{ row }">{{ row.levelLabel }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.actionLabel }}</template>
          </el-table-column>
          <el-table-column label="说明" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.detail }}</template>
          </el-table-column>
          <el-table-column label="操作者" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.actor }}</template>
          </el-table-column>
          <el-table-column label="追踪号" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.trace }}</template>
          </el-table-column>
        </el-table>
      </OpsPageShell>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storageManager, resolveApiBaseUrl } from '@cyp-memo/shared'
import { AppLayout, OpsPageShell } from '../../components'
import { formatTs, zhAction, zhLevel, zhSource, zhType } from './opsZh'

interface OpRow {
  kind: '运行日志' | '操作审计'
  at: number
  timeLabel: string
  level: string
  levelLabel: string
  actionLabel: string
  detail: string
  actor: string
  trace: string
}

interface RawLog {
  level?: string
  message?: string
  action?: string
  userId?: string
  timestamp?: string | Date
  traceId?: string
  context?: { type?: string }
}

interface AuditRow {
  actor?: string
  action?: string
  resource?: string
  detail?: string
  at?: string
}

const bootLoading = ref(true)
const rows = ref<OpRow[]>([])
const kindFilter = ref('')
const levelFilter = ref('')
const keyword = ref('')
const updatedAt = ref<Date | null>(null)

const POLL_GAP_MS = 6000
let pollStopped = false
let pollInFlight: Promise<void> | null = null
let wakeTimer: ReturnType<typeof setTimeout> | null = null

const updatedLabel = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleString('zh-CN') : '尚未更新'
)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (kindFilter.value && r.kind !== kindFilter.value) return false
    if (levelFilter.value && r.kind === '运行日志' && r.level !== levelFilter.value) return false
    if (!kw) return true
    const blob = `${r.actionLabel} ${r.detail} ${r.actor} ${r.kind}`.toLowerCase()
    return blob.includes(kw)
  })
})

function kindTag(kind: string): 'info' | 'warning' {
  if (kind === '操作审计') return 'warning'
  return 'info'
}

function authHeaders(): Record<string, string> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function apiBase(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

function toMs(v: unknown): number {
  const n = new Date(String(v || '')).getTime()
  return Number.isFinite(n) ? n : 0
}

async function loadAll() {
  const api = apiBase()
  const headers = authHeaders()
  const next: OpRow[] = []

  try {
    const adapter = storageManager.getAdapter()
    const list = (await adapter.getLogs({ limit: 300 })) as unknown as RawLog[]
    for (const log of list) {
      const typeLabel = log.context?.type ? zhType(log.context.type) : ''
      next.push({
        kind: '运行日志',
        at: toMs(log.timestamp),
        timeLabel: formatTs(log.timestamp),
        level: String(log.level || ''),
        levelLabel: zhLevel(log.level),
        actionLabel: zhAction(log.action, log.message),
        detail: [typeLabel, String(log.message || '')].filter(Boolean).join(' · ') || '—',
        actor: log.userId || '系统',
        trace: log.traceId || '—',
      })
    }
  } catch (err) {
    console.error('[tenant/logs] 运行日志失败:', err)
  }

  try {
    const r = await fetch(`${api}/audit/status?limit=200`, { headers })
    const json = (await r.json()) as { data?: { recent?: AuditRow[] } }
    for (const a of json?.data?.recent || []) {
      next.push({
        kind: '操作审计',
        at: toMs(a.at),
        timeLabel: formatTs(a.at),
        level: 'info',
        levelLabel: '审计',
        actionLabel: zhAction(a.action, a.action),
        detail: [a.resource ? `资源 ${zhSource(a.resource)}` : '', a.detail || '']
          .filter(Boolean)
          .join(' · ') || '—',
        actor: a.actor || '系统',
        trace: '—',
      })
    }
  } catch (err) {
    console.error('[tenant/logs] 审计失败:', err)
  }

  next.sort((a, b) => b.at - a.at)
  rows.value = next.slice(0, 400)
  updatedAt.value = new Date()
  bootLoading.value = false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    wakeTimer = setTimeout(resolve, ms)
  })
}

function clearWake() {
  if (wakeTimer) {
    clearTimeout(wakeTimer)
    wakeTimer = null
  }
}

async function pollLoop() {
  while (!pollStopped) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await sleep(POLL_GAP_MS)
      continue
    }
    pollInFlight = loadAll()
    await pollInFlight
    pollInFlight = null
    if (pollStopped) break
    await sleep(POLL_GAP_MS)
  }
}

onMounted(() => {
  pollStopped = false
  void pollLoop()
})

onUnmounted(() => {
  pollStopped = true
  clearWake()
})
</script>

<style scoped>
.tenant-logs {
  color: var(--cyp-text);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.count {
  font-size: 12px;
  color: var(--cyp-text-muted);
}
</style>
