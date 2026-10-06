<!--
  运维概览 · 全模块健康 + 运行监控窗口入口（侧栏不列运行监控）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <OpsPageShell
      title="运维概览"
      desc="本范围各模块与底座组件健康。运行监控经下方窗口进入；子账号请用「子用户管理」。"
      :show-back="false"
      :meta="healthMeta"
      :error="loadError"
    >
      <div class="ops-kpi-grid">
        <div class="ops-kpi" :class="toneClass(overallTone)">
          <div class="ops-kpi-label">整体健康</div>
          <div class="ops-kpi-value">{{ healthLabel }}</div>
          <div class="ops-kpi-sub">{{ healthModuleSummary }}</div>
        </div>
        <div class="ops-kpi">
          <div class="ops-kpi-label">运行时长</div>
          <div class="ops-kpi-value">{{ uptimeLabel }}</div>
        </div>
        <div class="ops-kpi" :class="toneClass(diskTone)">
          <div class="ops-kpi-label">系统存储空间可用</div>
          <div class="ops-kpi-value">{{ diskAvailableLabel }}</div>
        </div>
        <div class="ops-kpi" :class="toneClass(alertTone)">
          <div class="ops-kpi-label">活跃告警</div>
          <div class="ops-kpi-value">{{ alertCount }}</div>
        </div>
      </div>

      <section class="ops-panel">
        <h2 class="ops-panel-title">模块与组件健康</h2>
        <p class="ops-panel-lead">点模块看明细；点「运行底座」可展开 L0 / L1 各组件。</p>
        <div class="health-modules" role="list">
          <button
            v-for="m in healthModules"
            :key="m.id"
            type="button"
            class="health-mod"
            :class="[toneClass(m.tone), { 'is-active': expandedId === m.id }]"
            role="listitem"
            :aria-pressed="expandedId === m.id"
            :aria-label="`${m.name} ${m.label}`"
            @click="toggleModule(m.id)"
          >
            <span class="health-mod-name">{{ m.name }}</span>
            <span class="health-mod-status">{{ m.label }}</span>
          </button>
        </div>
        <div
          v-if="expanded"
          class="health-detail"
          role="region"
          :aria-label="`${expanded.name}明细`"
        >
          <p class="health-detail-lead">{{ expanded.detail }}</p>
          <template v-if="expanded.id === 'base'">
            <div class="health-detail-groups">
              <div>
                <h3 class="health-detail-h">L0 基础设施与协调</h3>
                <div class="chip-grid">
                  <div
                    v-for="item in l0Items"
                    :key="item.id"
                    class="status-chip"
                    :class="item.ok ? 'ok' : 'bad'"
                  >
                    <span class="dot" />
                    {{ item.name }}
                  </div>
                </div>
              </div>
              <div>
                <h3 class="health-detail-h">L1 管控</h3>
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
              </div>
              <div>
                <h3 class="health-detail-h">L1 托管业务</h3>
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
              </div>
              <div>
                <h3 class="health-detail-h">L1 协作与公开</h3>
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
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-if="canMonitor" class="ops-panel">
        <h2 class="ops-panel-title">运行监控</h2>
        <p class="ops-panel-lead">侧栏默认不显示本页；点下方窗口进入完整监控与自动闭环。</p>
        <button
          type="button"
          class="monitor-window"
          :class="toneClass(perfTone)"
          aria-label="打开运行监控"
          @click="goMonitor"
        >
          <div class="monitor-window-head">
            <strong>运行监控窗口</strong>
            <span class="monitor-window-go">打开 →</span>
          </div>
          <div class="monitor-window-grid">
            <div>
              <span class="mw-k">P95</span>
              <span class="mw-v">{{ p95Label }}</span>
            </div>
            <div>
              <span class="mw-k">SLA</span>
              <span class="mw-v">{{ slaOkLabel }}</span>
            </div>
            <div>
              <span class="mw-k">QPS</span>
              <span class="mw-v">{{ qpsLabel }}</span>
            </div>
            <div>
              <span class="mw-k">错误率</span>
              <span class="mw-v">{{ errorRateLabel }}</span>
            </div>
            <div>
              <span class="mw-k">底座</span>
              <span class="mw-v">{{ baseReadyCount }}/35</span>
            </div>
            <div>
              <span class="mw-k">告警</span>
              <span class="mw-v">{{ alertCount }}</span>
            </div>
          </div>
        </button>
      </section>

      <section class="ops-panel">
        <h2 class="ops-panel-title">运维入口</h2>
        <nav class="ops-link-grid" aria-label="运维相关入口">
          <router-link v-if="canLogs" class="ops-link-card" to="/tenant/logs">
            <strong>运行日志</strong>
            <span>运行流水与操作审计</span>
          </router-link>
          <router-link v-if="canAccounts" class="ops-link-card" to="/accounts">
            <strong>子用户管理</strong>
            <span>子账号与权限</span>
          </router-link>
          <router-link v-if="canSettings" class="ops-link-card" to="/settings">
            <strong>系统设置</strong>
            <span>含账号注销后清除内容</span>
          </router-link>
        </nav>
        <p v-if="!canMonitor && !canLogs && !canAccounts && !canSettings" class="ops-empty-inline">
          当前账号暂无运维相关权限。
        </p>
      </section>
    </OpsPageShell>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Permission, resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
