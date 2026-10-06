<!--
  帮助中心 · MCP（独立界面：客户端配置 + 个人令牌）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="help-mcp-view">
      <header class="page-header">
        <div class="header-text">
          <p class="eyebrow">帮助中心</p>
          <h1 class="page-title">MCP</h1>
          <p class="page-desc">
            旁路接入、令牌与策略。单条公开请在备忘录/文件库勾选「允许 MCP 公开」；全局最高层与能力在「策略」。
          </p>
        </div>
        <router-link class="link-knowledge" to="/help/knowledge?article=mcp">知识说明</router-link>
      </header>

      <nav class="mcp-tabs" role="tablist" aria-label="MCP 分区">
        <button
          v-for="tab in MCP_TABS"
          :id="`mcp-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="mcp-tab"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`mcp-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
        >
          <span class="mcp-tab-label">{{ tab.label }}</span>
          <span class="mcp-tab-hint">{{ tab.hint }}</span>
        </button>
      </nav>

      <!-- 接入：端点 + 令牌 + 客户端（同入口路径） -->
      <div
        v-show="activeTab === 'access'"
        id="mcp-panel-access"
        class="mcp-grid"
        role="tabpanel"
        aria-labelledby="mcp-tab-access"
      >
        <section class="panel" aria-labelledby="mcp-conn-title">
          <div class="panel-head">
            <h2 id="mcp-conn-title" class="panel-title">连接信息</h2>
            <p class="panel-hint">协议入口与产品同端口；旁路进程仅环回。一律 HTTPS。</p>
          </div>
          <dl class="endpoint-list">
            <div class="endpoint-row">
              <dt>业务 API 基址</dt>
              <dd>
                <code class="endpoint-code">{{ liveApiBase }}</code>
                <Button type="secondary" @click="copyText(liveApiBase)">复制</Button>
              </dd>
            </div>
            <div class="endpoint-row">
              <dt>MCP HTTPS（环回）</dt>
              <dd>
                <code class="endpoint-code">{{ liveMcpLoopback }}</code>
                <Button type="secondary" @click="copyText(liveMcpLoopback)">复制</Button>
              </dd>
            </div>
            <div class="endpoint-row">
              <dt>MCP HTTPS（当前主机）</dt>
              <dd>
                <code class="endpoint-code">{{ liveMcpHost }}</code>
                <Button type="secondary" @click="copyText(liveMcpHost)">复制</Button>
              </dd>
            </div>
            <div class="endpoint-row">
              <dt>发现面</dt>
              <dd>
                <code class="endpoint-code">{{ liveMcpDiscover }}</code>
                <Button type="secondary" @click="copyText(liveMcpDiscover)">复制</Button>
              </dd>
            </div>
          </dl>
          <details class="tip-fold">
            <summary>启动与协议提示</summary>
            <ul class="bullet-list">
              <li>一键启动：pnpm local:all（或 start-local）已同启业务 API 与 MCP 旁路</li>
              <li>仅业务：pnpm local:server</li>
              <li>stdio（Cursor 子进程）：pnpm mcp:stdio</li>
              <li>单独旁路（排障）：pnpm mcp:local（只绑环回）</li>
              <li>局域网走产品入口 /mcp，不直连旁路端口</li>
              <li>HTTP 访问产品 /mcp 与 /mcp/discover 须带头 MCP-Protocol-Version</li>
            </ul>
          </details>
        </section>

        <section class="panel" aria-labelledby="mcp-pat-title">
          <div class="panel-head">
            <h2 id="mcp-pat-title" class="panel-title">个人令牌</h2>
            <p class="panel-hint">
              明文只显示一次；有效期 30 天。到期前可「轮换」。禁止把 MCP 个人令牌直接带给备忘录业务接口。
            </p>
          </div>
          <div class="pat-issue">
            <label class="field-label" for="mcp-pat-label">令牌标签</label>
            <div class="pat-issue-row">
              <input
                id="mcp-pat-label"
                v-model="mcpPatLabel"
                class="form-input"
                maxlength="64"
                placeholder="例如本机旁路"
              />
              <Button type="primary" :disabled="mcpPatBusy" @click="issueMcpPat">签发</Button>
            </div>
          </div>
          <div v-if="mcpPatOnce" class="pat-once">
            <label class="field-label">新令牌（请立即保存）</label>
            <div class="pat-once-row">
              <code class="token-plain">{{ mcpPatOnce }}</code>
              <Button type="secondary" @click="copyText(mcpPatOnce)">复制</Button>
            </div>
          </div>
          <div class="pat-list-wrap">
            <h3 class="sub-title">已签发</h3>
            <ul v-if="mcpPats.length" class="pat-list">
              <li v-for="p in mcpPats" :key="p.id" class="pat-item">
                <div class="pat-meta">
                  <span class="pat-label">{{ p.label }}</span>
                  <span class="pat-prefix">{{ p.tokenPrefix }}</span>
                  <span class="pat-exp">到期 {{ p.expiresAt.slice(0, 10) }}</span>
                </div>
                <div v-if="!p.revokedAt" class="pat-actions">
                  <Button type="secondary" :disabled="mcpPatBusy" @click="rotateMcpPat(p.id)">
                    轮换
                  </Button>
                  <Button type="danger" :disabled="mcpPatBusy" @click="revokeMcpPat(p.id)">
                    吊销
                  </Button>
                </div>
                <span v-else class="pat-revoked">已吊销</span>
              </li>
            </ul>
            <p v-else class="empty-hint">尚无令牌</p>
          </div>
        </section>

        <section class="panel panel-wide" aria-labelledby="mcp-client-title">
          <div class="panel-head">
            <h2 id="mcp-client-title" class="panel-title">客户端配置（Cursor stdio）</h2>
            <p class="panel-hint">
              写入 Cursor 的 MCP 配置。请把 cwd 改成你的 CYP-memo 仓库根。公开查询可不设
              CYP_MCP_PAT；全功能粘贴上方签发的令牌。
            </p>
          </div>
          <div class="code-block">
            <div class="code-toolbar">
              <span class="code-label">mcpServers · stdio</span>
              <Button type="secondary" @click="copyText(stdioSample)">复制全部</Button>
            </div>
            <pre class="code-pre"><code>{{ stdioSample }}</code></pre>
          </div>
          <details class="tip-fold">
            <summary>协议与写能力提示</summary>
            <ul class="bullet-list">
              <li>发现面协议基线可用 2026-07-28；官方 SDK 会话常用 2025-11-25</li>
              <li>写能力优先在「策略」打开；亦可用环境变量兜底</li>
              <li>远程 OAuth：客户端打开授权端点后进入同意页批准/拒绝（PKCE）</li>
              <li>禁止独立旧 HTTP+SSE；SSE 仅在 Streamable HTTP 内</li>
            </ul>
          </details>
        </section>
      </div>

      <!-- 策略：公开投影 + 能力开关并排 -->
      <div
        v-show="activeTab === 'policy'"
        id="mcp-panel-policy"
        class="mcp-grid mcp-grid-policy"
        role="tabpanel"
        aria-labelledby="mcp-tab-policy"
      >
        <section class="panel" aria-labelledby="mcp-public-title">
          <div class="panel-head">
            <h2 id="mcp-public-title" class="panel-title">公开投影</h2>
            <p class="panel-hint">
              最高可读层与选择器。默认 summary + flag。选 tag / ids 时填白名单；可用「仍须勾选公开」控制是否同时要求勾选。
            </p>
          </div>
          <div class="public-form public-form-stack">
            <div class="public-field">
              <label class="field-label" for="mcp-max-layer">公开最高层</label>
              <select id="mcp-max-layer" v-model="publicCfg.maxLayer" class="form-select">
                <option value="title">title（仅标题）</option>
                <option value="summary">summary（摘要，默认）</option>
                <option value="full">full（全文，须显式）</option>
              </select>
            </div>
            <div class="public-field">
              <label class="field-label" for="mcp-memo-sel">备忘录选择器</label>
              <select id="mcp-memo-sel" v-model="publicCfg.memoSelectorMode" class="form-select">
                <option value="flag">flag（勾选）</option>
                <option value="tag">tag（标签）</option>
                <option value="ids">ids（指定 ID）</option>
                <option value="none">none（关闭公开）</option>
              </select>
            </div>
            <div class="public-field">
              <label class="field-label" for="mcp-file-sel">文件选择器</label>
              <select id="mcp-file-sel" v-model="publicCfg.fileSelectorMode" class="form-select">
                <option value="flag">flag（勾选）</option>
                <option value="tag">tag（文件名含标签）</option>
                <option value="ids">ids（指定 ID）</option>
                <option value="none">none（关闭公开）</option>
              </select>
            </div>
            <div class="public-field public-field-wide">
              <label class="cap-item" for="mcp-require-flag">
                <input id="mcp-require-flag" v-model="publicCfg.requireFlag" type="checkbox" />
                <span>仍须勾选公开（requireFlag；tag/ids 默认开）</span>
              </label>
            </div>
            <div
              v-if="publicCfg.memoSelectorMode === 'tag'"
              class="public-field public-field-wide"
            >
              <label class="field-label" for="mcp-memo-tags">备忘录公开标签（逗号分隔）</label>
              <input
                id="mcp-memo-tags"
                v-model="memoTagsText"
                class="form-input"
                placeholder="例如 public,mcp"
              />
            </div>
            <div
              v-if="publicCfg.memoSelectorMode === 'ids'"
              class="public-field public-field-wide"
            >
              <label class="field-label" for="mcp-memo-ids">备忘录公开 ID（逗号分隔）</label>
              <input
                id="mcp-memo-ids"
                v-model="memoIdsText"
                class="form-input"
                placeholder="备忘录 UUID"
              />
            </div>
            <div
              v-if="publicCfg.fileSelectorMode === 'tag'"
              class="public-field public-field-wide"
            >
              <label class="field-label" for="mcp-file-tags">文件名须含（逗号分隔）</label>
              <input
                id="mcp-file-tags"
                v-model="fileTagsText"
                class="form-input"
                placeholder="例如 public,readme"
              />
            </div>
            <div
              v-if="publicCfg.fileSelectorMode === 'ids'"
              class="public-field public-field-wide"
            >
              <label class="field-label" for="mcp-file-ids">文件公开 ID（逗号分隔）</label>
              <input
                id="mcp-file-ids"
                v-model="fileIdsText"
                class="form-input"
                placeholder="文件 UUID"
              />
            </div>
            <div class="public-actions">
              <Button type="primary" :disabled="publicCfgBusy" @click="savePublicConfig">保存配置</Button>
              <span v-if="publicCfg.updatedAt" class="public-updated">
                上次更新 {{ publicCfg.updatedAt.slice(0, 19).replace('T', ' ') }}
              </span>
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="mcp-cap-title">
          <div class="panel-head">
            <h2 id="mcp-cap-title" class="panel-title">能力开关</h2>
            <p class="panel-hint">
              写能力默认关闭。落服务器 dataDir；旁路热叠读，写能力变化时通知 list_changed。关分段/诚实报告仅建议本机调试。
            </p>
          </div>
          <div class="cap-grid cap-grid-policy">
            <label class="cap-item">
              <input v-model="capCfg.enabled" type="checkbox" />
              <span>总开关 enabled</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.query" type="checkbox" />
              <span>查询 query</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.memoWrite" type="checkbox" />
              <span>备忘录写 memo_write</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.fileWrite" type="checkbox" />
              <span>文件写 file_write</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.publicEnabled" type="checkbox" />
              <span>公开查询轨 public.enabled</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.requireSegmentedRead" type="checkbox" />
              <span>强制分段阅读</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.requireHonestyReport" type="checkbox" />
              <span>强制诚实报告</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.connectorAllow" type="checkbox" />
              <span>允许连接器 connector.allow</span>
            </label>
            <label class="cap-item">
              <input v-model="capCfg.connectorRequireName" type="checkbox" />
              <span>连接器须自报名称</span>
            </label>
          </div>
          <div class="public-actions">
            <Button type="primary" :disabled="capCfgBusy" @click="saveCapConfig">保存能力开关</Button>
            <span v-if="capCfg.updatedAt" class="public-updated">
              上次更新 {{ capCfg.updatedAt.slice(0, 19).replace('T', ' ') }}
            </span>
          </div>
        </section>
      </div>

      <!-- 审核 -->
      <div
        v-show="activeTab === 'audit'"
        id="mcp-panel-audit"
        class="mcp-grid"
        role="tabpanel"
        aria-labelledby="mcp-tab-audit"
      >
        <section class="panel panel-wide" aria-labelledby="mcp-audit-title">
          <div class="panel-head panel-head-row">
            <div>
              <h2 id="mcp-audit-title" class="panel-title">审核流水</h2>
              <p class="panel-hint">
                旁路回传的 MCP 调用审核（观测库 action=mcp.audit）。异常会生成 source=mcp
                告警。有运维权限时可在「运行日志」筛选「MCP 审核」。
              </p>
            </div>
            <router-link class="audit-logs-link" to="/tenant/logs">打开运行日志</router-link>
          </div>
          <div class="audit-toolbar">
            <select v-model="auditTier" class="form-select audit-select" aria-label="轨筛选">
              <option value="">全部轨</option>
              <option value="public_query">公开查询</option>
              <option value="private_query">私有查询</option>
              <option value="write">写操作</option>
            </select>
            <select v-model="auditLevel" class="form-select audit-select" aria-label="级别筛选">
              <option value="">全部级别</option>
              <option value="error">error</option>
              <option value="warn">warn</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
            <input
              v-model="auditResult"
              class="form-input audit-input"
              placeholder="resultCode 如 ok"
              aria-label="结果码筛选"
            />
            <Button type="secondary" :disabled="auditBusy" @click="loadMcpAudit">刷新</Button>
          </div>
          <div v-if="auditAlerts.length" class="audit-alerts" role="status">
            <p class="audit-alerts-title">进行中 MCP 告警 {{ auditAlerts.length }}</p>
            <ul class="audit-alert-list">
              <li v-for="a in auditAlerts" :key="a.id">
                <span class="audit-sev">{{ a.severity }}</span>
                {{ a.title }}
                <span class="audit-alert-meta">{{ a.createdAt.slice(0, 19).replace('T', ' ') }}</span>
              </li>
            </ul>
          </div>
          <div class="audit-table-wrap">
            <table class="audit-table" v-if="auditItems.length">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">级别</th>
                  <th scope="col">轨</th>
                  <th scope="col">工具</th>
                  <th scope="col">结果</th>
                  <th scope="col">主体</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in auditItems" :key="row.id">
                  <td>{{ row.at.slice(0, 19).replace('T', ' ') }}</td>
                  <td>{{ row.level }}</td>
                  <td>{{ row.tier || '—' }}</td>
                  <td>{{ row.tool || '—' }}</td>
                  <td>{{ row.resultCode || '—' }}</td>
                  <td>{{ row.subject || '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty-hint">{{ auditBusy ? '加载中…' : '暂无审核记录' }}</p>
          </div>
        </section>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resolveApiBaseUrl, storageManager } from '@cyp-memo/shared'
import AppLayout from '../../components/AppLayout.vue'
import Button from '../../components/Button.vue'
import { useToast } from '../../composables/useToast'
import { MCP_CLIENT_STDIO_SAMPLE } from '../../content/helpKnowledge'

const toast = useToast()
const route = useRoute()
const router = useRouter()

type McpTabId = 'access' | 'policy' | 'audit'

const MCP_TABS: { id: McpTabId; label: string; hint: string }[] = [
  { id: 'access', label: '接入', hint: '端点 · 令牌 · 客户端' },
  { id: 'policy', label: '策略', hint: '公开投影 · 能力开关' },
  { id: 'audit', label: '审核', hint: '调用流水 · 告警' },
]

const activeTab = ref<McpTabId>('access')

function isMcpTab(raw: unknown): raw is McpTabId {
  return raw === 'access' || raw === 'policy' || raw === 'audit'
}

function selectTab(id: McpTabId) {
  activeTab.value = id
  const nextQuery = { ...route.query, tab: id }
  router.replace({ query: nextQuery })
  if (id === 'audit') void loadMcpAudit()
}

watch(
  () => route.query.tab,
  (raw) => {
    if (isMcpTab(raw)) activeTab.value = raw
  },
  { immediate: true }
)

const mcpPatLabel = ref('本机')
const mcpPatOnce = ref('')
const mcpPatBusy = ref(false)
const mcpPats = ref<
  { id: string; label: string; tokenPrefix: string; expiresAt: string; revokedAt: string | null }[]
>([])

type PublicMaxLayer = 'title' | 'summary' | 'full'
type SelectorMode = 'flag' | 'tag' | 'ids' | 'none'

const publicCfgBusy = ref(false)
const publicCfg = ref<{
  maxLayer: PublicMaxLayer
  memoSelectorMode: SelectorMode
  fileSelectorMode: SelectorMode
  memoSelectorTags: string[]
  memoSelectorIds: string[]
  fileSelectorTags: string[]
  fileSelectorIds: string[]
  requireFlag: boolean
  updatedAt: string
}>({
  maxLayer: 'summary',
  memoSelectorMode: 'flag',
  fileSelectorMode: 'flag',
  memoSelectorTags: [],
  memoSelectorIds: [],
  fileSelectorTags: [],
  fileSelectorIds: [],
  requireFlag: true,
  updatedAt: '',
})

const memoTagsText = ref('')
const memoIdsText = ref('')
const fileTagsText = ref('')
const fileIdsText = ref('')

const capCfgBusy = ref(false)
const capCfg = ref({
  enabled: true,
  query: true,
  memoWrite: false,
  fileWrite: false,
  requireSegmentedRead: true,
  requireHonestyReport: true,
  publicEnabled: true,
  connectorAllow: true,
  connectorRequireName: true,
  updatedAt: '',
})

const auditBusy = ref(false)
const auditTier = ref('')
const auditLevel = ref('')
const auditResult = ref('')
const auditItems = ref<
  {
    id: string
    at: string
    level: string
    tier: string
    tool: string
    resultCode: string
    subject: string
  }[]
>([])
const auditAlerts = ref<
  { id: string; severity: string; title: string; createdAt: string }[]
>([])

function parseListText(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ]
}

