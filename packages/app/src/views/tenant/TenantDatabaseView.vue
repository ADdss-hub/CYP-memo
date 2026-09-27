<!--
  数据维护（独立页面 · tenant_database）
  本范围统计、数据源、血缘与导入导出/清空
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <OpsPageShell
      title="数据维护"
      desc="维护本范围数据：统计、数据源、流转血缘、导入导出。整实例物理删库不提供。"
    >
      <div class="ops-kpi-grid">
        <div class="ops-kpi">
          <div class="ops-kpi-label">用户</div>
          <div class="ops-kpi-value">{{ stats.userCount }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">备忘录</div>
          <div class="ops-kpi-value">{{ stats.memoCount }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">文件</div>
          <div class="ops-kpi-value">{{ stats.fileCount }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">分享</div>
          <div class="ops-kpi-value">{{ stats.shareCount }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">日志条数</div>
          <div class="ops-kpi-value">{{ stats.logCount }}</div>
        </div>
      </div>

      <section class="ops-panel">
        <h2 class="ops-panel-title">维护操作</h2>
        <p class="hint">
          备忘录表格导入导出仍在「备忘录数据」。此处导出的是本范围数据包（用户/备忘录/文件元数据/分享/日志）。
        </p>
        <div class="actions">
          <Button type="primary" :loading="busy === 'export'" @click="doExport">导出本范围数据</Button>
          <Button :loading="busy === 'import'" @click="pickImport">导入数据包</Button>
          <Button v-if="isOwner" type="danger" :loading="busy === 'clear'" @click="doClear">
            清空本范围业务数据
          </Button>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept="application/json,.json"
            @change="onImportFile"
          />
        </div>
        <p v-if="lastOp" class="op-result">{{ lastOp }}</p>
      </section>

      <section v-if="migration" class="ops-panel">
        <h2 class="ops-panel-title">数据结构迁移</h2>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="状态">{{ migration.ready ? '就绪' : '未就绪' }}</el-descriptions-item>
          <el-descriptions-item label="已应用">{{ migration.appliedCount ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="待应用">{{ migration.pendingCount ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="上次执行">{{ formatTs(migration.lastRunAt) }}</el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">已登记数据源</h2>
        <el-table :data="sources" stripe empty-text="暂无数据源或无查阅权限" size="small">
          <el-table-column label="数据源" min-width="140">
            <template #default="{ row }">{{ zhSource(row.source) }}</template>
          </el-table-column>
          <el-table-column label="表" min-width="180">
            <template #default="{ row }">{{ (row.tables || []).join('、') || '—' }}</template>
          </el-table-column>
          <el-table-column label="说明" min-width="160">
            <template #default="{ row }">{{ sourceNote(row.note) }}</template>
          </el-table-column>
          <el-table-column label="登记时间" width="170">
            <template #default="{ row }">{{ formatTs(row.registeredAt) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">近期数据流转</h2>
        <el-table :data="lineage" stripe empty-text="暂无血缘记录" size="small" max-height="320">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatTs(row.at) }}</template>
          </el-table-column>
          <el-table-column label="来源" width="120">
            <template #default="{ row }">{{ zhSource(row.source) }}</template>
          </el-table-column>
          <el-table-column label="表" width="140" prop="table" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">{{ zhAction(row.op) }}</template>
          </el-table-column>
          <el-table-column label="去向" width="120">
            <template #default="{ row }">{{ zhSource(row.sink) }}</template>
          </el-table-column>
          <el-table-column label="键" min-width="120" prop="key" show-overflow-tooltip />
          <el-table-column label="约字节" width="90">
            <template #default="{ row }">{{ row.bytesApprox ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </section>
    </OpsPageShell>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storageManager, resolveApiBaseUrl } from '@cyp-memo/shared'
import { useAuthStore } from '../../stores/auth'
import { AppLayout, Button, OpsPageShell } from '../../components'
import { formatTs, zhAction, zhSource } from './opsZh'

interface SourceRow {
  source: string
  tables?: string[]
  note?: string
  registeredAt?: string
}

interface LineageRow {
  at: string
  source: string
  table: string
  op: string
  key: string
  sink: string
  bytesApprox?: number
}

const authStore = useAuthStore()
const isOwner = computed(
  () => authStore.currentUser?.role === 'owner' || authStore.isMainAccount
)

const stats = ref({
  userCount: 0,
  memoCount: 0,
  fileCount: 0,
  shareCount: 0,
  logCount: 0,
})
const sources = ref<SourceRow[]>([])
const lineage = ref<LineageRow[]>([])
const migration = ref<Record<string, unknown> | null>(null)
const busy = ref('')
const lastOp = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function authHeaders(): Record<string, string> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function sourceNote(note: unknown): string {
  const n = String(note || '')
  const map: Record<string, string> = {
    'embedded db': '嵌入式数据库',
    'embedded cache': '嵌入式缓存',
    self: '管道自身',
    'data export': '数据导出',
    'local verify': '本地核验',
  }
  return map[n] || n || '—'
}

async function loadStats() {
  try {
    stats.value = await storageManager.getAdapter().getStatistics()
  } catch (err) {
    console.error('[tenant/database] 统计失败:', err)
  }
}

async function loadCatalog() {
  const api = resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
  const headers = authHeaders()
  try {
    const r = await fetch(`${api}/governance/data-sources`, { headers })
    const json = await r.json()
    sources.value = Array.isArray(json?.data) ? json.data : []
  } catch {
    sources.value = []
  }
  try {
    const r = await fetch(`${api}/governance/lineage?limit=100`, { headers })
    const json = await r.json()
    lineage.value = Array.isArray(json?.data) ? json.data : []
  } catch {
    lineage.value = []
  }
  try {
    const r = await fetch(`${api}/migration/status`, { headers })
    const json = await r.json()
    migration.value = json?.data && typeof json.data === 'object' ? json.data : null
  } catch {
    migration.value = null
  }
}

async function doExport() {
  busy.value = 'export'
  try {
    const payload = await storageManager.getAdapter().exportAllData()
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CYP-memo-本范围数据-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    lastOp.value = '已导出本范围数据包'
    ElMessage.success('导出完成')
    await loadCatalog()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导出失败')
  } finally {
    busy.value = ''
  }
}

function pickImport() {
  fileInput.value?.click()
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = 'import'
  try {
    const text = await file.text()
    await storageManager.getAdapter().importData(text)
    lastOp.value = `已导入 ${file.name}`
    ElMessage.success('导入完成')
    await Promise.all([loadStats(), loadCatalog()])
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导入失败')
  } finally {
    busy.value = ''
  }
}

async function doClear() {
  try {
    await ElMessageBox.confirm(
      '将清空本范围备忘录、文件、分享及子账号，主账号保留。此操作不可撤销。',
      '确认清空',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  busy.value = 'clear'
  try {
    await storageManager.getAdapter().clearAllData()
    lastOp.value = '已清空本范围业务数据（主账号保留）'
    ElMessage.success('已清空')
    await Promise.all([loadStats(), loadCatalog()])
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '清空失败')
  } finally {
    busy.value = ''
  }
}

onMounted(() => {
  void loadStats()
  void loadCatalog()
})
</script>

<style scoped>
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-input {
  display: none;
}

.op-result {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--cyp-text);
}
</style>