import { useAuthStore } from '../../stores/auth'
import { AppLayout, OpsPageShell } from '../../components'

type Tone = 'ok' | 'warn' | 'bad' | ''

type HealthModule = {
  id: string
  name: string
  tone: Tone
  label: string
  detail: string
}

const router = useRouter()
const authStore = useAuthStore()
const loadError = ref('')
const health = ref<Record<string, unknown> | null>(null)
const readyData = ref<Record<string, unknown>>({})
const perf = ref<Record<string, unknown>>({})
const fileStorage = ref<Record<string, unknown>>({})
const governance = ref<Record<string, unknown>>({})
const alertCount = ref(0)
const alertState = ref<Record<string, unknown>>({})
const expandedId = ref<string | null>(null)

const canMonitor = computed(() => authStore.permissions.includes(Permission.TENANT_MONITOR))
const canLogs = computed(() => authStore.permissions.includes(Permission.TENANT_LOGS))
const canAccounts = computed(() => authStore.permissions.includes(Permission.ACCOUNT_MANAGE))
const canSettings = computed(() => authStore.permissions.includes(Permission.SETTINGS_MANAGE))

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

function worstTone(tones: Tone[]): Tone {
  if (tones.some((t) => t === 'bad')) return 'bad'
  if (tones.some((t) => t === 'warn')) return 'warn'
  if (tones.some((t) => t === 'ok')) return 'ok'
  return ''
}