function listsToText(list: string[]): string {
  return Array.isArray(list) ? list.join(', ') : ''
}

const stdioSample = MCP_CLIENT_STDIO_SAMPLE

const liveApiBase = computed(() => {
  const resolved = resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
  if (resolved.startsWith('http')) return resolved
  if (typeof window === 'undefined') return 'https://127.0.0.1:5170/api'
  const path = resolved.startsWith('/') ? resolved : `/${resolved}`
  return `${window.location.origin}${path}`
})

const liveMcpLoopback = 'https://127.0.0.1:5170/mcp'

const liveMcpHost = computed(() => {
  if (typeof window === 'undefined') return liveMcpLoopback
  return `${window.location.origin}/mcp`
})

const liveMcpDiscover = computed(() => `${liveMcpHost.value.replace(/\/mcp$/, '')}/mcp/discover`)

function mcpApi(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

function mcpWriteHeaders(token: string): Record<string, string> {
  const rid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': rid,
    'X-Request-Id': rid,
    'X-Trace-Id': rid,
  }
}

async function mcpAuthHeaders(forWrite = false): Promise<Record<string, string> | null> {
  const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
  const token = adapter.getAccessToken?.() || ''
  if (!token) return null
  if (forWrite) return mcpWriteHeaders(token)
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

function mcpFailMessage(json: unknown, fallback: string): string {
  const msg =
    json && typeof json === 'object' && 'error' in json
      ? (json as { error?: { message?: string } }).error?.message
      : undefined
  return typeof msg === 'string' && msg.trim() ? msg.trim() : fallback
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败，请手动选中')
  }
}

