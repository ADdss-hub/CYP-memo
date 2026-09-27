<!--
  运行监控（独立页面 · 监控告警类仪表盘 · tenant_monitor）
  对齐军械库《界面仪表盘设计规范》监控告警类：指标卡置顶 + 近实时轮询 + 状态网格
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="tenant-monitor" v-loading="bootLoading">
      <OpsPageShell
        title="运行监控"
        desc="健康、性能与自动闭环。默认只看总览；底座明细与调度可展开。"
        live
        :meta="updatedLabel"
      >
      <el-alert
        v-if="banner"
        :type="banner.type"
        :closable="false"
        :title="banner.title"
        style="margin-bottom: 16px"
      />

      <!-- 核心指标区 -->
      <div class="kpi-grid">
        <div class="kpi-card" :class="toneClass(overallTone)">
          <div class="kpi-label">整体健康</div>
          <div class="kpi-value">{{ healthLabel }}</div>
          <div class="kpi-sub">{{ ready ? '就绪探针 ready' : '未就绪' }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">运行时长</div>
          <div class="kpi-value">{{ uptimeLabel }}</div>
          <div class="kpi-sub">版本 {{ versionLabel }}</div>
        </div>
        <div class="kpi-card" :class="toneClass(diskTone)">
          <div class="kpi-label">存储空间可用</div>
          <div class="kpi-value">{{ diskAvailableLabel }}</div>
          <div class="kpi-sub">{{ diskTotalLabel }}</div>
        </div>
        <div class="kpi-card kpi-card--wide" :class="toneClass(perfTone)">
          <div class="kpi-label">接口时延 · P95</div>
          <div class="kpi-value-row">
            <div class="kpi-value">{{ p95Label }}</div>
            <el-tag size="small" :type="slaOk ? 'success' : 'danger'" effect="plain">
              {{ slaOkLabel }}
            </el-tag>
          </div>
          <div class="kpi-metrics">
            <div class="kpi-metric">
              <span class="kpi-metric-k">P50</span>
              <span class="kpi-metric-v">{{ p50Label }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">P99</span>
              <span class="kpi-metric-v">{{ p99Label }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">目标</span>
              <span class="kpi-metric-v">{{ appliedSla.p95Ms }} ms</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">判定</span>
              <span class="kpi-metric-v">{{ effectiveP95Label }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">采样</span>
              <span class="kpi-metric-v">{{ sampleCount }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">越阈累计</span>
              <span class="kpi-metric-v">{{ breachCount }}</span>
            </div>
          </div>
        </div>
        <div class="kpi-card kpi-card--wide" :class="toneClass(qpsTone)">
          <div class="kpi-label">近窗吞吐</div>
          <div class="kpi-value-row">
            <div class="kpi-value">{{ qpsLabel }}</div>
            <span class="kpi-value-unit">QPS</span>
          </div>
          <div class="kpi-metrics">
            <div class="kpi-metric">
              <span class="kpi-metric-k">错误率</span>
              <span class="kpi-metric-v">{{ errorRateLabel }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">上限</span>
              <span class="kpi-metric-v">{{ (appliedSla.errorRatePct).toFixed(1) }}%</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">最近采样</span>
              <span class="kpi-metric-v">{{ lastSampleRouteShort }}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-k">耗时</span>
              <span class="kpi-metric-v">{{ lastSampleMs }}</span>
            </div>
          </div>
        </div>
        <div class="kpi-card" :class="toneClass(alertTone)">
          <div class="kpi-label">自动派单</div>
          <div class="kpi-value">{{ alertDelivered }}</div>
          <div class="kpi-sub">
            持有 {{ alertAssigned }} · 开 {{ alertOpen }} · 抑制 {{ alertSuppressed }}
          </div>
        </div>
        <div class="kpi-card" :class="toneClass(baseTone)">
          <div class="kpi-label">运行底座</div>
          <div class="kpi-value">{{ baseReadyCount }}/35</div>
          <div class="kpi-sub">L0 {{ l0ReadyCount }} · L1 {{ l1ReadyCount }}</div>
        </div>
      </div>

      <div class="two-col">
        <section class="panel">
          <h2 class="panel-title">完整自动闭环</h2>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="性能服务">
              {{ perfReady ? '就绪' : '未就绪' }} · SLA {{ slaOkLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="分位">
              P50 {{ p50Label }} / P95 {{ p95Label }} / P99 {{ p99Label }}
            </el-descriptions-item>
            <el-descriptions-item label="基线 P95">
              {{ baselineLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="频率 / 错误">
              QPS {{ qpsLabel }} · 错误率 {{ errorRateLabel }} · 采样 {{ sampleCount }}
            </el-descriptions-item>
            <el-descriptions-item label="最近采样">
              {{ lastSampleRoute }} · {{ lastSampleMs }}
            </el-descriptions-item>
            <el-descriptions-item label="本机能力">
              {{ machineLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动感知">
              {{ autoSenseLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动判定">
              {{ autoDecideLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动调压">
              {{ autoRegulateLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动落地">
              {{ autoExecuteLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动回升">
              {{ autoRecoverLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动提高">
              {{ autoRaiseLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动固化">
              {{ autoPromoteLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="自动收尾">
              {{ autoSettleLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="压力面">
              {{ pressureLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="最近自动动作">
              {{ lastElasticityAction }}
            </el-descriptions-item>
          </el-descriptions>
          <div class="perf-sla-form">
            <div class="perf-sla-head">
              <div class="perf-sla-title">性能目标</div>
              <div class="perf-sla-chips">
                <el-tag size="small" :type="slaDirty ? 'warning' : 'success'" effect="plain">
                  {{ slaDirty ? '有未保存修改' : '已与线上一致' }}
                </el-tag>
                <el-tag size="small" :type="slaStricterThanDefault ? 'success' : 'info'" effect="plain">
                  {{ slaStricterThanDefault ? '严于高标准' : '等于高标准上限' }}
                </el-tag>
                <el-tag size="small" :type="slaOk ? 'success' : 'danger'" effect="plain">
                  当前 {{ slaOkLabel }}
                </el-tag>
              </div>
            </div>
            <p class="perf-sla-lead">
              运维可收紧，不可放宽于三维高标准。保存经配置管控热变更并记版本。
            </p>
            <div class="perf-sla-grid">
              <label>
                <span class="perf-sla-label">单请求上限</span>
                <span class="perf-sla-meta">已生效 {{ appliedSla.requestMs }} ms · 高标准 ≤ {{ defaultSla.requestMs }}</span>
                <el-input-number
                  v-model="slaDraft.requestMs"
                  :min="100"
                  :max="defaultSla.requestMs"
                  :step="50"
                  size="small"
                  controls-position="right"
                />
              </label>
              <label>
                <span class="perf-sla-label">窗口 P95 上限</span>
                <span class="perf-sla-meta">
                  已生效 {{ appliedSla.p95Ms }} ms · 判定用 {{ effectiveP95Label }} · 高标准 ≤
                  {{ defaultSla.p95Ms }}
                </span>
                <el-input-number
                  v-model="slaDraft.p95Ms"
                  :min="50"
                  :max="defaultSla.p95Ms"
                  :step="50"
                  size="small"
                  controls-position="right"
                />
              </label>
              <label>
                <span class="perf-sla-label">错误率上限</span>
                <span class="perf-sla-meta">
                  已生效 {{ appliedSla.errorRatePct }}% · 高标准 ≤
                  {{ (defaultSla.errorRate * 100).toFixed(1) }}%
                </span>
                <div class="perf-sla-inline">
                  <el-input-number
                    v-model="slaDraft.errorRatePct"
                    :min="0.1"
                    :max="defaultSla.errorRate * 100"
                    :step="0.1"
                    :precision="1"
                    size="small"
                    controls-position="right"
                  />
                  <span class="perf-sla-unit">%</span>
                </div>
              </label>
              <label>
                <span class="perf-sla-label">告警连续越界</span>
                <span class="perf-sla-meta">
                  已生效 {{ appliedSla.alertAfterBreaches }} 次 · 高标准默认
                  {{ defaultSla.alertAfterBreaches }} 次
                </span>
                <el-input-number
                  v-model="slaDraft.alertAfterBreaches"
                  :min="1"
                  :max="10"
                  :step="1"
                  size="small"
                  controls-position="right"
                />
              </label>
            </div>
            <p v-if="effectiveP95Note" class="perf-sla-hint">{{ effectiveP95Note }}</p>
            <p class="perf-sla-hint">
              高标准默认：单请求 {{ defaultSla.requestMs }} ms · P95 {{ defaultSla.p95Ms }} ms · 错误率
              {{ (defaultSla.errorRate * 100).toFixed(1) }}% · 连续 {{ defaultSla.alertAfterBreaches }} 次。性能管控只在业务并发见顶且时延越过目标，或内存/事件循环危机之后才动手；只收紧观测与调度，不拒绝备忘录、登录、文件等业务。
            </p>
            <div class="perf-sla-actions">
              <el-button
                size="small"
                type="primary"
                :loading="perfActing"
                :disabled="!slaDirty"
                @click="saveSlaTargets"
              >
                保存目标
              </el-button>
              <el-button size="small" :disabled="!slaDirty || perfActing" @click="discardSlaDraft">
                放弃修改
              </el-button>
              <el-button size="small" :loading="perfActing" @click="resetSlaTargets">
                恢复高标准
              </el-button>
            </div>
          </div>
          <div class="perf-actions">
            <span class="perf-actions-label">闭环操作</span>
            <el-button size="small" :loading="perfActing" @click="captureBaseline">固化基线</el-button>
            <el-button
              size="small"
              :disabled="!elasticityReversible"
              :loading="perfActing"
              @click="revertElasticityAction"
            >
              紧急回退
            </el-button>
            <el-button size="small" :loading="perfActing" @click="promoteBaseline">提升基线</el-button>
          </div>
          <el-table
            v-if="topSlowRoutes.length"
            :data="topSlowRoutes"
            stripe
            size="small"
            max-height="220"
            style="margin-top: 12px"
            empty-text="暂无慢路由"
          >
            <el-table-column prop="route" label="慢路由" min-width="160" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="64" />
            <el-table-column label="P95" width="72">
              <template #default="{ row }">{{ row.p95Ms ?? '—' }}</template>
            </el-table-column>
            <el-table-column prop="maxMs" label="最大" width="72" />
            <el-table-column prop="errorCount" label="5xx" width="56" />
          </el-table>
          <div class="panel-head" style="margin-top: 16px">
            <h3 class="panel-title">自动派单</h3>
            <span class="panel-meta">
              持有 {{ alertAssigned }} · 开 {{ alertOpen }} · {{ lastAlertLabel }}
            </span>
          </div>
          <el-table :data="alertTickets" stripe empty-text="暂无自动派单持有中的告警" max-height="220" size="small">
            <el-table-column prop="severity" label="级别" width="64" />
            <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="80" />
            <el-table-column prop="assignee" label="自动闭环" min-width="140" show-overflow-tooltip />
          </el-table>
        </section>
        <section class="panel">
          <h2 class="panel-title">发布 / 治理 / 存储</h2>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="活跃版本">
              {{ release.activeVersion || versionLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="金丝雀权重">
              {{ release.canaryWeight ?? 0 }}%
            </el-descriptions-item>
            <el-descriptions-item label="紧急停机">
              <el-tag size="small" :type="killSwitch ? 'danger' : 'success'" effect="plain">
                {{ killSwitch ? '已启用' : '未启用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="文件存储">
              {{ fileStorageReady ? '就绪' : '未就绪' }}
            </el-descriptions-item>
            <el-descriptions-item label="上传根目录">
              {{ uploadRoot || '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="环境">
              {{ configSummary.appEnv || '—' }} · 端口 {{ configSummary.port || '—' }}
            </el-descriptions-item>
          </el-descriptions>
        </section>
      </div>

      <p class="hint">
        自动闭环：感知 → 判定 → 调压 → 落地 → 回升 → 提高 → 固化 → 收尾 → 派单。详细底座与调度见下方展开区；运行流水见
        <router-link to="/tenant/logs">运行日志</router-link>
        。
      </p>

      <el-collapse class="eng-collapse">
        <el-collapse-item title="运行底座明细（L0 / L1）" name="base">
          <div class="two-col">
            <section class="panel nested">
              <h3 class="panel-title">L0 基础设施与协调</h3>
              <div class="roster-grid">
                <div
                  v-for="c in l0Items"
                  :key="c.id"
                  class="roster-card"
                  :class="c.ok ? 'ok' : 'bad'"
                >
                  <span class="roster-id">{{ c.id }}</span>
                  <span class="roster-name">{{ c.name }}</span>
                  <el-tag size="small" :type="c.ok ? 'success' : 'danger'" effect="plain">
                    {{ c.ok ? '就绪' : '未就绪' }}
                  </el-tag>
                </div>
              </div>
            </section>
            <section class="panel nested">
              <h3 class="panel-title">L1 管控</h3>
              <div class="chip-grid">
                <div
                  v-for="item in mgmtItems"
                  :key="item.id"
                  class="status-chip"
                  :class="item.ok ? 'ok' : 'bad'"
                >
                  <span class="dot" />
                  {{ item.name }}
                </div>
              </div>
            </section>
          </div>
          <div class="two-col">
            <section class="panel nested">
              <h3 class="panel-title">L1 托管业务</h3>
              <div class="chip-grid">
                <div
                  v-for="item in hostItems"
                  :key="item.id"
                  class="status-chip"
                  :class="item.ok ? 'ok' : 'bad'"
                >
                  <span class="dot" />
                  {{ item.name }}
                </div>
              </div>
            </section>
            <section class="panel nested">
              <h3 class="panel-title">L1 协作与公开</h3>
              <div class="chip-grid">
                <div
                  v-for="item in collabItems"
                  :key="item.id"
                  class="status-chip"
                  :class="item.ok ? 'ok' : 'bad'"
                >
                  <span class="dot" />
                  {{ item.name }}
                </div>
              </div>
            </section>
          </div>
          <el-descriptions :column="1" border size="small" style="margin-top: 8px">
            <el-descriptions-item label="闭集标准">
              {{ automation.standard || 'docs/runtime-base/AUTOMATION_INTELLIGENCE.md' }}
            </el-descriptions-item>
            <el-descriptions-item label="A3 自动闭环">{{ automationA3Label }}</el-descriptions-item>
          </el-descriptions>
        </el-collapse-item>
        <el-collapse-item title="调度任务" name="schedule">
          <p class="panel-meta" style="margin: 0 0 8px">
            任务 {{ schedule.jobCount ?? jobs.length }} · 启用 {{ schedule.enabledCount ?? '—' }}
            · 上次 tick {{ formatTs(schedule.lastTickAt) }}
          </p>
          <el-table :data="jobs" stripe empty-text="暂无调度任务" max-height="280" size="small">
            <el-table-column prop="id" label="任务" min-width="140" show-overflow-tooltip />
            <el-table-column prop="kind" label="类型" width="80" />
            <el-table-column prop="handlerName" label="处理器" min-width="140" show-overflow-tooltip />
            <el-table-column label="启用" width="70">
              <template #default="{ row }">
                {{ row.enabled ? '是' : '否' }}
              </template>
            </el-table-column>
            <el-table-column prop="lastStatus" label="上次状态" width="90" />
            <el-table-column label="上次运行" width="160">
              <template #default="{ row }">
                {{ formatTs(row.lastRunAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
        <el-collapse-item title="原始探针 JSON（排障）" name="raw">
          <pre class="json-block">{{ readyJson }}</pre>
          <pre class="json-block" style="margin-top: 12px">{{ configJson }}</pre>
        </el-collapse-item>
      </el-collapse>
      </OpsPageShell>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
import { AppLayout, OpsPageShell } from '../../components'

type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

interface ScheduleJobRow {
  id: string
  kind: string
  handlerName: string
  enabled: boolean
  lastStatus: string
  lastRunAt: string | null
}

/** 仅首屏全页 loading；后续静默近实时轮询，避免闪烁 */
const bootLoading = ref(true)
const updatedAt = ref<Date | null>(null)
/** 轮询间隔（完成一轮后等待，非固定 tick 叠请求） */
const POLL_GAP_MS = 3000
let pollStopped = false
let pollInFlight: Promise<void> | null = null
let wakeTimer: ReturnType<typeof setTimeout> | null = null

const health = ref<Record<string, unknown> | null>(null)
const readyData = ref<Record<string, unknown> | null>(null)
const readyJson = ref('加载中…')
const configJson = ref('加载中…')
const configSummary = ref<Record<string, unknown>>({})
const alertState = ref<Record<string, unknown>>({})
const schedule = ref<Record<string, unknown>>({})
const jobs = ref<ScheduleJobRow[]>([])
const elasticity = ref<Record<string, unknown>>({})
const perfDetail = ref<Record<string, unknown>>({})
const release = ref<Record<string, unknown>>({})
const fileStorage = ref<Record<string, unknown>>({})
const governance = ref<Record<string, unknown>>({})
const perfActing = ref(false)
const defaultSla = ref({
  requestMs: 1000,
  p95Ms: 500,
  errorRate: 0.01,
  alertAfterBreaches: 2,
})
const slaDraft = ref({
  requestMs: 1000,
  p95Ms: 500,
  errorRatePct: 1,
  alertAfterBreaches: 2,
})
/** 用户正在编辑草稿时，轮询不得冲掉输入 */
let slaDraftDirty = false

function syncSlaDraftFromPerf(src: Record<string, unknown>, force = false) {
  if (slaDraftDirty && !force) return
  const sla = asRecord(src.sla)
  if (sla.requestMs == null && sla.p95Ms == null) return
  slaDraft.value = {
    requestMs: Number(sla.requestMs) || defaultSla.value.requestMs,
    p95Ms: Number(sla.p95Ms) || defaultSla.value.p95Ms,
    errorRatePct: Math.round((Number(sla.errorRate) || defaultSla.value.errorRate) * 1000) / 10,
    alertAfterBreaches: Number(sla.alertAfterBreaches) || defaultSla.value.alertAfterBreaches,
  }
  slaDraftDirty = false
}

function discardSlaDraft() {
  syncSlaDraftFromPerf(perf.value, true)
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

async function fetchJson(url: string, auth = false): Promise<unknown> {
  const r = await fetch(url, { headers: auth ? authHeaders() : {} })
  return r.json()
}

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

function formatTs(v: unknown): string {
  if (!v) return '—'
  try {
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toLocaleString()
  } catch {
    return String(v)
  }
}

function toneClass(t: Tone): string {
  if (t === 'ok') return 'tone-ok'
  if (t === 'warn') return 'tone-warn'
  if (t === 'bad') return 'tone-bad'
  return ''
}

const ready = computed(() => Boolean(asRecord(readyData.value).ready ?? health.value?.ready))
const healthStatus = computed(() => String(health.value?.status || (ready.value ? 'ok' : 'unknown')))
const healthLabel = computed(() => {
  const s = healthStatus.value
  if (s === 'ok') return '正常'
  if (s === 'degraded') return '降级'
  if (s === 'unhealthy') return '异常'
  return ready.value ? '就绪' : '未知'
})
const overallTone = computed<Tone>(() => {
  const s = healthStatus.value
  if (s === 'ok' && ready.value) return 'ok'
  if (s === 'degraded') return 'warn'
  if (s === 'unhealthy' || !ready.value) return 'bad'
  return 'neutral'
})

const uptimeLabel = computed(() => formatUptime(health.value?.uptime))
const versionLabel = computed(
  () => String(health.value?.version || configSummary.value.version || '—')
)

const disk = computed(() => {
  const h = health.value
  return asRecord(h?.storageSpace ?? h?.diskSpace)
})
const diskAvailableLabel = computed(() => formatBytes(disk.value.available))
const diskTotalLabel = computed(() => {
  if (!disk.value.total) return '容量未知'
  return `共 ${formatBytes(disk.value.total)} · 已用 ${formatBytes(disk.value.used)}`
})
const diskTone = computed<Tone>(() => {
  const avail = Number(disk.value.available)
  const total = Number(disk.value.total)
  if (!Number.isFinite(avail) || !Number.isFinite(total) || total <= 0) return 'neutral'
  const ratio = avail / total
  if (ratio < 0.1) return 'bad'
  if (ratio < 0.2) return 'warn'
  return 'ok'
})

const perf = computed(() => {
  const fromApi = perfDetail.value
  if (Object.keys(fromApi).length) return fromApi
  return asRecord(asRecord(readyData.value).perf)
})
const p50 = computed(() => perf.value.p50Ms)
const p95 = computed(() => perf.value.p95Ms)
const p99 = computed(() => perf.value.p99Ms)
const p50Label = computed(() => (p50.value == null ? '—' : `${p50.value} ms`))
const p95Label = computed(() => (p95.value == null ? '—' : `${p95.value} ms`))
const p99Label = computed(() => (p99.value == null ? '—' : `${p99.value} ms`))
const breachCount = computed(() => Number(perf.value.breachCount) || 0)
const sampleCount = computed(() => Number(perf.value.sampleCount) || 0)
const qpsLabel = computed(() => {
  const q = Number(perf.value.qps)
  return Number.isFinite(q) ? String(q) : '—'
})
const errorRateLabel = computed(() => {
  const r = Number(perf.value.errorRate)
  if (!Number.isFinite(r)) return '—'
  return `${(r * 100).toFixed(2)}%`
})
const slaOk = computed(() => perf.value.slaOk !== false)
const slaOkLabel = computed(() => (slaOk.value ? '达标' : '越阈'))
const appliedSla = computed(() => {
  const sla = asRecord(perf.value.sla)
  return {
    requestMs: Number(sla.requestMs) || defaultSla.value.requestMs,
    p95Ms: Number(sla.p95Ms) || defaultSla.value.p95Ms,
    errorRatePct: Math.round((Number(sla.errorRate) || defaultSla.value.errorRate) * 1000) / 10,
    alertAfterBreaches: Number(sla.alertAfterBreaches) || defaultSla.value.alertAfterBreaches,
  }
})
const slaDirty = computed(() => {
  const a = appliedSla.value
  const d = slaDraft.value
  return (
    d.requestMs !== a.requestMs ||
    d.p95Ms !== a.p95Ms ||
    d.errorRatePct !== a.errorRatePct ||
    d.alertAfterBreaches !== a.alertAfterBreaches
  )
})
watch(
  slaDraft,
  () => {
    slaDraftDirty = slaDirty.value
  },
  { deep: true }
)
const slaStricterThanDefault = computed(() => {
  const d = slaDraft.value
  return (
    d.requestMs < defaultSla.value.requestMs ||
    d.p95Ms < defaultSla.value.p95Ms ||
    d.errorRatePct < defaultSla.value.errorRate * 100 ||
    d.alertAfterBreaches !== defaultSla.value.alertAfterBreaches
  )
})
const effectiveP95Ms = computed(() => {
  const fromApi = Number(perf.value.effectiveP95Ms)
  if (Number.isFinite(fromApi) && fromApi > 0) return fromApi
  return appliedSla.value.p95Ms
})
const effectiveP95Label = computed(() => `${effectiveP95Ms.value} ms`)
const effectiveP95Note = computed(() => {
  const configured = appliedSla.value.p95Ms
  const effective = effectiveP95Ms.value
  const b = asRecord(perf.value.baseline)
  if (b.p95Ms == null) return ''
  if (effective < configured) {
    return `判定用 P95 已按健康基线（${b.p95Ms} ms）收紧为 ${effective} ms，比目标更严，利于提前闭环。`
  }
  return ''
})
const autoSenseLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).sense)
  const level = String(a.level || 'ok')
  const name = level === 'ok' ? '正常' : level === 'warn' ? '预警' : '危急'
  return `运行中 · ${name}`
})
const machineLabel = computed(() => {
  const m = asRecord(asRecord(perf.value.automation).machine)
  if (m.logicalCpus == null && m.floorConcurrency == null) return '探测中'
  const cpu = m.logicalCpus != null ? `${m.logicalCpus} 逻辑 CPU` : 'CPU —'
  const arch = [m.platform, m.arch].filter(Boolean).join('/')
  const total = m.totalMemMb != null ? `${m.totalMemMb} MB` : '—'
  const free = m.freeMemMb != null ? `剩余 ${m.freeMemMb} MB` : ''
  const floor = m.floorConcurrency != null ? String(m.floorConcurrency) : '—'
  const max = m.maxConcurrency != null ? String(m.maxConcurrency) : '—'
  const rpm = m.apiRpm != null ? `API ${m.apiRpm}/分` : ''
  const drain = m.mqDrainBatch != null ? `队列批 ${m.mqDrainBatch}` : ''
  return `${arch ? arch + ' · ' : ''}${cpu} · 内存 ${total}${free ? ' · ' + free : ''} · 并发地板 ${floor} / 上限 ${max}${rpm ? ' · ' + rpm : ''}${drain ? ' · ' + drain : ''}`
})
const autoDecideLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).decide)
  const intent = String(a.intent || 'hold')
  const reason = String(a.reason || '')
  const map: Record<string, string> = {
    hold: '待命',
    tighten: '收紧',
    recover: '回升',
    raise: '提高',
    promote: '固化',
    settle: '收尾',
  }
  const name = map[intent] || intent
  return reason ? `${name} · ${reason}` : name
})
const autoRegulateLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).regulate)
  if (!a.active) return '待命（无压力不调压）'
  return `收紧中 · ${String(a.action || 'quota_tighten')}`
})
const autoExecuteLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).execute)
  const fallback = asRecord(elasticity.value.applied)
  const concurrency =
    a.concurrency != null
      ? String(a.concurrency)
      : fallback.concurrency != null
        ? String(fallback.concurrency)
        : '—'
  const factor =
    a.rateLimitFactor != null
      ? String(a.rateLimitFactor)
      : fallback.rateLimitFactor != null
        ? String(fallback.rateLimitFactor)
        : '—'
  if (concurrency === '—' && factor === '—') return '待命'
  return `已应用 · 并发 ${concurrency} · 限流系数 ${factor}`
})
const autoRecoverLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).recover)
  const legacy = asRecord(asRecord(perf.value.automation).release)
  const held = a.held ?? legacy.held
  if (held) return '回升中 · 渐进回到基线'
  if (a.at || legacy.at) return `已回升 · ${formatTs(a.at || legacy.at)}`
  return '未持有收紧'
})
const autoRaiseLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).raise)
  const concurrency = a.concurrency != null ? String(a.concurrency) : '—'
  if (a.action === 'raise') {
    return `提高中 · 并发 ${concurrency}${a.demand ? ' · 有需求' : ' · 回补地板'}`
  }
  if (a.at) return `待命 · 并发 ${concurrency}${a.demand ? '' : ' · 无需求不抬升'}`
  return `待命 · 并发 ${concurrency}`
})
const autoPromoteLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).promote)
  const concurrency = a.concurrency != null ? String(a.concurrency) : '—'
  const baseline = a.baselineConcurrency != null ? String(a.baselineConcurrency) : '—'
  if (String(a.action || '').includes('promote')) return `已固化 · 基线 ${baseline}（并发 ${concurrency}）`
  if (a.action === 'baseline') return '已刷新更优 P95 对照'
  return `待命 · 并发 ${concurrency} / 基线 ${baseline}`
})
const autoSettleLabel = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).settle)
  if (a.at) return `已收尾 · ${formatTs(a.at)}${a.reason ? ` · ${a.reason}` : ''}`
  return '待命'
})
const applied = computed(() => asRecord(elasticity.value.applied))
const elasticityReversible = computed(() => {
  const a = asRecord(asRecord(perf.value.automation).execute)
  if (Object.prototype.hasOwnProperty.call(a, 'reversible')) return Boolean(a.reversible)
  return Boolean(applied.value.reversible)
})
const pressureLabel = computed(() => {
  const p = asRecord(perf.value.pressure)
  const level = String(p.level || 'ok')
  const reasons = Array.isArray(p.reasons) ? (p.reasons as string[]).join(' · ') : ''
  const lag = p.eventLoopLagMs != null ? `延迟 ${p.eventLoopLagMs}ms` : ''
  const heap =
    p.heapRatio != null ? `堆 ${(Number(p.heapRatio) * 100).toFixed(0)}%` : ''
  const control = String(p.control || 'idle')
  const controlName =
    control === 'crisis' ? '危机后才管控' : control === 'bottleneck' ? '瓶颈后才管控' : '未介入业务'
  const bits = [controlName, level === 'ok' ? '正常' : level === 'warn' ? '预警' : '危急', heap, lag, reasons]
    .filter(Boolean)
    .join(' · ')
  return bits || '—'
})
const baselineLabel = computed(() => {
  const b = asRecord(perf.value.baseline)
  if (b.p95Ms == null) return '未固化'
  return `${b.p95Ms} ms · ${formatTs(b.capturedAt)}`
})
const topSlowRoutes = computed(() => {
  const rows = perf.value.topSlowRoutes
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
})
const perfReady = computed(() => Boolean(perf.value.ready))
const perfTone = computed<Tone>(() => {
  if (!perfReady.value) return 'warn'
  if (!slaOk.value) return 'bad'
  if (breachCount.value > 0) return 'warn'
  const ms = Number(p95.value)
  if (Number.isFinite(ms) && ms > Number(asRecord(perf.value.sla).p95Ms || 500)) return 'bad'
  return 'ok'
})
const qpsTone = computed<Tone>(() => {
  const r = Number(perf.value.errorRate)
  const lim = Number(asRecord(perf.value.sla).errorRate || 0.01)
  if (Number.isFinite(r) && r > lim) return 'bad'
  if (Number.isFinite(r) && r > lim * 0.5) return 'warn'
  return 'ok'
})
const lastSample = computed(() => asRecord(perf.value.lastSample))
const lastSampleRoute = computed(() => String(lastSample.value.route || '—'))
const lastSampleRouteShort = computed(() => {
  const route = lastSampleRoute.value
  if (route.length <= 28) return route
  return `…${route.slice(-26)}`
})
const lastSampleMs = computed(() =>
  lastSample.value.durationMs == null ? '—' : `${lastSample.value.durationMs} ms`
)

const alertDelivered = computed(() => Number(alertState.value.delivered) || 0)
const alertSuppressed = computed(() => Number(alertState.value.suppressed) || 0)
const alertOpen = computed(() => Number(alertState.value.openCount) || 0)
const alertAssigned = computed(() => Number(alertState.value.assignedCount) || 0)
const lastAlertLabel = computed(() =>
  alertState.value.lastAlertAt ? `最近 ${formatTs(alertState.value.lastAlertAt)}` : '暂无告警'
)
const alertTone = computed<Tone>(() => {
  if (!alertState.value.ready || !alertState.value.dispositionReady) return 'warn'
  if (alertOpen.value > 0) return 'warn'
  if (alertAssigned.value > 0) return 'warn'
  return 'ok'
})

type AlertTicketRow = {
  id: string
  severity?: string
  title?: string
  status?: string
  assignee?: string | null
  createdAt?: string
}
const alertTickets = ref<AlertTicketRow[]>([])

const runtimeBase = computed(() => asRecord(asRecord(readyData.value).runtimeBase))
const baseNames = computed(() => asRecord(runtimeBase.value.displayNames))
const baseLayers = computed(() => asRecord(runtimeBase.value.layers))
const automation = computed(() => asRecord(runtimeBase.value.automation))
const automationA3Label = computed(() =>
  '自动感知 → 自动判定 → 自动调压 → 自动落地 → 自动回升 → 自动提高 → 自动固化 → 自动收尾 → 自动派单'
)
function layerItems(bag: unknown) {
  const row = asRecord(bag)
  return Object.keys(row).map((id) => ({
    id,
    name: String(baseNames.value[id] || id),
    ok: Boolean(row[id]),
  }))
}

const l0Items = computed(() => layerItems(baseLayers.value.L0))
const l1All = computed(() => layerItems(baseLayers.value.L1))
const mgmtItems = computed(() => l1All.value.filter((x) => x.id.includes('-MGMT-')))
const hostItems = computed(() => l1All.value.filter((x) => x.id.includes('-HOST-')))
const collabItems = computed(() =>
  l1All.value.filter((x) => x.id.includes('-COL-') || x.id.includes('-PUB-'))
)
const baseReadyCount = computed(
  () => l0Items.value.filter((x) => x.ok).length + l1All.value.filter((x) => x.ok).length
)
const l0ReadyCount = computed(() => l0Items.value.filter((x) => x.ok).length)
const l1ReadyCount = computed(() => l1All.value.filter((x) => x.ok).length)
const baseTone = computed<Tone>(() => {
  const n = baseReadyCount.value
  if (n === 35) return 'ok'
  if (n >= 28) return 'warn'
  return 'bad'
})

const killSwitch = computed(
  () => Boolean(governance.value.killSwitch || configSummary.value.killSwitch)
)
const fileStorageReady = computed(() => Boolean(fileStorage.value.ready))
const uploadRoot = computed(() =>
  String(fileStorage.value.uploadRoot || fileStorage.value.rootDir || '')
)
const lastElasticityAction = computed(() => {
  const exec = asRecord(asRecord(perf.value.automation).execute)
  if (exec.action) {
    return String(exec.action)
  }
  const d = asRecord(elasticity.value.lastDecision)
  if (!d.action) return '—'
  return `${d.action}${d.reason ? ` · ${d.reason}` : ''}`
})

const updatedLabel = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleString() : '尚未刷新'
)

const banner = computed(() => {
  if (killSwitch.value) {
    return { type: 'error' as const, title: '紧急停机已启用（killSwitch），写路径可能被阻断' }
  }
  if (!slaOk.value) {
    return {
      type: 'warning' as const,
      title: `性能观测：P95 ${p95Label.value} 越过对照。管控未介入业务；只有并发见顶或性能危机才会收紧观测与调度`,
    }
  }
  if (healthStatus.value === 'unhealthy' || !ready.value) {
    return { type: 'error' as const, title: '服务未就绪或健康检查异常，请检查底座与数据库' }
  }
  if (healthStatus.value === 'degraded' || diskTone.value === 'bad') {
    return { type: 'warning' as const, title: '服务降级或存储空间紧张，请关注存储与告警' }
  }
  if (baseReadyCount.value < 35) {
    return {
      type: 'warning' as const,
      title: `运行底座未全部就绪（${baseReadyCount.value}/35），详见下方 L0 / L1`,
    }
  }
  return null
})

async function refreshAll() {
  const base = apiBase()
  try {
    const snapRes = await fetchJson(`${base}/ops/snapshot`, true)
    const snapBody = asRecord(snapRes)
    if (!snapBody.success) {
      throw new Error(String(snapBody.message || 'ops/snapshot 失败'))
    }
    const data = asRecord(snapBody.data)
    health.value = asRecord(data.health)
    readyData.value = asRecord(data.ready)
    readyJson.value = JSON.stringify({ success: true, data: data.ready }, null, 2)
    configSummary.value = asRecord(data.config)
    configJson.value = JSON.stringify({ success: true, data: data.config }, null, 2)

    const alerts = asRecord(data.alerts)
    if (Object.keys(alerts).length) alertState.value = alerts
    alertTickets.value = Array.isArray(data.tickets) ? (data.tickets as AlertTicketRow[]) : []

    const sched = asRecord(data.schedule)
    if (Object.keys(sched).length) {
      schedule.value = { ...schedule.value, ...sched }
      jobs.value = Array.isArray(sched.jobs) ? (sched.jobs as ScheduleJobRow[]) : []
    }
    const elast = asRecord(data.elasticity)
    if (Object.keys(elast).length) elasticity.value = elast
    const perfSt = asRecord(data.perf)
    if (Object.keys(perfSt).length) {
      perfDetail.value = perfSt
      syncSlaDraftFromPerf(perfSt)
    }
    const rel = asRecord(data.release)
    if (Object.keys(rel).length) release.value = rel
    const files = asRecord(data.files)
    if (Object.keys(files).length) fileStorage.value = files
    const gov = asRecord(data.governance)
    if (Object.keys(gov).length) governance.value = gov

    updatedAt.value = new Date()
  } catch (e) {
    console.error('[tenant/monitor] 实时拉取失败:', e)
    readyJson.value = String(e)
  } finally {
    bootLoading.value = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    wakeTimer = setTimeout(resolve, ms)
  })
}

async function postJson(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const r = await fetch(`${apiBase()}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      'Idempotency-Key': `perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function captureBaseline() {
  perfActing.value = true
  try {
    const res = asRecord(await postJson('perf/baseline', { force: true }))
    if (!res.success) {
      ElMessage.warning(String(res.message || asRecord(res.error).message || '固化基线失败'))
      return
    }
    ElMessage.success('性能基线已固化')
    await refreshAll()
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    perfActing.value = false
  }
}

async function saveSlaTargets() {
  perfActing.value = true
  try {
    const res = asRecord(
      await postJson('perf/sla', {
        requestMs: slaDraft.value.requestMs,
        p95Ms: slaDraft.value.p95Ms,
        errorRate: slaDraft.value.errorRatePct / 100,
        alertAfterBreaches: slaDraft.value.alertAfterBreaches,
      })
    )
    if (!res.success) {
      ElMessage.warning(String(res.message || asRecord(res.error).message || '保存目标失败'))
      return
    }
    const data = asRecord(res.data)
    const defs = asRecord(data.defaults)
    if (defs.requestMs != null) {
      defaultSla.value = {
        requestMs: Number(defs.requestMs),
        p95Ms: Number(defs.p95Ms),
        errorRate: Number(defs.errorRate),
        alertAfterBreaches: Number(defs.alertAfterBreaches),
      }
    }
    syncSlaDraftFromPerf({ sla: asRecord(data.sla) }, true)
    ElMessage.success('性能目标已保存（配置管控已记版本）')
    await refreshAll()
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    perfActing.value = false
  }
}

async function resetSlaTargets() {
  perfActing.value = true
  try {
    const res = asRecord(await postJson('perf/sla', { reset: true }))
    if (!res.success) {
      ElMessage.warning(String(res.message || asRecord(res.error).message || '恢复失败'))
      return
    }
    const data = asRecord(res.data)
    const defs = asRecord(data.defaults)
    if (defs.requestMs != null) {
      defaultSla.value = {
        requestMs: Number(defs.requestMs),
        p95Ms: Number(defs.p95Ms),
        errorRate: Number(defs.errorRate),
        alertAfterBreaches: Number(defs.alertAfterBreaches),
      }
    }
    syncSlaDraftFromPerf({ sla: asRecord(data.sla) }, true)
    ElMessage.success('已恢复三维高标准默认目标')
    await refreshAll()
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    perfActing.value = false
  }
}

async function revertElasticityAction() {
  perfActing.value = true
  try {
    const res = asRecord(await postJson('elasticity/revert', { reason: 'monitor_manual_revert' }))
    if (!res.success) {
      ElMessage.warning(String(asRecord(res.error).message || '回退失败'))
      return
    }
    ElMessage.success('已紧急回退到自动闭环基线')
    await refreshAll()
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    perfActing.value = false
  }
}

async function promoteBaseline() {
  perfActing.value = true
  try {
    const res = asRecord(await postJson('elasticity/promote-baseline', {}))
    if (!res.success) {
      ElMessage.warning(String(asRecord(res.error).message || '提升基线失败'))
      return
    }
    ElMessage.success('当前并发已提升为新基线')
    await refreshAll()
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    perfActing.value = false
  }
}

function clearWake() {
  if (wakeTimer) {
    clearTimeout(wakeTimer)
    wakeTimer = null
  }
}

/** 近实时：一轮结束后再等 POLL_GAP_MS；页签隐藏时暂停，可见/聚焦立即拉一轮 */
async function pollLoop() {
  while (!pollStopped) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await sleep(POLL_GAP_MS)
      continue
    }
    pollInFlight = refreshAll()
    await pollInFlight
    pollInFlight = null
    if (pollStopped) break
    await sleep(POLL_GAP_MS)
  }
}

function onVisibilityOrFocus() {
  if (pollStopped) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (pollInFlight) return
  clearWake()
  void refreshAll()
}

onMounted(() => {
  pollStopped = false
  void pollLoop()
  document.addEventListener('visibilitychange', onVisibilityOrFocus)
  window.addEventListener('focus', onVisibilityOrFocus)
})

onUnmounted(() => {
  pollStopped = true
  clearWake()
  document.removeEventListener('visibilitychange', onVisibilityOrFocus)
  window.removeEventListener('focus', onVisibilityOrFocus)
})
</script>

<style scoped>
.tenant-monitor {
  color: var(--cyp-text);
}

.eng-collapse {
  margin-top: 8px;
}

.panel.nested {
  margin-bottom: 12px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 22px;
  color: var(--cyp-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--cyp-text-muted);
  line-height: 1.5;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.refresh-meta {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cyp-success);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--cyp-success) 55%, transparent);
  animation: live-pulse 1.6s ease-out infinite;
}

@keyframes live-pulse {
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

.back {
  color: var(--cyp-brand);
  text-decoration: none;
  font-size: 14px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  padding: 14px 16px;
  min-height: 108px;
}

.kpi-card--wide {
  grid-column: span 2;
  min-height: 168px;
  padding: 16px 18px;
}

.kpi-card.tone-ok {
  border-color: color-mix(in srgb, var(--cyp-success) 45%, var(--cyp-border));
}

.kpi-card.tone-warn {
  border-color: color-mix(in srgb, var(--cyp-warning) 55%, var(--cyp-border));
}

.kpi-card.tone-bad {
  border-color: color-mix(in srgb, var(--cyp-danger) 55%, var(--cyp-border));
}

.kpi-label {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--cyp-text);
  line-height: 1.2;
}

.kpi-value-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.kpi-value-unit {
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.kpi-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
  margin-top: 12px;
}

.kpi-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.kpi-metric-k {
  font-size: 11px;
  color: var(--cyp-text-muted);
}

.kpi-metric-v {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.panel {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.panel-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--cyp-text);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.panel-head .panel-title {
  margin: 0;
}

.panel-meta {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.perf-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.perf-actions-label {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin-right: 4px;
}

.perf-sla-form {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
}

.perf-sla-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.perf-sla-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyp-text-primary);
}

.perf-sla-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.perf-sla-lead {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cyp-text-secondary);
}

.perf-sla-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.perf-sla-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--cyp-text-secondary);
}

.perf-sla-label {
  font-weight: 600;
  color: var(--cyp-text-primary);
}

.perf-sla-meta {
  font-size: 11px;
  line-height: 1.35;
  color: var(--cyp-text-muted);
}

.perf-sla-inline {
  display: flex;
  align-items: center;
  gap: 4px;
}

.perf-sla-unit {
  font-size: 12px;
}

.perf-sla-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cyp-text-muted);
}