function toggleModule(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function goMonitor() {
  void router.push('/tenant/monitor')
}

function authHeaders(): Record<string, string> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

const ready = computed(() => Boolean(asRecord(readyData.value).ready ?? health.value?.ready))
const healthStatus = computed(() => String(health.value?.status || (ready.value ? 'ok' : 'unknown')))
const uptimeLabel = computed(() => formatUptime(health.value?.uptime))
const versionLabel = computed(() => String(health.value?.version || '—'))
const healthMeta = computed(() => (versionLabel.value !== '—' ? `版本 ${versionLabel.value}` : ''))

const disk = computed(() => asRecord(health.value?.storageSpace ?? health.value?.diskSpace))
const diskAvailableLabel = computed(() => formatBytes(disk.value.available))
const diskTotalLabel = computed(() => {
  if (!disk.value.total) return '容量未知'
  return `共 ${formatBytes(disk.value.total)} · 已用 ${formatBytes(disk.value.used)}`
})
const diskTone = computed<Tone>(() => {
  const avail = Number(disk.value.available)
  const total = Number(disk.value.total)
  if (!Number.isFinite(avail) || !Number.isFinite(total) || total <= 0) return ''
  const ratio = avail / total
  if (ratio < 0.1) return 'bad'
  if (ratio < 0.2) return 'warn'
  return 'ok'
})

const slaOk = computed(() => perf.value.slaOk !== false)
const slaOkLabel = computed(() => (slaOk.value ? '达标' : '越阈'))
const p95Label = computed(() => (perf.value.p95Ms == null ? '—' : `${perf.value.p95Ms} ms`))
const qpsLabel = computed(() => {
  const q = Number(perf.value.qps)
  return Number.isFinite(q) ? String(q) : '—'
})
const errorRateLabel = computed(() => {
  const r = Number(perf.value.errorRate)
  if (!Number.isFinite(r)) return '—'
  return `${(r * 100).toFixed(2)}%`
})
const breachCount = computed(() => Number(perf.value.breachCount) || 0)
const perfReady = computed(() => Boolean(perf.value.ready))
const perfTone = computed<Tone>(() => {
  if (!canMonitor.value) return ''
  if (!perfReady.value) return 'warn'
  if (!slaOk.value) return 'bad'
  return 'ok'
})
/** 当前窗达标即正常；历史越阈不染状态 */
const latencyTone = computed<Tone>(() => {
  if (!canMonitor.value || !perfReady.value) return 'bad'
  if (!slaOk.value) return 'bad'
  return 'ok'
})

const errorTone = computed<Tone>(() => {
  const r = Number(perf.value.errorRate)
  const lim = Number(asRecord(perf.value.sla).errorRate || 0.01)
  if (!Number.isFinite(r)) return ''
  if (r > lim) return 'bad'
  if (r > lim * 0.5) return 'warn'
  return 'ok'
})

/** 仅派单工作本身异常才不正常；有告警持有属工作中 */
const alertTone = computed<Tone>(() => {
  if (!Object.keys(alertState.value).length) return 'ok'
  if (alertState.value.ready === false || alertState.value.dispositionReady === false) {
    return 'bad'
  }
  return 'ok'
})
const killSwitch = computed(() => Boolean(governance.value.killSwitch))
const fileStorageReady = computed(() => Boolean(fileStorage.value.ready))

const runtimeBase = computed(() => asRecord(readyData.value.runtimeBase))
const baseNames = computed(() => asRecord(runtimeBase.value.displayNames))
const baseLayers = computed(() => asRecord(runtimeBase.value.layers))

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
const baseTone = computed<Tone>(() => {
  if (!canMonitor.value && baseReadyCount.value === 0) return ''
  const n = baseReadyCount.value
  if (n === 35) return 'ok'
  if (n >= 28) return 'warn'
  if (n === 0) return ''
  return 'bad'
})

const probeTone = computed<Tone>(() => {
  if (!ready.value) return 'bad'
  const s = healthStatus.value
  if (s === 'unhealthy') return 'bad'
  if (s === 'degraded') return 'warn'
  if (s === 'ok') return 'ok'
  return 'warn'
})

const healthModules = computed<HealthModule[]>(() => {
  const probeLabel =
    healthStatus.value === 'ok' && ready.value
      ? '正常'
      : healthStatus.value === 'degraded'
        ? '降级'
        : healthStatus.value === 'unhealthy' || !ready.value
          ? '异常'
          : '未知'
  const diskLabel =
    diskTone.value === 'ok'
      ? '充足'
      : diskTone.value === 'warn'
        ? '偏紧'
        : diskTone.value === 'bad'
          ? '紧张'
          : '未知'
  const latencyLabel = !canMonitor.value
    ? '无权限'
    : latencyTone.value === 'ok'
      ? '正常'
      : '不正常'
  const errLabel =
    errorTone.value === 'ok' ? '正常' : errorTone.value === 'warn' ? '偏高' : errorTone.value === 'bad' ? '越限' : '—'
  const alertLabel = alertTone.value === 'ok' ? '正常' : '不正常'
  const baseLabel =
    baseReadyCount.value === 0
      ? '未加载'
      : baseReadyCount.value === 35
        ? '全部就绪'
        : `${baseReadyCount.value}/35 就绪`

  return [
    {
      id: 'probe',
      name: '就绪探针',
      tone: probeTone.value,
      label: probeLabel,
      detail: ready.value
        ? `健康状态 ${healthStatus.value} · 版本 ${versionLabel.value} · 运行 ${uptimeLabel.value}`
        : `健康状态 ${healthStatus.value} · 就绪探针未通过`,
    },
    {
      id: 'storage',
      name: '系统存储空间',
      tone: diskTone.value || 'ok',
      label: diskLabel,
      detail: `${diskTotalLabel.value} · 可用 ${diskAvailableLabel.value}`,
    },
    {
      id: 'latency',
      name: '接口时延',
      tone: canMonitor.value ? latencyTone.value : '',
      label: latencyLabel,
      detail: canMonitor.value
        ? `P95 ${p95Label.value} · ${slaOkLabel.value} · 越阈累计 ${breachCount.value}（进程内，不影响当前是否正常）。完整分位见运行监控窗口。`
        : '当前账号无运行监控权限',
    },
    {
      id: 'errors',
      name: '近窗错误',
      tone: errorTone.value,
      label: errLabel,
      detail: `错误率 ${errorRateLabel.value} · QPS ${qpsLabel.value}`,
    },
    {
      id: 'alerts',
      name: '自动派单',
      tone: alertTone.value,
      label: alertLabel,
      detail:
        alertTone.value === 'ok'
          ? `工作正常 · 活跃告警 ${alertCount.value} 条（有告警持有仍属正常工作）`
          : '派单工作不正常（服务未就绪或处置未就绪）',
    },
    {
      id: 'base',
      name: '运行底座',
      tone: baseTone.value || 'ok',
      label: baseLabel,
      detail: `L0 / L1 合计 ${baseReadyCount.value}/35。展开查看各组件。`,
    },
    {
      id: 'files',
      name: '文件存储',
      tone: fileStorageReady.value ? 'ok' : canMonitor.value ? 'bad' : '',
      label: canMonitor.value ? (fileStorageReady.value ? '就绪' : '未就绪') : '—',
      detail: fileStorageReady.value
        ? `上传根 ${String(fileStorage.value.uploadRoot || fileStorage.value.rootDir || '—')}`
        : '文件存储未就绪或未加载',
    },
    {
      id: 'governance',
      name: '治理开关',
      tone: killSwitch.value ? 'bad' : 'ok',
      label: killSwitch.value ? '紧急停机' : '正常',
      detail: killSwitch.value ? '紧急停机已启用' : '紧急停机未启用',
    },
  ]
})

const expanded = computed(() => {
  const id = expandedId.value
  if (!id) return null
  return healthModules.value.find((m) => m.id === id) || null
})

const overallTone = computed<Tone>(() =>
  worstTone(healthModules.value.map((m) => m.tone).filter(Boolean) as Tone[])
)

const healthLabel = computed(() => {
  const t = overallTone.value
  if (t === 'ok') return '正常'
  if (t === 'warn' || t === 'bad') return '不正常'
  return healthStatus.value === 'ok' ? '正常' : '不正常'
})

const healthModuleSummary = computed(() => {
  const mods = healthModules.value
  const badN = mods.filter((m) => m.tone === 'bad' || m.tone === 'warn').length
  if (badN > 0) return `${badN} 项不正常`
  return `${mods.length} 项正常`
})

onMounted(async () => {
  try {
    const api = resolveApiBaseUrl({
      VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
      PROD: import.meta.env.PROD,
    })
    const headers = authHeaders()
    if (canMonitor.value || authStore.permissions.includes(Permission.TENANT_DASHBOARD)) {
      try {
        const r = await fetch(`${api}/ops/snapshot`, { headers })
        const json = await r.json()
        if (r.ok && json?.success) {
          const data = asRecord(json.data)
          health.value = asRecord(data.health)
          readyData.value = asRecord(data.ready)
          perf.value = asRecord(data.perf)
          fileStorage.value = asRecord(data.files ?? data.fileStorage)
          governance.value = asRecord(data.governance)
          alertState.value = asRecord(data.alerts)
          const tickets = data.tickets
          alertCount.value = Array.isArray(tickets) ? tickets.length : 0
          return
        }
      } catch {
        /* fall through */
      }
    }
    const r = await fetch(`${api}/health`)
    const json = await r.json()
    health.value = asRecord(json?.data || json)
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

.ops-kpi-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.ops-panel-lead {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--cyp-text-muted);
  line-height: 1.45;
}

.health-modules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.health-mod {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--cyp-border);
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.health-mod:hover {
  border-color: color-mix(in srgb, var(--cyp-brand) 40%, var(--cyp-border));
}

.health-mod.is-active {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cyp-brand) 45%, transparent);
}

.health-mod.tone-ok {
  border-color: color-mix(in srgb, var(--cyp-success) 45%, var(--cyp-border));
}

.health-mod.tone-warn {
  border-color: color-mix(in srgb, var(--cyp-warning) 55%, var(--cyp-border));
}

.health-mod.tone-bad {
  border-color: color-mix(in srgb, var(--cyp-danger) 55%, var(--cyp-border));
}

.health-mod-name {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.health-mod-status {
  font-size: 13px;
  font-weight: 600;
}

.health-detail {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--cyp-border);
  background: var(--cyp-bg-input);
}

.health-detail-lead {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cyp-text-secondary);
}

.health-detail-h {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.health-detail-groups {
  display: grid;
  gap: 14px;
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
  border: 1px solid var(--cyp-chrome-border);
  background: var(--cyp-chrome-bg-soft);
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

.monitor-window {
  display: block;
  width: 100%;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--cyp-chrome-border);
  background: var(--cyp-chrome-bg-panel);
  color: var(--cyp-text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  transition: border-color 0.15s, background 0.15s;
}

.monitor-window:hover {
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

.monitor-window.tone-ok {
  border-color: color-mix(in srgb, var(--cyp-success) 45%, var(--cyp-border));
}

.monitor-window.tone-warn {
  border-color: color-mix(in srgb, var(--cyp-warning) 55%, var(--cyp-border));
}

.monitor-window.tone-bad {
  border-color: color-mix(in srgb, var(--cyp-danger) 55%, var(--cyp-border));
}

.monitor-window-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.monitor-window-head strong {
  font-size: 15px;
  color: var(--cyp-brand);
}

.monitor-window-go {
  font-size: 13px;
  color: var(--cyp-brand);
}

.monitor-window-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px 14px;
}

.mw-k {
  display: block;
  font-size: 11px;
  color: var(--cyp-text-muted);
  margin-bottom: 2px;
}

.mw-v {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