async function loadMcpPats() {
  try {
    const headers = await mcpAuthHeaders(false)
    if (!headers) {
      mcpPats.value = []
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/pat`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      mcpPats.value = []
      return
    }
    mcpPats.value = Array.isArray(json?.data) ? json.data : []
  } catch {
    mcpPats.value = []
  }
}

async function issueMcpPat() {
  if (mcpPatBusy.value) return
  mcpPatBusy.value = true
  try {
    const headers = await mcpAuthHeaders(true)
    if (!headers) {
      toast.error('请先登录后再签发 MCP 令牌')
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/pat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: mcpPatLabel.value || 'mcp' }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data?.token) {
      toast.error(mcpFailMessage(json, 'MCP 令牌签发失败'))
      return
    }
    mcpPatOnce.value = json.data.token
    toast.success('已签发，请立即保存明文')
    await loadMcpPats()
  } catch {
    toast.error('MCP 令牌签发失败（网络异常）')
  } finally {
    mcpPatBusy.value = false
  }
}

async function revokeMcpPat(id: string) {
  if (mcpPatBusy.value) return
  mcpPatBusy.value = true
  try {
    const headers = await mcpAuthHeaders(true)
    if (!headers) {
      toast.error('请先登录后再吊销')
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/pat/${id}`, {
      method: 'DELETE',
      headers,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(mcpFailMessage(json, '吊销失败'))
      return
    }
    toast.success('已吊销')
    await loadMcpPats()
  } catch {
    toast.error('吊销失败（网络异常）')
  } finally {
    mcpPatBusy.value = false
  }
}

async function rotateMcpPat(id: string) {
  if (mcpPatBusy.value) return
  mcpPatBusy.value = true
  try {
    const headers = await mcpAuthHeaders(true)
    if (!headers) {
      toast.error('请先登录后再轮换')
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/pat/${id}/rotate`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data?.token) {
      toast.error(mcpFailMessage(json, '轮换失败'))
      return
    }
    mcpPatOnce.value = json.data.token
    toast.success('已轮换，请立即保存新明文（旧令牌已失效）')
    await loadMcpPats()
  } catch {
    toast.error('轮换失败（网络异常）')
  } finally {
    mcpPatBusy.value = false
  }
}

async function loadPublicConfig() {
  try {
    const headers = await mcpAuthHeaders(false)
    if (!headers) return
    const res = await fetch(`${mcpApi()}/mcp/public-config`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data) return
    const d = json.data as {
      maxLayer?: string
      memoSelectorMode?: string
      fileSelectorMode?: string
      memoSelectorTags?: string[]
      memoSelectorIds?: string[]
      fileSelectorTags?: string[]
      fileSelectorIds?: string[]
      requireFlag?: boolean
      updatedAt?: string
    }
    publicCfg.value = {
      maxLayer: (['title', 'summary', 'full'].includes(String(d.maxLayer))
        ? d.maxLayer
        : 'summary') as PublicMaxLayer,
      memoSelectorMode: (['flag', 'tag', 'ids', 'none'].includes(String(d.memoSelectorMode))
        ? d.memoSelectorMode
        : 'flag') as SelectorMode,
      fileSelectorMode: (['flag', 'tag', 'ids', 'none'].includes(String(d.fileSelectorMode))
        ? d.fileSelectorMode
        : 'flag') as SelectorMode,
      memoSelectorTags: Array.isArray(d.memoSelectorTags) ? d.memoSelectorTags.map(String) : [],
      memoSelectorIds: Array.isArray(d.memoSelectorIds) ? d.memoSelectorIds.map(String) : [],
      fileSelectorTags: Array.isArray(d.fileSelectorTags) ? d.fileSelectorTags.map(String) : [],
      fileSelectorIds: Array.isArray(d.fileSelectorIds) ? d.fileSelectorIds.map(String) : [],
      requireFlag: d.requireFlag !== false,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    }
    memoTagsText.value = listsToText(publicCfg.value.memoSelectorTags)
    memoIdsText.value = listsToText(publicCfg.value.memoSelectorIds)
    fileTagsText.value = listsToText(publicCfg.value.fileSelectorTags)
    fileIdsText.value = listsToText(publicCfg.value.fileSelectorIds)
  } catch {
    /* 未登录或接口不可用时保持默认 */
  }
}

async function savePublicConfig() {
  if (publicCfgBusy.value) return
  publicCfgBusy.value = true
  try {
    const headers = await mcpAuthHeaders(true)
    if (!headers) {
      toast.error('请先登录后再保存公开配置')
      return
    }
    const memoTags = parseListText(memoTagsText.value)
    const memoIds = parseListText(memoIdsText.value)
    const fileTags = parseListText(fileTagsText.value)
    const fileIds = parseListText(fileIdsText.value)
    if (publicCfg.value.memoSelectorMode === 'tag' && memoTags.length === 0) {
      toast.error('备忘录 tag 模式请填写至少一个标签')
      return
    }
    if (publicCfg.value.memoSelectorMode === 'ids' && memoIds.length === 0) {
      toast.error('备忘录 ids 模式请填写至少一个 ID')
      return
    }
    if (publicCfg.value.fileSelectorMode === 'tag' && fileTags.length === 0) {
      toast.error('文件 tag 模式请填写至少一个关键字')
      return
    }
    if (publicCfg.value.fileSelectorMode === 'ids' && fileIds.length === 0) {
      toast.error('文件 ids 模式请填写至少一个 ID')
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/public-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        maxLayer: publicCfg.value.maxLayer,
        memoSelectorMode: publicCfg.value.memoSelectorMode,
        fileSelectorMode: publicCfg.value.fileSelectorMode,
        memoSelectorTags: memoTags,
        memoSelectorIds: memoIds,
        fileSelectorTags: fileTags,
        fileSelectorIds: fileIds,
        requireFlag: publicCfg.value.requireFlag,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data) {
      toast.error(mcpFailMessage(json, '公开配置保存失败'))
      return
    }
    const d = json.data as {
      updatedAt?: string
      maxLayer?: string
      memoSelectorTags?: string[]
      memoSelectorIds?: string[]
      fileSelectorTags?: string[]
      fileSelectorIds?: string[]
      requireFlag?: boolean
    }
    if (typeof d.updatedAt === 'string') publicCfg.value.updatedAt = d.updatedAt
    if (typeof d.maxLayer === 'string') {
      publicCfg.value.maxLayer = d.maxLayer as PublicMaxLayer
    }
    if (typeof d.requireFlag === 'boolean') {
      publicCfg.value.requireFlag = d.requireFlag
    }
    publicCfg.value.memoSelectorTags = Array.isArray(d.memoSelectorTags)
      ? d.memoSelectorTags.map(String)
      : memoTags
    publicCfg.value.memoSelectorIds = Array.isArray(d.memoSelectorIds)
      ? d.memoSelectorIds.map(String)
      : memoIds
    publicCfg.value.fileSelectorTags = Array.isArray(d.fileSelectorTags)
      ? d.fileSelectorTags.map(String)
      : fileTags
    publicCfg.value.fileSelectorIds = Array.isArray(d.fileSelectorIds)
      ? d.fileSelectorIds.map(String)
      : fileIds
    memoTagsText.value = listsToText(publicCfg.value.memoSelectorTags)
    memoIdsText.value = listsToText(publicCfg.value.memoSelectorIds)
    fileTagsText.value = listsToText(publicCfg.value.fileSelectorTags)
    fileIdsText.value = listsToText(publicCfg.value.fileSelectorIds)
    toast.success('公开配置已保存（旁路将自动叠读）')
  } catch {
    toast.error('公开配置保存失败（网络异常）')
  } finally {
    publicCfgBusy.value = false
  }
}

async function loadCapConfig() {
  try {
    const headers = await mcpAuthHeaders(false)
    if (!headers) return
    const res = await fetch(`${mcpApi()}/mcp/cap-config`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data) return
    const d = json.data as Record<string, unknown>
    capCfg.value = {
      enabled: d.enabled !== false,
      query: d.query !== false,
      memoWrite: d.memoWrite === true,
      fileWrite: d.fileWrite === true,
      requireSegmentedRead: d.requireSegmentedRead !== false,
      requireHonestyReport: d.requireHonestyReport !== false,
      publicEnabled: d.publicEnabled !== false,
      connectorAllow: d.connectorAllow !== false,
      connectorRequireName: d.connectorRequireName !== false,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    }
  } catch {
    /* 未登录时保持默认 */
  }
}

async function saveCapConfig() {
  if (capCfgBusy.value) return
  capCfgBusy.value = true
  try {
    const headers = await mcpAuthHeaders(true)
    if (!headers) {
      toast.error('请先登录后再保存能力开关')
      return
    }
    const res = await fetch(`${mcpApi()}/mcp/cap-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled: capCfg.value.enabled,
        query: capCfg.value.query,
        memoWrite: capCfg.value.memoWrite,
        fileWrite: capCfg.value.fileWrite,
        requireSegmentedRead: capCfg.value.requireSegmentedRead,
        requireHonestyReport: capCfg.value.requireHonestyReport,
        publicEnabled: capCfg.value.publicEnabled,
        connectorAllow: capCfg.value.connectorAllow,
        connectorRequireName: capCfg.value.connectorRequireName,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data) {
      toast.error(mcpFailMessage(json, '能力开关保存失败'))
      return
    }
    const d = json.data as { updatedAt?: string; memoWrite?: boolean }
    if (typeof d.updatedAt === 'string') capCfg.value.updatedAt = d.updatedAt
    if (typeof d.memoWrite === 'boolean') capCfg.value.memoWrite = d.memoWrite
    toast.success('能力开关已保存（旁路将自动叠读）')
  } catch {
    toast.error('能力开关保存失败（网络异常）')
  } finally {
    capCfgBusy.value = false
  }
}

async function loadMcpAudit() {
  if (auditBusy.value) return
  auditBusy.value = true
  try {
    const headers = await mcpAuthHeaders(false)
    if (!headers) {
      auditItems.value = []
      auditAlerts.value = []
      return
    }
    const q = new URLSearchParams()
    q.set('limit', '80')
    if (auditTier.value) q.set('tier', auditTier.value)
    if (auditLevel.value) q.set('level', auditLevel.value)
    if (auditResult.value.trim()) q.set('resultCode', auditResult.value.trim())
    const res = await fetch(`${mcpApi()}/mcp/audit?${q.toString()}`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.data) {
      auditItems.value = []
      auditAlerts.value = []
      return
    }
    const d = json.data as {
      items?: {
        id?: string
        at?: string
        level?: string
        tier?: string
        tool?: string
        resultCode?: string
        subject?: string
      }[]
      alerts?: { id?: string; severity?: string; title?: string; createdAt?: string }[]
    }
    auditItems.value = (d.items || []).map((r, i) => ({
      id: String(r.id || i),
      at: String(r.at || ''),
      level: String(r.level || ''),
      tier: String(r.tier || ''),
      tool: String(r.tool || ''),
      resultCode: String(r.resultCode || ''),
      subject: String(r.subject || ''),
    }))
    auditAlerts.value = (d.alerts || []).map((a, i) => ({
      id: String(a.id || i),
      severity: String(a.severity || ''),
      title: String(a.title || ''),
      createdAt: String(a.createdAt || ''),
    }))
  } catch {
    auditItems.value = []
    auditAlerts.value = []
  } finally {
    auditBusy.value = false
  }
}

onMounted(() => {
  void loadMcpPats()
  void loadPublicConfig()
  void loadCapConfig()
  void loadMcpAudit()
})
</script>

<style scoped>
.help-mcp-view {
  box-sizing: border-box;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--cyp-text);
}