.perf-sla-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--cyp-border);
  background: var(--cyp-bg-input);
  color: var(--cyp-text-secondary);
}

.status-chip .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyp-text-muted);
}

.status-chip.ok {
  border-color: color-mix(in srgb, var(--cyp-success) 40%, var(--cyp-border));
  color: var(--cyp-text);
}

.status-chip.ok .dot {
  background: var(--cyp-success);
}

.status-chip.bad {
  border-color: color-mix(in srgb, var(--cyp-danger) 40%, var(--cyp-border));
}

.status-chip.bad .dot {
  background: var(--cyp-danger);
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.roster-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--cyp-border);
  background: var(--cyp-bg-input);
}

.roster-card.ok {
  border-color: color-mix(in srgb, var(--cyp-success) 35%, var(--cyp-border));
}

.roster-card.bad {
  border-color: color-mix(in srgb, var(--cyp-danger) 35%, var(--cyp-border));
}

.roster-id {
  font-size: 11px;
  color: var(--cyp-text-muted);
  letter-spacing: 0.04em;
}

.roster-name {
  font-size: 13px;
  color: var(--cyp-text);
  font-weight: 600;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.hint a {
  color: var(--cyp-brand);
}

.raw-collapse {
  margin-bottom: 24px;
  border: none;
}

.json-block {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 280px;
  overflow: auto;
  color: var(--cyp-text-secondary);
  background: var(--cyp-bg-input);
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  padding: 12px;
}

@media (max-width: 640px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kpi-card--wide {
    grid-column: 1 / -1;
  }

  .kpi-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