.help-mcp-view *,
.help-mcp-view *::before,
.help-mcp-view *::after {
  box-sizing: border-box;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 14px 16px;
  background: var(--cyp-chrome-bg);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--cyp-text-secondary);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.page-desc {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cyp-text-muted);
  max-width: 48em;
}

.link-knowledge {
  font-size: 13px;
  color: var(--cyp-brand);
  text-decoration: none;
  white-space: nowrap;
}

.link-knowledge:hover {
  text-decoration: underline;
}

.mcp-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  flex-shrink: 0;
}

.mcp-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  background: var(--cyp-chrome-bg-soft);
  color: var(--cyp-text-secondary);
  cursor: pointer;
  text-align: left;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.mcp-tab:hover {
  border-color: color-mix(in srgb, var(--cyp-brand) 45%, var(--cyp-chrome-border));
  color: var(--cyp-text);
}

.mcp-tab.active {
  border-color: var(--cyp-brand);
  background: var(--cyp-chrome-bg);
  color: var(--cyp-text);
  box-shadow:
    var(--cyp-chrome-shadow),
    inset 0 0 0 1px color-mix(in srgb, var(--cyp-brand) 35%, transparent);
}

.mcp-tab:focus-visible {
  outline: 2px solid var(--cyp-brand);
  outline-offset: 2px;
}

.mcp-tab-label {
  font-size: 14px;
  font-weight: 700;
}

.mcp-tab-hint {
  font-size: 12px;
  color: var(--cyp-text-muted);
  line-height: 1.35;
}

.mcp-tab.active .mcp-tab-hint {
  color: var(--cyp-text-secondary);
}

.mcp-grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  align-items: start;
}

.mcp-grid-policy {
  align-items: stretch;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 14px 16px 16px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 10px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel-head {
  margin-bottom: 12px;
}

.panel-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 16px;
}

.panel-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
}

.panel-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cyp-text-muted);
}

.endpoint-list {
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.endpoint-row {
  display: grid;
  grid-template-columns: minmax(110px, 150px) minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.endpoint-row dt {
  margin: 0;
  padding-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.endpoint-row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.endpoint-code,
.token-plain,
.code-pre code {
  font-family: var(--cyp-font-mono);
  font-size: 12px;
  word-break: break-all;
  color: var(--cyp-text);
}

.endpoint-code {
  flex: 1 1 180px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
}

.tip-fold {
  margin-top: 4px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-chrome-bg-soft);
  overflow: hidden;
}

.tip-fold summary {
  cursor: pointer;
  list-style: none;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
  user-select: none;
}

.tip-fold summary::-webkit-details-marker {
  display: none;
}

.tip-fold summary::before {
  content: '+';
  display: inline-block;
  width: 1em;
  margin-right: 6px;
  color: var(--cyp-brand);
}

.tip-fold[open] summary::before {
  content: '-';
}

.tip-fold .bullet-list {
  margin: 0;
  padding: 0 12px 10px 1.8em;
}

.bullet-list {
  margin: 0;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cyp-text-secondary);
}

.field-label,
.sub-title {
  display: block;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.pat-issue-row,
.pat-once-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.form-input {
  flex: 1 1 160px;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.form-select {
  width: 100%;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-size: 14px;
}

.form-select:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.public-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 16px;
  align-items: end;
}

.public-form-stack {
  grid-template-columns: 1fr;
  align-items: stretch;
  flex: 1 1 auto;
}

.public-field {
  min-width: 0;
}

.public-field-wide {
  grid-column: 1 / -1;
}

.public-field-wide .form-input {
  max-width: 100%;
  width: 100%;
}

.public-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.cap-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
  margin-bottom: 12px;
}

.cap-grid-policy {
  grid-template-columns: 1fr;
  flex: 1 1 auto;
}

.cap-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  user-select: none;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-chrome-bg-soft);
}

.cap-item input {
  margin: 0;
  flex-shrink: 0;
  accent-color: var(--cyp-brand);
}

.public-updated {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.audit-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.audit-select {
  max-width: 160px;
}

.audit-input {
  max-width: 200px;
}

.audit-logs-link {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--cyp-brand);
  text-decoration: none;
  white-space: nowrap;
}

.audit-logs-link:hover {
  text-decoration: underline;
}

.audit-alerts {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-chrome-bg-soft);
}

.audit-alerts-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cyp-text);
}

.audit-alert-list {
  margin: 0;
  padding-left: 1.1em;
  font-size: 13px;
  color: var(--cyp-text-secondary);
}

.audit-sev {
  display: inline-block;
  min-width: 2.5em;
  margin-right: 6px;
  font-weight: 600;
  color: var(--cyp-warning);
}

.audit-alert-meta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.audit-table-wrap {
  overflow-x: auto;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.audit-table th,
.audit-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--cyp-border);
  color: var(--cyp-text-secondary);
}

.audit-table th {
  font-weight: 600;
  color: var(--cyp-text);
  background: var(--cyp-chrome-bg-soft);
}

.pat-once {
  margin-top: 12px;
}

.token-plain {
  flex: 1 1 200px;
  display: block;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
}

.pat-list-wrap {
  margin-top: 14px;
}

.pat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pat-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-chrome-bg-soft);
}

.pat-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 13px;
  min-width: 0;
}

.pat-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pat-label {
  font-weight: 600;
}

.pat-prefix,
.pat-exp,
.pat-revoked,
.empty-hint {
  color: var(--cyp-text-muted);
  font-size: 12px;
}

.code-block {
  margin-bottom: 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--cyp-bg-input);
}

.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--cyp-border);
  background: var(--cyp-chrome-bg-soft);
}

.code-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.code-pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  max-height: 320px;
  white-space: pre;
  line-height: 1.45;
}

@media (max-width: 900px) {
  .help-mcp-view {
    max-width: 100%;
  }

  .mcp-tabs {
    grid-template-columns: 1fr;
  }

  .mcp-grid {
    grid-template-columns: 1fr;
  }

  .endpoint-row {
    grid-template-columns: 1fr;
  }

  .public-form {
    grid-template-columns: 1fr;
  }

  .cap-grid {
    grid-template-columns: 1fr;
  }
}
</style>
