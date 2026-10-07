/**
 * CYP-memo 后端 API 服务器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import https from 'node:https'
import http from 'node:http'
import os from 'node:os'
import { fileURLToPath } from 'url'
import { getDiskSpace, MIN_DISK_SPACE_BYTES, getConfig, getMachineCapacity, type ContainerConfig } from './runtime-base/l0/infra/cfg/ready.js'
import { database, getFileStorageState, getUploadRoot } from './runtime-base/l0/infra/db/ready.js'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { applyHotConfig, getConfigRevisionView, isConfigRevisionReady, rollbackConfig } from './runtime-base/l1/mgmt/conf/ready.js'
import { logger } from './runtime-base/l0/infra/log/ready.js'
import { runBootstrap, buildReadyResponse, getBootstrapState } from './bootstrap.js'
import { ensureApiTlsMaterial } from './tls/material.js'
import {
  authenticate,
  sanitizeUser,
  assertSameTenant,
  forbidCrossTenant,
  guardTenantUser,
  guardMemoAccess,
  guardFileAccess,
  guardShareAccess,
} from './runtime-base/l1/mgmt/iam/ready.js'
import {
  requirePermission,
  requireAnyPermission,
  listTenantUserIds,
  listTenantMemos,
  canReadTenantPeer,
} from './runtime-base/l1/mgmt/rbac/ready.js'
import { OWNER_DEFAULT_PERMISSIONS, normalizeMemberPermissions } from './types.js'
import {
  attachRequestIds,
  fail,
  Err,
  inferCodeFromMessage,
  globalErrorHandler,
} from './runtime-base/l1/mgmt/code/ready.js'
import { contentSecurityPolicy } from './runtime-base/l1/mgmt/fesec/ready.js'
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  getGovernanceState,
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
  listPermanentBans,
  getLoginChallengeDelayMs,
  isLoginChallengeRequired,
  consumeApiBudget,
  issueLoginChallenge,
  verifyLoginChallenge,
} from './runtime-base/l1/mgmt/iam/ready.js'
import {
  securityTelemetryMiddleware,
  deviceHintFromRequest,
  recordExportTelemetry,
} from './runtime-base/l1/host/telem/ready.js'
import {
  listRecentRiskDispositions,
  isRiskDispositionReady,
} from './runtime-base/l1/mgmt/risk/ready.js'
import { getRiskThresholds } from './runtime-base/l1/host/rule/ready.js'
import { idempotencyMiddleware } from './runtime-base/l1/mgmt/fesec/ready.js'
import { recordPerfSample, getPerfState, capturePerfBaseline, setPerfSla, resetPerfSlaToHighStandard, getDefaultPerfSla } from './runtime-base/l1/mgmt/perf/ready.js'
import {
  listUserNotifications,
  markUserNotificationRead,
  markAllUserNotificationsRead,
  waitUserNotifications,
  getNotifyState,
} from './notify-service.js'
import { getLogTypeHeartbeats, LOG_TYPES } from './runtime-base/l0/infra/log/ready.js'
import {
  listObservabilityLogs,
  listObservabilityLogsByTrace,
  listObservabilityLogsByLevel,
  isObservabilityStoreReady,
  getObservabilityDbPath,
} from './runtime-base/l0/infra/log/obs-store.js'
import {
  getScheduleState,
  listJobs,
  trigger,
  listTicketAudit,
} from './runtime-base/l1/host/sched/ready.js'
import {
  gatewayIngressMiddleware,
  gatewayAccessLogMiddleware,
  getGatewayState,
  routeInternalService,
  isServiceCollabReady,
  bootstrapBusinessRouteCatalog,
  assertBusinessRouteAllowed,
  isBusinessRouteRegistryReady,
  getBusinessRouteCount,
  createMemoViaBase,
  updateMemoViaBase,
  deleteMemoViaBase,
  createMemoHistoryViaBase,
  deleteMemoHistoryViaBase,
  createUserViaBase,
  updateUserViaBase,
  deleteUserViaBase,
  createShareViaBase,
  updateShareViaBase,
  deleteShareViaBase,
  createShareCommentViaBase,
  replyShareCommentViaBase,
  createFileViaBase,
  updateFileViaBase,
  deleteFileViaBase,
  deleteFileWithBlobViaBase,
  syncFileMemoLinkViaBase,
  syncFileMemoLinksViaBase,
  setSettingViaBase,
  egressFetch,
} from './runtime-base/l1/host/biz/ready.js'
import { getRegistryState, listHealthyInstances, discoverEmbeddedMesh } from './runtime-base/l1/col/svc/ready.js'
import { mcpGatewayProxyMiddleware } from './runtime-base/l1/host/biz/mcp-proxy.js'
import { registerMcpRoutes } from './mcp-routes.js'
import { getMetadataState, listMetadata, renderErrorCode } from './runtime-base/l1/mgmt/code/ready.js'
import { getAlertState, listAlertTickets } from './runtime-base/l1/host/alert/ready.js'
import { gradeAndEmitAlertCandidate } from './runtime-base/l1/host/alert/ready.js'
import { getAutomationIntelligenceState } from './runtime-base/automation-matrix.js'
import { publishDomainEvent, publishEntityChange, runEventCollabProbe, isEventCollabReady } from './runtime-base/l1/col/evt/ready.js'
import { setCanaryWeight, rollback as rollbackRelease } from './runtime-base/l1/host/rel/ready.js'
import {
  getElasticityState,
  revertElasticity,
  promoteElasticityBaseline,
  forceOpen,
  forceClose,
  resetCircuit,
  listCircuitSnapshotDetail,
} from './runtime-base/l1/host/resil/ready.js'
import { getKmsState } from './_kms-internal/client.js'
import { zeroTrustGuard, getZeroTrustStatus, runPublicAccessProbe, isPublicAccessSecurityReady } from './runtime-base/l1/pub/acc/ready.js'
import { getAuditState, listRecentAudits, recordAuditSafe } from './runtime-base/l1/host/audit/ready.js'
import { getTracingState, getTraceTree, recordSpan, clearLogsViaBase, deleteOldLogsViaBase, cleanupLogFilesViaBase } from './runtime-base/l1/host/tracean/ready.js'
import { getReleaseState } from './runtime-base/l1/host/rel/ready.js'
import { getMigrationState } from './runtime-base/l0/infra/db/ready.js'
import {
  getDataPipelineState,
  replayDataPipelineSyncLog,
  listRegisteredSources,
  cleanDeletedMemosViaBase,
  cleanOrphanedFilesViaBase,
  cleanExpiredSharesViaBase,
  performCleanupViaBase,
} from './runtime-base/l1/host/acct/ready.js'
import {
  runContractGovernanceProbe,
  isContractGovernanceReady,
} from './runtime-base/l1/col/ctr/ready.js'
import {
  isTenantCollabReady,
  runTenantCollabProbe,
} from './runtime-base/l1/col/ten/ready.js'
import {
  isDataCollabReady,
  runDataCollabProbe,
  findLineageUpstream,
  getRecentLineage,
  recordLineageEdge,
} from './runtime-base/l1/col/data/ready.js'
import {
  runOpenCollabProbe,
  isOpenCollabReady,
  getOpenApiCatalog,
  listOpenApps,
} from './runtime-base/l1/pub/open/ready.js'
import { log as log } from './runtime-base/l0/infra/log/ready.js'

// 获取当前文件的目录路径（兼容 ESM 和各种平台）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 健康状态类型
 * Requirements: 4.1, 4.4, 4.5
 */
type HealthStatus = 'ok' | 'degraded' | 'unhealthy'

const app = express()

/**
 * 网关层 Express 实例（产品统一入口端口 PORT）
 * 职责：静态资源服务 + /api 反向代理 + /mcp 反向代理 + 健康检查
 */
const gatewayApp = express()

/**
 * 配置在 bootstrap Phase0 完成前不可用；非法配置不得 listen（CFG-SYS-03）
 */
let config!: ContainerConfig
let PORT = 5170
let API_PORT = 10170

/** 上传目录：仅来自 bootstrap 登记的 dataDir/uploads（R-010） */
let uploadDir = ''

// 配置 multer 文件上传（destination 延迟读取 uploadDir；禁 cwd 回退）
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!uploadDir) {
      cb(new Error('上传目录未就绪：须经 bootstrap 登记 dataDir/uploads'), '')
      return
    }
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})

const upload = multer({ storage })

// 中间件：CORS 收紧为本机产品壳（5173）+ 同源 API（5170）；可用 CYP_CORS_ORIGINS 追加
// R-TLS-001：HTTP 与 HTTPS 双协议均需登记；动态追加本机网卡 IP 对应 origin（局域网访问）
function buildCorsOrigins(): string[] {
  const port = Number(process.env.PORT || 5170)
  const origins = [
    // 开发热重载（Vite :5173）
    `http://127.0.0.1:5173`,
    `http://localhost:5173`,
    // 产品入口 HTTP + HTTPS（环回）
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `https://127.0.0.1:${port}`,
    `https://localhost:${port}`,
  ]
  // 动态追加本机非环回 IPv4（局域网访问，HTTP + HTTPS）
  try {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      const addrs = ifaces[name] || []
      for (const a of addrs) {
        if (a.family !== 'IPv4' && String(a.family) !== '4') continue
        if (a.internal) continue
        origins.push(`http://${a.address}:${port}`)
        origins.push(`https://${a.address}:${port}`)
      }
    }
  } catch {
    /* 获取失败则跳过，不阻断启动 */
  }
  // 环境变量追加
  const extra = (process.env.CYP_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  origins.push(...extra)
  return origins
}
const allowedOrigins = new Set(buildCorsOrigins())
app.use(
  cors({
    origin(origin, callback) {
      // 同机 curl / 服务端无 Origin
      if (!origin) return callback(null, true)
      if (allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error(`CORS blocked: ${origin}`))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '50mb' }))
app.use(attachRequestIds)
app.use(contentSecurityPolicy)
app.use(idempotencyMiddleware())
// 底座强制：写 API 必须已登记托管业务服务 + 依赖管控/门禁（中文全称）
app.use((req, res, next) => {
  const verdict = assertBusinessRouteAllowed(req.method, req.path)
  if (!verdict.ok) {
    return fail(res, 503, Err.INTERNAL, `底座拒绝：${verdict.reason}`, req)
  }
  if (verdict.route) {
    // HTTP 头仅允许 Latin-1；中文全称用百分号编码传输，解码后仍是中文名，不是字母代号
    res.setHeader('X-CYP-Hosted-Service', encodeURIComponent(verdict.route.hostedService))
    res.setHeader(
      'X-CYP-Base-Platforms',
      verdict.route.platforms.map((p) => encodeURIComponent(p)).join(',')
    )
  }
  next()
})
app.use(zeroTrustGuard)
// 网关服务：统一入口策略（探活/就绪路径放行；不落访问日志到自有文件）
app.use((req, res, next) => {
  if (req.path === '/healthz/ready' || req.path === '/health/live' || req.path === '/api/health' || req.path === '/api/config') {
    return next()
  }
  return gatewayIngressMiddleware()(req, res, next)
})
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return gatewayAccessLogMiddleware()(req, res, next)
  return next()
})
app.use(securityTelemetryMiddleware())
// 链路追踪 + 性能运行管控 性能抽样：仅 Header/耗时/状态，不存 Payload
app.use((req, res, next) => {
  const started = Date.now()
  const startAt = new Date().toISOString()
  res.on('finish', () => {
    try {
      const durationMs = Date.now() - started
      recordPerfSample({
        route: `${req.method} ${req.path}`,
        durationMs,
        statusCode: res.statusCode,
      })
      if (!req.traceId) return
      recordSpan({
        traceId: req.traceId,
        spanId: (req.requestId || req.traceId).slice(0, 16),
        name: `${req.method} ${req.path}`,
        service: 'cyp-memo-server',
        durationMs,
        statusCode: res.statusCode,
        startAt,
      })
    } catch {
      /* ignore */
    }
  })
  next()
})

// ========== API 反向代理（网关层 → API 服务层）==========
/**
 * 将 /api/* 请求反向代理到后端 API 服务（127.0.0.1:API_PORT）
 * 保留所有请求头、trace_id、认证 token
 * 参考 mcp-proxy.ts 的实现模式
 */
function proxyApiToBackend(req: Request, res: Response): void {
  const targetHost = '127.0.0.1'
  const targetPort = API_PORT
  const originalUrl = req.originalUrl || req.url || req.path

  // 保留所有请求头，更新 host
  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  headers.host = `${targetHost}:${targetPort}`
  delete headers.connection

  const proxyReq = http.request(
    {
      hostname: targetHost,
      port: targetPort,
      path: originalUrl,
      method: req.method,
      headers,
      timeout: 120000, // 2 分钟超时
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502
      // 转发响应头，跳过 connection 等 hop-by-hop 头
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v == null) continue
        const lk = k.toLowerCase()
        if (lk === 'connection' || lk === 'transfer-encoding') continue
        res.setHeader(k, v)
      }
      res.setHeader('X-CYP-API-Ingress', 'gateway-proxy')
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (err) => {
    if (res.headersSent) return
    logger.warn('api.gateway.proxy_error', {
      error: err instanceof Error ? err.message : String(err),
      path: originalUrl,
      method: req.method,
    })
    res.status(502).json({
      success: false,
      code: 'E502',
      message: '后端 API 服务暂不可用',
      data: { reason: 'API_BACKEND_DOWN', path: originalUrl },
      timestamp: new Date().toISOString(),
      request_id: (req as { requestId?: string }).requestId,
    })
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    if (res.headersSent) return
    res.status(504).json({
      success: false,
      code: 'E504',
      message: '后端 API 服务超时',
      data: { reason: 'API_BACKEND_TIMEOUT', path: originalUrl },
      timestamp: new Date().toISOString(),
      request_id: (req as { requestId?: string }).requestId,
    })
  })

  req.pipe(proxyReq)
}

/**
 * MCP 协议入站反代（网关层 → MCP 旁路服务）
 * 复用 runtime-base 中的 mcp-proxy 逻辑
 */
function proxyMcpToSidecar(req: Request, res: Response): void {
  const mcpPort = Number(process.env.CYP_MCP_HTTP_PORT || 13175)
  const targetHost = '127.0.0.1'
  const front = String(req.path || '').split('?')[0]
  const originalUrl = req.originalUrl || req.url || front

  // 路径重写：/mcp → /mcp, /mcp/discover → /discover, /mcp/healthz → /healthz
  let destPath = originalUrl
  const q = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : ''
  if (front === '/mcp/discover') {
    destPath = `/discover${q}`
  } else if (front === '/mcp/healthz') {
    destPath = `/healthz${q}`
  } else if (front === '/mcp' || front.startsWith('/mcp/')) {
    destPath = originalUrl // 保持 /mcp 前缀（MCP sidecar 期望 /mcp）
  }

  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  headers.host = `${targetHost}:${mcpPort}`
  delete headers.connection

  const proxyReq = https.request(
    {
      hostname: targetHost,
      port: mcpPort,
      path: destPath,
      method: req.method,
      headers,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v == null) continue
        const lk = k.toLowerCase()
        if (lk === 'connection') continue
        res.setHeader(k, v)
      }
      res.setHeader('X-CYP-Mcp-Ingress', 'gateway-proxy')
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', () => {
    if (res.headersSent) return
    res.status(502).json({
      error: {
        code: -32053,
        message: 'MCP sidecar unavailable',
        data: { reason: 'MCP_SIDECAR_DOWN' },
      },
    })
  })

  req.pipe(proxyReq)
}

function isMcpProtocolIngress(
  method: string,
  path: string,
  headers: Request['headers']
): boolean {
  const p = String(path || '').split('?')[0]
  const m = String(method || 'GET').toUpperCase()
  if (p === '/mcp/discover' || p === '/mcp/healthz') return true
  if (p !== '/mcp') return false
  if (m === 'POST' || m === 'DELETE' || m === 'PUT') return true
  if (m === 'GET') {
    const proto = String(headers['mcp-protocol-version'] || '').trim()
    const accept = String(headers.accept || '').toLowerCase()
    return Boolean(proto) || accept.includes('text/event-stream')
  }
  return false
}

// ========== 网关层安全中间件 ==========
// CSP 头：应用于网关层所有响应（含静态资源、API 代理响应、MCP 代理响应）
gatewayApp.use(contentSecurityPolicy)
// 请求 ID：网关层生成 request_id，便于跨层追踪
gatewayApp.use(attachRequestIds)

// ========== 静态文件服务（网关层 · 生产唯一基准 · 唯一产品壳 = app）==========
{
  const appDistPath = path.join(__dirname, '../../app/dist')
  const appDistExists = fs.existsSync(appDistPath)

  // VIEW-05：废止独立 /admin 静态第二产品；旧书签进统一壳
  gatewayApp.use('/admin', (_req, res) => {
    res.redirect(302, '/tenant')
  })

  if (appDistExists) {
    gatewayApp.use((req, res, next) => {
      const p = req.path === '/' || req.path === '/index.html'
      if (p) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      }
      next()
    })
    gatewayApp.use(express.static(appDistPath, { etag: true, lastModified: true }))
    logger.info('静态文件服务已启用（网关层 · 唯一壳 app）', {
      appPath: appDistPath,
      appExists: appDistExists,
      appEnv: 'prod',
    })
  } else {
    logger.warn('静态文件目录不存在，跳过静态文件服务（可用 Vite 联调工具，配置仍为 prod）', {
      appPath: appDistPath,
    })
  }
}

/** R2：/api 默认鉴权（白名单见身份访问管控） */
app.use('/api', authenticate)

/**
 * B18 就绪探针：全部阶段通过 → 200；否则 503
 * 含 trace_id / 阶段耗时
 */
app.get('/healthz/ready', (_req, res) => {
  const { statusCode, body } = buildReadyResponse()
  res.status(statusCode).json(body)
})

/**
 * 存活探针：仅确认进程存活，不检查数据库/就绪态/任何依赖
 * bootstrap 完成前即可用，响应时间 < 1s
 */
app.get('/health/live', (_req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    version: config?.version ?? '0.0.0',
  })
})

// 健康检查（含版本、运行时间、数据库与存储空间）
// Requirements: 4.1, 4.4, 4.5 — 对外正式名「存储空间」；diskSpace 为兼容别名
app.get('/api/health', (_req, res) => {
  const boot = getBootstrapState()
  const uptime = config
    ? Math.floor((Date.now() - config.startTime.getTime()) / 1000)
    : 0
  
  // 检查数据库状态 (Requirements: 4.1)
  const databaseHealthy = database.isHealthy()
  
  // 存储空间：服务器 dataDir 唯一根所在卷（严禁第二套）
  const storageSpace = config ? getDiskSpace(config.dataDir) : null
  const storageSpaceLow = storageSpace ? storageSpace.available < MIN_DISK_SPACE_BYTES : false
  
  // 确定整体健康状态（未就绪禁止外层 success:true 假成功）
  let status: HealthStatus = 'ok'
  if (!boot.ready || !databaseHealthy) {
    status = 'unhealthy'
  } else if (storageSpaceLow) {
    status = 'degraded'
  }

  const spacePayload = storageSpace
    ? {
        used: storageSpace.used,
        available: storageSpace.available,
        total: storageSpace.total,
      }
    : null

  const payload = {
    status,
    version: config?.version ?? '0.0.0',
    uptime,
    database: databaseHealthy,
    ready: boot.ready,
    trace_id: boot.trace_id || undefined,
    /** 对外正式字段：存储空间 */
    storageSpace: spacePayload,
    /** @deprecated 兼容旧客户端；与 storageSpace 同值 */
    diskSpace: spacePayload,
  }

  if (status === 'unhealthy') {
    return res.status(503).json({
      success: false,
      code: 'E503',
      message: '服务未就绪',
      data: payload,
    })
  }

  res.json({ success: true, data: payload })
})

// 配置信息接口（用于验证环境变量配置一致性）
app.get('/api/config', (_req, res) => {
  const gov = getGovernanceState()
  res.json({
    success: true,
    data: {
      appEnv: config.appEnv,
      port: config.port,
      dataDir: config.dataDir,
      logLevel: config.logLevel,
      nodeEnv: config.nodeEnv,
      version: config.version,
      timezone: config.timezone,
      /** 客户端应消费的相对 API 基址（CFG-SYS-07） */
      apiBase: '/api',
      readyPath: '/healthz/ready',
      machineIdPrefix: config.machineId.slice(0, 8),
      lbnBound: Boolean(config.lbnBindingCode),
      killSwitch: gov.killSwitch || config.killSwitchArmed,
      configRevision: getConfigRevisionView().current,
      hotKeys: ['logLevel', 'infoSamplePercent', 'retentionDays', 'riskThresholds', 'perfSla'],
      infoSamplePercent: getConfigRevisionView().snapshot.infoSamplePercent,
      perfSla: getConfigRevisionView().snapshot.perfSla,
    }
  })
})

app.get('/api/config/revisions', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getConfigRevisionView() })
})

// MCP REST 路由（PAT 管理、公开投影、审核回传、OAuth 等）
registerMcpRoutes(app)

function configActor(req: Request): string {
  const user = (req as { authUser?: { username?: string; id?: string } }).authUser
  return user?.username || user?.id || 'unknown'
}

app.post('/api/config/hot', requirePermission('tenant_database'), (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>
    const entry = applyHotConfig(
      {
        logLevel: body.logLevel !== undefined ? String(body.logLevel) : undefined,
        infoSamplePercent:
          body.infoSamplePercent !== undefined ? Number(body.infoSamplePercent) : undefined,
        retentionDays:
          body.retentionDays && typeof body.retentionDays === 'object'
            ? (body.retentionDays as Record<string, number>)
            : undefined,
        riskThresholds:
          body.riskThresholds && typeof body.riskThresholds === 'object'
            ? (body.riskThresholds as Record<string, number>)
            : undefined,
        perfSla:
          body.perfSla && typeof body.perfSla === 'object'
            ? (body.perfSla as {
                requestMs?: number
                p95Ms?: number
                errorRate?: number
                alertAfterBreaches?: number
              })
            : undefined,
      },
      configActor(req)
    )
    recordAuditSafe({
      actor: configActor(req),
      action: 'config_hot',
      resource: 'config/hot',
      detail: `v=${entry.version} level=${entry.logLevel}`,
    })
    res.json({ success: true, data: entry })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fail(res, 400, Err.BAD_REQUEST, message, req)
  }
})

app.post('/api/config/rollback', requirePermission('tenant_database'), (req, res) => {
  const toVersion = Number((req.body || {}).version)
  if (!Number.isInteger(toVersion) || toVersion < 1) {
    fail(res, 400, Err.BAD_REQUEST, 'version 必须是正整数', req)
    return
  }
  try {
    const entry = rollbackConfig(toVersion, configActor(req))
    recordAuditSafe({
      actor: configActor(req),
      action: 'config_rollback',
      resource: 'config/rollback',
      detail: `v=${entry.version} from=${toVersion}`,
    })
    res.json({ success: true, data: entry })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fail(res, 400, Err.BAD_REQUEST, message, req)
  }
})

/** 管控服务状态（只读；鉴权后） */
app.get('/api/governance/status', requirePermission('tenant_monitor'), (_req, res) => {
  const gov = getGovernanceState()
  res.json({
    success: true,
    data: {
      ...gov,
      machineId: gov.machineId.slice(0, 8) + '…',
      logTypes: LOG_TYPES,
      logHeartbeats: getLogTypeHeartbeats(),
    },
  })
})

/** 调度服务状态（时间驱动 · 只读；鉴权后） */
app.get('/api/schedule/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getScheduleState(),
      jobs: listJobs(),
    },
  })
})

app.post('/api/schedule/jobs/:id/trigger', requirePermission('tenant_database'), async (req, res) => {
  const ok = trigger(String(req.params.id))
  if (!ok) return fail(res, 404, Err.NOT_FOUND, '任务不存在或已禁用', req)
  res.json({ success: true, data: { triggered: true, id: req.params.id } })
})

/** 工单审计查询（状态迁移可审计） */
app.get('/api/schedule/tickets', requirePermission('tenant_monitor'), (req, res) => {
  const jobId = req.query.jobId ? String(req.query.jobId) : undefined
  const rows = listTicketAudit(jobId)
  res.json({
    success: true,
    data: {
      rows,
      total: rows.length,
    },
  })
})

/** 注册服务 */
app.get('/api/registry/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getRegistryState(),
      healthy: listHealthyInstances(),
    },
  })
})

/** B9.1 · 服务协作管控 / 事件协作管控 / 契约治理管控 状态与探针 */
app.get('/api/collab/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      服务协作管控: isServiceCollabReady(),
      事件协作管控: isEventCollabReady(),
      契约治理管控: isContractGovernanceReady(),
      gateway: getGatewayState(),
      registry: getRegistryState(),
    },
  })
})

/** 嵌入式服务发现（进程内通讯录，非独立网格） */
app.get('/api/collab/svc/discover', requirePermission('tenant_monitor'), (_req, res) => {
  const mesh = discoverEmbeddedMesh()
  res.json({
    success: true,
    data: mesh,
  })
})

app.post('/api/collab/service/route-probe', requirePermission('tenant_monitor'), (req, res) => {
  const caller = String(req.body?.caller || 'gateway')
  const callee = String(req.body?.callee || 'cyp-memo-server')
  const okRoute = routeInternalService({ caller, callee })
  const denyUnregistered = routeInternalService({ caller: 'no-such-caller', callee })
  const denyUnauthorized = routeInternalService({ caller: 'probe-denied', callee })
  res.json({
    success: true,
    data: {
      allowed: okRoute,
      unregistered: denyUnregistered,
      unauthorized: denyUnauthorized,
      ready: isServiceCollabReady(),
    },
  })
})

app.post('/api/collab/event/probe', requirePermission('tenant_monitor'), (_req, res) => {
  const probe = runEventCollabProbe()
  res.json({ success: true, data: { ...probe, ready: isEventCollabReady() } })
})

app.post('/api/collab/contract/probe', requirePermission('tenant_monitor'), (_req, res) => {
  const probe = runContractGovernanceProbe()
  res.json({ success: true, data: { ...probe, ready: isContractGovernanceReady() } })
})

/** B9.2 · 租户协作服务 / 数据协作服务 */
app.post('/api/collab/tenant/probe', requirePermission('tenant_monitor'), (req, res) => {
  const actor = req.authUser
  if (!actor) return fail(res, 401, Err.UNAUTH, '未认证', req)
  const subjectUserId = String(req.body?.subjectUserId || '').trim()
  if (!subjectUserId) return fail(res, 400, Err.BAD_REQUEST, '缺少 subjectUserId', req)
  try {
    const probe = runTenantCollabProbe({ fromOwner: actor, subjectUserId })
    res.json({ success: true, data: { ...probe, ready: isTenantCollabReady() } })
  } catch (err) {
    fail(res, 400, Err.BAD_REQUEST, err instanceof Error ? err.message : '租户协作探针失败', req)
  }
})

app.post('/api/collab/data/probe', requirePermission('tenant_monitor'), (req, res) => {
  const actor = req.authUser
  if (!actor) return fail(res, 401, Err.UNAUTH, '未认证', req)
  const deniedUserId = String(req.body?.deniedUserId || '').trim()
  const denied = deniedUserId ? database.getUserById(deniedUserId) : undefined
  if (!denied) return fail(res, 400, Err.BAD_REQUEST, '缺少有效 deniedUserId', req)
  try {
    const probe = runDataCollabProbe({ producer: actor, denied })
    res.json({ success: true, data: { ...probe, ready: isDataCollabReady() } })
  } catch (err) {
    fail(res, 400, Err.BAD_REQUEST, err instanceof Error ? err.message : '数据协作探针失败', req)
  }
})

/** B9.3 · 公开接入安全 */
app.get('/api/public-access/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getZeroTrustStatus(),
      ready: isPublicAccessSecurityReady(),
    },
  })
})

app.post('/api/collab/public-access/probe', requirePermission('tenant_monitor'), (_req, res) => {
  const probe = runPublicAccessProbe()
  res.json({ success: true, data: { ...probe, ready: isPublicAccessSecurityReady() } })
})

/** B9.4 · 开放协作管控 */
app.get('/api/open-collab/catalog', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      catalog: getOpenApiCatalog(),
      apps: listOpenApps(),
      ready: isOpenCollabReady(),
    },
  })
})

app.post('/api/collab/open/probe', requirePermission('tenant_monitor'), (req, res) => {
  try {
    const probe = runOpenCollabProbe()
    res.json({ success: true, data: { ...probe, ready: isOpenCollabReady() } })
  } catch (err) {
    fail(res, 400, Err.BAD_REQUEST, err instanceof Error ? err.message : '开放协作探针失败', req)
  }
})

/** 网关 / 元数据 / 文件 / 告警 */
app.get('/api/gateway/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getGatewayState(),
      circuits: listCircuitSnapshotDetail(),
    },
  })
})

app.post('/api/gateway/circuit/force-open', requirePermission('tenant_monitor'), (req, res) => {
  const dep = String(req.body?.dependency || '').trim()
  if (!dep) {
    fail(res, 400, Err.BAD_REQUEST, '缺少 dependency', req)
    return
  }
  forceOpen(dep)
  res.json({ success: true, data: { dependency: dep, circuits: listCircuitSnapshotDetail() } })
})

app.post('/api/gateway/circuit/force-close', requirePermission('tenant_monitor'), (req, res) => {
  const dep = String(req.body?.dependency || '').trim()
  if (!dep) {
    fail(res, 400, Err.BAD_REQUEST, '缺少 dependency', req)
    return
  }
  forceClose(dep)
  res.json({ success: true, data: { dependency: dep, circuits: listCircuitSnapshotDetail() } })
})

app.post('/api/gateway/circuit/reset', requirePermission('tenant_monitor'), (req, res) => {
  const dep = String(req.body?.dependency || '').trim()
  if (!dep) {
    fail(res, 400, Err.BAD_REQUEST, '缺少 dependency', req)
    return
  }
  resetCircuit(dep)
  res.json({ success: true, data: { dependency: dep, circuits: listCircuitSnapshotDetail() } })
})

app.get('/api/metadata/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getMetadataState(),
      sample: listMetadata('error_code').slice(0, 8).map((e) => ({
        code: e.code,
        label: renderErrorCode(e.code),
      })),
    },
  })
})

app.get('/api/files/storage/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({
    success: true,
    data: {
      ...getFileStorageState(),
      uploadRoot: (() => {
        try {
          return getUploadRoot()
        } catch {
          return null
        }
      })(),
    },
  })
})

app.get('/api/alerts/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getAlertState() })
})

/**
 * 运维监控聚合快照（单次往返 · 替代前端多 GET 串/并行轮询）
 * 权限：tenant_monitor
 */
app.get('/api/ops/snapshot', requirePermission('tenant_monitor'), (_req, res) => {
  const boot = getBootstrapState()
  const uptime = config
    ? Math.floor((Date.now() - config.startTime.getTime()) / 1000)
    : 0
  const databaseHealthy = database.isHealthy()
  const storageSpace = config ? getDiskSpace(config.dataDir) : null
  const storageSpaceLow = storageSpace ? storageSpace.available < MIN_DISK_SPACE_BYTES : false
  let healthStatus: HealthStatus = 'ok'
  if (!boot.ready || !databaseHealthy) healthStatus = 'unhealthy'
  else if (storageSpaceLow) healthStatus = 'degraded'
  const spacePayload = storageSpace
    ? { used: storageSpace.used, available: storageSpace.available, total: storageSpace.total }
    : null

  const { body: readyBody } = buildReadyResponse()
  const gov = getGovernanceState()
  const sched = getScheduleState()

  res.json({
    success: true,
    data: {
      at: new Date().toISOString(),
      health: {
        status: healthStatus,
        version: config?.version ?? '0.0.0',
        uptime,
        database: databaseHealthy,
        ready: boot.ready,
        storageSpace: spacePayload,
        diskSpace: spacePayload,
      },
      ready: readyBody?.data ?? readyBody,
      config: {
        appEnv: config.appEnv,
        port: config.port,
        dataDir: config.dataDir,
        logLevel: config.logLevel,
        version: config.version,
        killSwitch: gov.killSwitch || config.killSwitchArmed,
      },
      alerts: getAlertState(),
      tickets: listAlertTickets({ status: 'active', limit: 50 }),
      schedule: {
        ...sched,
        jobs: listJobs(),
      },
      elasticity: getElasticityState(),
      perf: getPerfState(),
      release: getReleaseState(),
      files: getFileStorageState(),
      automation: getAutomationIntelligenceState(),
      governance: {
        ...gov,
        machineId: gov.machineId.slice(0, 8) + '…',
        logTypes: LOG_TYPES,
        logHeartbeats: getLogTypeHeartbeats(),
      },
    },
  })
})

app.get('/api/automation/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getAutomationIntelligenceState() })
})

app.get('/api/risk/dispositions', requirePermission('tenant_monitor'), (req, res) => {
  const raw = Number(req.query.limit)
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 50
  res.json({
    success: true,
    data: {
      ready: isRiskDispositionReady(),
      thresholds: getRiskThresholds(),
      recent: listRecentRiskDispositions(limit),
    },
  })
})

app.get('/api/pipeline/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getDataPipelineState() })
})

app.post('/api/pipeline/replay', requirePermission('tenant_database'), (req, res) => {
  const raw = Number((req.body || {}).limit)
  const limit = Number.isFinite(raw) ? Math.min(2000, Math.max(1, Math.floor(raw))) : 200
  const result = replayDataPipelineSyncLog({ limit })
  res.json({ success: true, data: result })
})

app.get('/api/alerts', requirePermission('tenant_monitor'), (req, res) => {
  const statusRaw = String(req.query.status || 'active')
  const status =
    statusRaw === 'open' || statusRaw === 'assigned' || statusRaw === 'closed' || statusRaw === 'active'
      ? statusRaw
      : 'active'
  const raw = Number(req.query.limit)
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 50
  res.json({ success: true, data: { tickets: listAlertTickets({ status, limit }) } })
})

app.get('/api/notify/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getNotifyState() })
})

app.get('/api/kms/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getKmsState() })
})

app.get('/api/audit/status', requireAnyPermission('tenant_logs', 'tenant_monitor'), (req, res) => {
  const raw = Number(req.query.limit)
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 100
  res.json({
    success: true,
    data: {
      ...getAuditState(),
      recent: listRecentAudits(limit),
    },
  })
})

app.get('/api/tracing/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getTracingState() })
})

app.get('/api/tracing/:traceId', requirePermission('tenant_monitor'), (req, res) => {
  res.json({ success: true, data: { spans: getTraceTree(String(req.params.traceId)) } })
})

app.get('/api/release/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getReleaseState() })
})

app.get('/api/migration/status', requireAnyPermission('tenant_database', 'tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getMigrationState() })
})

app.post('/api/alerts/test', requirePermission('tenant_database'), async (req, res) => {
  gradeAndEmitAlertCandidate({
    signal: 'manual_test',
    source: 'manual',
    title: String((req.body || {}).title || 'test alert'),
    detail: String((req.body || {}).detail || 'manual test'),
    grade: 'warn',
  })
  // drain once so ⑦ can consume
  try {
    const { getSystemMq } = await import('./runtime-base/l0/infra/mq/ready.js')
    await getSystemMq().drain(Math.min(32, getMachineCapacity().mqDrainBatch))
  } catch {
    /* ignore */
  }
  res.json({ success: true, data: { queued: true } })
})

app.post('/api/release/canary', requirePermission('tenant_monitor'), (req, res) => {
  const weight = Number((req.body || {}).weight ?? 0)
  const w = setCanaryWeight(weight)
  res.json({ success: true, data: { canaryWeight: w } })
})

app.post('/api/release/rollback', requirePermission('tenant_database'), (req, res) => {
  try {
    const next = rollbackRelease()
    res.json({ success: true, data: next })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fail(res, 400, Err.BAD_REQUEST, message, req)
  }
})

app.get('/api/elasticity/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getElasticityState() })
})

/** 性能运行管控状态（嵌入式完整能力指标面） */
app.get('/api/perf/status', requirePermission('tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: getPerfState() })
})

/** 固化性能基线（优化对照点） */
app.post('/api/perf/baseline', requirePermission('tenant_monitor'), (req, res) => {
  const force = Boolean((req.body || {}).force)
  const baseline = capturePerfBaseline(force)
  if (!baseline) {
    fail(res, 400, Err.BAD_REQUEST, '样本不足或当前未达健康窗口，无法固化基线', req)
    return
  }
  res.json({ success: true, data: baseline })
})

/** 运维手动设置性能 SLA 目标（经配置管控热变更落盘，钳制不得宽于高标准） */
app.post('/api/perf/sla', requirePermission('tenant_monitor'), (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>
    const actor = configActor(req)
    if (body.reset === true) {
      const sla = resetPerfSlaToHighStandard({ actor })
      applyHotConfig({ perfSla: sla }, actor)
      recordAuditSafe({
        actor,
        action: 'perf_sla_reset',
        resource: 'perf/sla',
        detail: `requestMs=${sla.requestMs} p95Ms=${sla.p95Ms}`,
      })
      res.json({ success: true, data: { sla, defaults: getDefaultPerfSla() } })
      return
    }
    const patch = {
      requestMs: body.requestMs !== undefined ? Number(body.requestMs) : undefined,
      p95Ms: body.p95Ms !== undefined ? Number(body.p95Ms) : undefined,
      errorRate: body.errorRate !== undefined ? Number(body.errorRate) : undefined,
      alertAfterBreaches:
        body.alertAfterBreaches !== undefined ? Number(body.alertAfterBreaches) : undefined,
    }
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined && Number.isFinite(v as number))
    ) as {
      requestMs?: number
      p95Ms?: number
      errorRate?: number
      alertAfterBreaches?: number
    }
    if (Object.keys(cleaned).length === 0) {
      fail(res, 400, Err.BAD_REQUEST, '须提供 requestMs / p95Ms / errorRate / alertAfterBreaches 或 reset', req)
      return
    }
    const entry = applyHotConfig({ perfSla: cleaned }, actor)
    recordAuditSafe({
      actor,
      action: 'perf_sla_update',
      resource: 'perf/sla',
      detail: `v=${entry.version} p95=${entry.perfSla.p95Ms}`,
    })
    res.json({
      success: true,
      data: { sla: entry.perfSla, configVersion: entry.version, defaults: getDefaultPerfSla() },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fail(res, 400, Err.BAD_REQUEST, message, req)
  }
})

/** 弹性可逆：回到基线并发/限流系数 */
app.post('/api/elasticity/revert', requirePermission('tenant_monitor'), (req, res) => {
  const reason = String((req.body || {}).reason || 'manual_revert').slice(0, 120)
  const decision = revertElasticity(reason)
  res.json({ success: true, data: { decision, applied: getElasticityState().applied } })
})

/** 将当前并发提升为新基线（优化成果固化） */
app.post('/api/elasticity/promote-baseline', requirePermission('tenant_monitor'), (_req, res) => {
  const applied = promoteElasticityBaseline()
  res.json({ success: true, data: applied })
})

/** G04：人工确认紧急停机 */
app.post('/api/governance/kill-switch', requirePermission('tenant_database'), (req, res) => {
  const reason = String((req.body || {}).reason || 'manual').slice(0, 200)
  activateKillSwitch(config.dataDir, reason)
  recordAuditSafe({
    actor: configActor(req),
    action: 'kill_switch_on',
    resource: 'governance/kill-switch',
    detail: reason,
  })
  res.status(200).json({
    success: true,
    data: { killSwitch: true, reason },
  })
})

/** G04：人工解除（须 Owner 高危权） */
app.delete('/api/governance/kill-switch', requirePermission('tenant_database'), (req, res) => {
  const actor =
    (req as { authUser?: { username?: string; id?: string } }).authUser?.username ||
    (req as { authUser?: { username?: string; id?: string } }).authUser?.id ||
    'unknown'
  deactivateKillSwitch(config.dataDir, String(actor))
  recordAuditSafe({
    actor: String(actor),
    action: 'kill_switch_off',
    resource: 'governance/kill-switch',
  })
  res.json({ success: true, data: { killSwitch: false } })
})

/** G11/G14：列出永久封禁（含已人工解除历史） */
app.get('/api/governance/bans', requirePermission('tenant_users'), (req, res) => {
  const raw = String((req.query || {}).status || 'active')
  const status =
    raw === 'all' || raw === '已人工解除' || raw === 'active'
      ? (raw as 'active' | '已人工解除' | 'all')
      : 'active'
  res.json({ success: true, data: listPermanentBans({ status }) })
})

/** G14：永久封禁人工解除 —— 仅服务端离线；在线 API 已退役 */
app.post('/api/governance/bans/lift', requirePermission('tenant_users'), (req, res) => {
  fail(
    res,
    410,
    Err.GONE,
    '永久封禁人工解除仅允许服务端离线执行（部署机 scripts/offline-lift-ban.ts），禁止在线 API',
    req
  )
})

/** G06 数据源登记目录（只读） */
app.get('/api/governance/data-sources', requireAnyPermission('tenant_database', 'tenant_monitor'), (_req, res) => {
  res.json({ success: true, data: listRegisteredSources() })
})

/** G07 血缘查询 */
app.get('/api/governance/lineage', requireAnyPermission('tenant_database', 'tenant_logs', 'tenant_monitor'), (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : undefined
  const trace_id = typeof req.query.trace_id === 'string' ? req.query.trace_id : undefined
  if (key || trace_id) {
    res.json({ success: true, data: findLineageUpstream({ key, trace_id }) })
    return
  }
  const raw = Number(req.query.limit)
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 100
  res.json({ success: true, data: getRecentLineage(limit) })
})

/** LC21：经服务触发清理（禁止业务散删） */
app.post('/api/logs/cleanup', requirePermission('tenant_logs'), (_req, res) => {
  const result = cleanupLogFilesViaBase()
  res.json({ success: true, data: result })
})

let versionLatestCache: { at: number; body: Record<string, unknown> } | null = null
const VERSION_LATEST_TTL_MS = 10 * 60 * 1000

// 检查 Docker Hub 最新版本
app.get('/api/version/latest', async (_req, res) => {
  const now = Date.now()
  if (versionLatestCache && now - versionLatestCache.at < VERSION_LATEST_TTL_MS) {
    res.json(versionLatestCache.body)
    return
  }
  const fallback = {
    success: true,
    data: {
      currentVersion: config.version,
      latestVersion: config.version,
      hasUpdate: false,
      releaseUrl: null,
      releaseNotes: null,
    },
  }
  try {
    // 出站治理网关子中心：版本探测为必建生产调用（api.github.com 由 bootstrap 自动放行）
    const eg = await egressFetch({
      dependency: 'github-releases',
      url: 'https://api.github.com/repos/ADdss-hub/CYP-memo/releases/latest',
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CYP-memo-Server',
      },
      timeoutMs: 2000,
      retries: 0,
    })

    if (!eg.ok || !eg.body || typeof eg.body !== 'object') {
      // 仅网络/上游故障回落；禁止因未配 allowlist 而设计性跳过
      versionLatestCache = { at: now, body: fallback }
      res.json(fallback)
      return
    }

    const release = eg.body as Record<string, unknown>
    const latestVersion = String(release.tag_name || '').replace(/^v/, '')
    if (!latestVersion) {
      versionLatestCache = { at: now, body: fallback }
      res.json(fallback)
      return
    }
    const hasUpdate = compareVersions(latestVersion, config.version) > 0

    const body = {
      success: true,
      data: {
        currentVersion: config.version,
        latestVersion,
        hasUpdate,
        releaseUrl: release.html_url || null,
        releaseNotes: release.body || '',
        publishedAt: release.published_at,
      },
    }
    versionLatestCache = { at: now, body }
    res.json(body)
  } catch (error) {
    versionLatestCache = { at: now, body: fallback }
    res.json(fallback)
  }
})

/**
 * 比较版本号
 */
function compareVersions(v1: string, v2: string): number {
  const parseVersion = (v: string): number[] => {
    return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  }
  const parts1 = parseVersion(v1)
  const parts2 = parseVersion(v2)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

// ========== R2 统一认证（API-01/02/03/11）==========

/** 中风险挑战签发（按 IP；防枚举） */
app.get('/api/auth/challenge', (req, res) => {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  const issued = issueLoginChallenge(ip)
  res.setHeader('X-CYP-Challenge', 'arith')
  res.json({ success: true, data: issued })
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password, token, challengeId, challengeAnswer } = req.body || {}
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  const deviceHint = deviceHintFromRequest(req)

  // 先解析可能存在的账号以取 digitalId（错密也入检测维度；不向客户端泄露存在性）
  let foundByName =
    username && typeof username === 'string' ? database.getUserByUsername(username) : null
  const gateKey = {
    username: String(username || ''),
    ip,
    deviceHint,
    digitalId: foundByName?.digitalId,
  }

  const delayMs = getLoginChallengeDelayMs(gateKey)
  const needChallenge = isLoginChallengeRequired(gateKey)
  if (delayMs > 0) {
    res.setHeader('X-CYP-Challenge', 'delay')
    await new Promise((r) => setTimeout(r, delayMs))
  }
  if (needChallenge) {
    res.setHeader('X-CYP-Challenge-Required', '1')
    const verified = verifyLoginChallenge({
      challengeId: typeof challengeId === 'string' ? challengeId : undefined,
      challengeAnswer:
        challengeAnswer !== undefined && challengeAnswer !== null
          ? String(challengeAnswer)
          : undefined,
      ip,
    })
    if (!verified.ok) {
      // 防枚举：缺/错挑战与错密同码；引导客户端拉 /api/auth/challenge
      recordLoginFailure(gateKey)
      return fail(res, 401, Err.LOGIN_FAIL, '用户名或密码错误', req)
    }
  }

  const gate = assertLoginAllowed(gateKey)
  if (!gate.ok) {
    if (gate.retryAfterSec) res.setHeader('Retry-After', String(gate.retryAfterSec))
    const httpStatus = gate.code === 'E024' ? 429 : 403
    return fail(res, httpStatus, gate.code === 'E024' ? Err.RATE_LIMITED : Err.LOCKED, gate.message, req)
  }

  if (isKillSwitchActive()) {
    return fail(res, 503, Err.KILL_SWITCH, '系统已紧急停机（kill-switch）', req)
  }

  let user =
    typeof token === 'string' && token.trim()
      ? database.getUserByToken(token.trim())
      : null

  if (!user && username && password) {
    if (
      foundByName &&
      foundByName.passwordHash &&
      bcrypt.compareSync(password, foundByName.passwordHash)
    ) {
      user = foundByName
    } else if (
      foundByName &&
      foundByName.passwordHash &&
      !/^\$2[aby]\$/.test(String(foundByName.passwordHash))
    ) {
      // 历史子账号曾写入浏览器 PBKDF2，与 bcrypt 登录不兼容
      recordLoginFailure(gateKey)
      return fail(
        res,
        401,
        Err.LOGIN_FAIL,
        '该账号密码格式已失效，请由主账号删除后重建子用户',
        req
      )
    }
  }

  if (!user) {
    recordLoginFailure(gateKey)
    logger.audit(`统一登录失败: ${username || '(token)'}`, {
      level: 'warn',
      type: 'security',
      action: 'auth_login_failed',
      context: {
        username: username || null,
        via: token ? 'token' : 'password',
        deviceHint,
        digitalId: foundByName?.digitalId || null,
        challengeDelayMs: delayMs,
        challengeRequired: needChallenge,
      },
    })
    recordAuditSafe({
      actor: String(username || 'anonymous').slice(0, 80),
      action: 'auth_login_failed',
      resource: 'auth/login',
      detail: token ? 'via=token' : 'via=password',
    })
    res.setHeader('X-CYP-Challenge-Required', '1')
    return fail(res, 401, Err.LOGIN_FAIL, '用户名或密码错误', req)
  }

  recordLoginSuccess({
    username: user.username,
    ip,
    deviceHint,
    digitalId: user.digitalId,
  })

  let accessToken = user.token
  if (!accessToken) {
    accessToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    updateUserViaBase(user.id, { token: accessToken })
    user = { ...user, token: accessToken }
  }

  const now = new Date().toISOString()
  updateUserViaBase(user.id, { lastLoginAt: now })
  publishDomainEvent(
    'IdentitySessionCreated',
    9,
    { userId: user.id, digitalId: user.digitalId },
    'info'
  )
  publishDomainEvent(
    'UserLoggedIn',
    9,
    {
      userId: user.id,
      ip,
      clientVersion: req.headers['app-version'] || 'unknown',
    },
    'info'
  )
  publishDomainEvent(
    'PolicyEvaluated',
    11,
    { policyId: 'login_gate', result: 'allow', userId: user.id },
    'info'
  )
  logger.audit(`统一登录成功: ${user.username}`, {
    userId: user.id,
    action: 'auth_login',
    context: {
      userId: user.id,
      digitalId: user.digitalId,
      role: user.role,
      tenantRootId: user.tenantRootId,
    },
  })
  recordAuditSafe({
    actor: user.username || user.id,
    action: 'auth_login',
    resource: 'auth/login',
    detail: `role=${user.role}`,
  })

  res.json({
    success: true,
    data: {
      accessToken,
      /** 身份主体：digitalId（Bearer 仍为不可猜测 opaque 会话令牌） */
      subject: user.digitalId,
      digitalId: user.digitalId,
      user: sanitizeUser({ ...user, lastLoginAt: now }),
    },
  })
})

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, securityQuestion } = req.body || {}
    if (!username || !password) {
      return fail(res, 400, Err.BAD_REQUEST, '用户名与密码必填', req)
    }
    if (database.usernameExists(username)) {
      return fail(res, 400, Err.USERNAME_EXISTS, resolveUsernameConflictMessage(username), req)
    }

    const id = uuidv4()
    const passwordHash = bcrypt.hashSync(password, 10)
    let accessToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    while (database.tokenExists(accessToken)) {
      accessToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    }
    const now = new Date().toISOString()

    createUserViaBase({
      id,
      username,
      passwordHash,
      token: accessToken,
      securityQuestion: securityQuestion || null,
      rememberPassword: false,
      isMainAccount: true,
      parentUserId: null,
      permissions: [...OWNER_DEFAULT_PERMISSIONS],
      createdAt: now,
      lastLoginAt: now,
      role: 'owner',
      tenantRootId: id,
    })

    const created = database.getUserById(id)!
    logger.audit(`Owner 注册成功: ${username}`, {
      userId: id,
      action: 'auth_register',
      context: { userId: id, digitalId: created.digitalId, role: 'owner' },
    })

    res.json({
      success: true,
      data: {
        accessToken,
        subject: created.digitalId,
        digitalId: created.digitalId,
        user: sanitizeUser(created),
      },
    })
  } catch (err) {
    logger.error('统一注册失败', err)
    fail(res, 500, inferCodeFromMessage(err instanceof Error ? err.message : '注册失败', 500), err instanceof Error ? err.message : '注册失败', req)
  }
})

/** AUD-S03：注销清会话令牌（吊销） */
app.post('/api/auth/logout', (req, res) => {
  const user = req.authUser
  if (!user) {
    return fail(res, 401, Err.UNAUTH, '未认证', req)
  }
  updateUserViaBase(user.id, { token: null })
  logger.audit(`统一注销: ${user.username}`, {
    userId: user.id,
    action: 'auth_logout',
    context: { userId: user.id, digitalId: user.digitalId },
  })
  res.json({ success: true, data: { revoked: true } })
})

/** AUD-S04：当前用户自查资料（仅本人，无需 tenant_users） */
app.get('/api/me', (req, res) => {
  const user = req.authUser
  if (!user) {
    return fail(res, 401, Err.UNAUTH, '未认证', req)
  }
  res.json({ success: true, data: sanitizeUser(user) })
})

/** 本人资料安全字段自助更新（无需 account_manage；禁止改权限/角色/密码哈希） */
app.patch('/api/me', (req, res) => {
  const user = req.authUser
  if (!user) {
    return fail(res, 401, Err.UNAUTH, '未认证', req)
  }
  const body = { ...(req.body || {}) }
  const allowed = [
    'gender',
    'email',
    'birthDate',
    'phone',
    'address',
    'position',
    'company',
    'bio',
    'securityQuestion',
    'lastLoginAt',
    'rememberPassword',
  ] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      patch[key] = body[key]
    }
  }
  if (Object.keys(patch).length === 0) {
    return fail(res, 400, Err.BAD_REQUEST, '无允许更新的字段', req)
  }
  try {
    updateUserViaBase(user.id, patch)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新失败'
    if (msg.startsWith('拒绝未知用户列')) {
      return fail(res, 400, Err.BAD_REQUEST, msg, req)
    }
    throw err
  }
  const fresh = database.getUserById(user.id)
  res.json({ success: true, data: fresh ? sanitizeUser(fresh) : null })
})

/** 修改密码：服务端校验当前密码；不下发/不回传 hash */
app.post('/api/auth/change-password', (req, res) => {
  const user = req.authUser
  if (!user) {
    return fail(res, 401, Err.UNAUTH, '未认证', req)
  }
  const { currentPassword, newPassword } = req.body || {}
  if (!user.passwordHash) {
    return fail(res, 400, Err.BAD_REQUEST, '该账号不支持密码登录', req)
  }
  if (!currentPassword || !newPassword) {
    return fail(res, 400, Err.BAD_REQUEST, '缺少当前密码或新密码', req)
  }
  const pwErr = validateNewPassword(String(newPassword))
  if (pwErr) {
    return fail(res, 400, Err.BAD_REQUEST, pwErr, req)
  }
  if (!bcrypt.compareSync(String(currentPassword), user.passwordHash)) {
    return fail(res, 401, Err.LOGIN_FAIL, '当前密码错误', req)
  }
  const passwordHash = bcrypt.hashSync(String(newPassword), 10)
  updateUserViaBase(user.id, { passwordHash })
  logger.audit(`修改密码: ${user.username}`, {
    userId: user.id,
    action: 'auth_change_password',
    context: { userId: user.id, digitalId: user.digitalId },
  })
  res.json({ success: true, data: { changed: true } })
})

// ========== 账号恢复（密保 / 令牌 · 服务端比对，不下发 hash）==========

function extractSecurityAnswerHash(securityQuestion: unknown): string {
  if (!securityQuestion || typeof securityQuestion !== 'object') return ''
  const sq = securityQuestion as { answerHash?: string; answer?: string }
  return String(sq.answerHash || sq.answer || '')
}

function extractSecurityQuestionText(securityQuestion: unknown): string {
  if (!securityQuestion || typeof securityQuestion !== 'object') return ''
  return String((securityQuestion as { question?: string }).question || '')
}

/** 兼容 bcrypt / 浏览器 PBKDF2(Base64) / sha256: / base64: */
function verifySecurityAnswer(answer: string, answerHash: string): boolean {
  if (!answer || !answerHash) return false
  if (answerHash.startsWith('sha256:')) {
    const hex = crypto.createHash('sha256').update(answer, 'utf8').digest('hex')
    return answerHash === `sha256:${hex}`
  }
  if (answerHash.startsWith('base64:')) {
    return answerHash === `base64:${Buffer.from(answer, 'utf8').toString('base64')}`
  }
  if (answerHash.startsWith('$2')) {
    try {
      return bcrypt.compareSync(answer, answerHash)
    } catch {
      return false
    }
  }
  try {
    const combined = Buffer.from(answerHash, 'base64')
    if (combined.length >= 48) {
      const salt = combined.subarray(0, 16)
      const stored = combined.subarray(16)
      const derived = crypto.pbkdf2Sync(Buffer.from(answer, 'utf8'), salt, 100000, 32, 'sha256')
      if (stored.length === derived.length) {
        return crypto.timingSafeEqual(stored, derived)
      }
    }
  } catch {
    /* fallthrough */
  }
  try {
    return bcrypt.compareSync(answer, answerHash)
  } catch {
    return false
  }
}

function validateNewPassword(password: string): string | null {
  if (!password || password.length < 8) return '密码长度至少为 8 位'
  if (!/[a-zA-Z]/.test(password)) return '密码必须包含字母'
  if (!/[0-9]/.test(password)) return '密码必须包含数字'
  return null
}

app.post('/api/auth/recover/question', (req, res) => {
  const username = String(req.body?.username || '').trim()
  if (!username) {
    return fail(res, 400, Err.BAD_REQUEST, '用户名必填', req)
  }
  const user = database.getUserByUsername(username)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  const question = extractSecurityQuestionText(user.securityQuestion)
  if (!question) {
    return fail(res, 400, Err.BAD_REQUEST, '该用户未设置安全问题，请联系管理员', req)
  }
  res.json({ success: true, data: { question } })
})

app.post('/api/auth/recover/verify', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const answer = String(req.body?.answer || '')
  if (!username || !answer) {
    return fail(res, 400, Err.BAD_REQUEST, '用户名与答案必填', req)
  }
  const user = database.getUserByUsername(username)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  const answerHash = extractSecurityAnswerHash(user.securityQuestion)
  if (!answerHash) {
    return fail(res, 400, Err.BAD_REQUEST, '该用户未设置安全问题，请联系管理员', req)
  }
  if (!verifySecurityAnswer(answer, answerHash)) {
    logger.audit(`密保验证失败: ${username}`, {
      level: 'warn',
      type: 'security',
      action: 'auth_recover_verify_failed',
      context: { username },
    })
    return fail(res, 401, Err.LOGIN_FAIL, '安全问题答案错误', req)
  }
  res.json({ success: true, data: { ok: true, username: user.username } })
})

app.post('/api/auth/recover/reset', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const answer = String(req.body?.answer || '')
  const newPassword = String(req.body?.newPassword || '')
  if (!username || !answer || !newPassword) {
    return fail(res, 400, Err.BAD_REQUEST, '用户名、答案与新密码必填', req)
  }
  const pwdErr = validateNewPassword(newPassword)
  if (pwdErr) {
    return fail(res, 400, Err.BAD_REQUEST, pwdErr, req)
  }
  const user = database.getUserByUsername(username)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  const answerHash = extractSecurityAnswerHash(user.securityQuestion)
  if (!answerHash) {
    return fail(res, 400, Err.BAD_REQUEST, '该用户未设置安全问题，请联系管理员', req)
  }
  if (!verifySecurityAnswer(answer, answerHash)) {
    logger.audit(`密保重置失败: ${username}`, {
      level: 'warn',
      type: 'security',
      action: 'auth_recover_reset_failed',
      context: { username },
    })
    return fail(res, 401, Err.LOGIN_FAIL, '安全问题答案错误', req)
  }
  const passwordHash = bcrypt.hashSync(newPassword, 10)
  updateUserViaBase(user.id, { passwordHash })
  logger.audit(`密保重置密码成功: ${username}`, {
    userId: user.id,
    action: 'auth_recover_reset',
    context: { userId: user.id, username },
  })
  res.json({ success: true, data: { ok: true } })
})

app.post('/api/auth/recover/by-token', (req, res) => {
  const token = String(req.body?.token || '').trim()
  if (!token) {
    return fail(res, 400, Err.BAD_REQUEST, '令牌必填', req)
  }
  const user = database.getUserByToken(token)
  if (!user) {
    return fail(res, 401, Err.TOKEN_INVALID, '令牌无效或不存在', req)
  }
  res.json({ success: true, data: { username: user.username } })
})

app.post('/api/auth/recover/reset-by-token', (req, res) => {
  const token = String(req.body?.token || '').trim()
  const newPassword = String(req.body?.newPassword || '')
  if (!token || !newPassword) {
    return fail(res, 400, 'E040', '令牌与新密码必填', req)
  }
  const pwdErr = validateNewPassword(newPassword)
  if (pwdErr) {
    return fail(res, 400, 'E040', pwdErr, req)
  }
  const user = database.getUserByToken(token)
  if (!user) {
    return fail(res, 401, Err.TOKEN_INVALID, '令牌无效或不存在', req)
  }
  const passwordHash = bcrypt.hashSync(newPassword, 10)
  updateUserViaBase(user.id, { passwordHash })
  logger.audit(`令牌重置密码成功: ${user.username}`, {
    userId: user.id,
    action: 'auth_recover_reset_by_token',
    context: { userId: user.id, username: user.username },
  })
  res.json({ success: true, data: { ok: true } })
})

// ========== Owner 列表（API-10：admins 表已 DROP；旧 admins 叙述已由 P4 取代）==========

/** API-10：/api/admins/* 一律 410；Owner 列表走 GET /api/users */
app.post('/api/admins/login', (req, res) => {
  fail(res, 410, Err.GONE, 'API-10：/api/admins/login 已退役，请使用 POST /api/auth/login', req)
})

app.get('/api/admins', (req, res) => {
  fail(res, 410, Err.GONE, 'API-10：/api/admins 已退役，请使用 GET /api/users', req)
})

app.get('/api/admins/count', (req, res) => {
  fail(res, 410, Err.GONE, 'API-10：/api/admins/count 已退役，请使用 GET /api/users', req)
})

app.all('/api/admins/*', (req, res) => {
  fail(res, 410, Err.GONE, 'API-10：/api/admins/* 已退役，请使用 /api/auth/* 与 /api/users', req)
})

// ========== 用户设置 API（欢迎引导 / 偏好键值）==========

function settingsStorageKey(userId: string, key: string): string {
  return `${userId}:${key}`
}

app.get('/api/settings', (req, res) => {
  const userId = req.authUser!.id
  const prefix = `${userId}:`
  const all = database.getAllSettings()
  const data: Record<string, unknown> = {}
  for (const [k, raw] of Object.entries(all)) {
    if (!k.startsWith(prefix)) continue
    const shortKey = k.slice(prefix.length)
    try {
      data[shortKey] = JSON.parse(raw)
    } catch {
      data[shortKey] = raw
    }
  }
  res.json({ success: true, data })
})

app.get('/api/settings/:key', (req, res) => {
  const userId = req.authUser!.id
  const raw = database.getSetting(settingsStorageKey(userId, req.params.key))
  if (raw === undefined) {
    return fail(res, 404, Err.NOT_FOUND, '设置项不存在', req)
  }
  let value: unknown = raw
  try {
    value = JSON.parse(raw)
  } catch {
    /* keep string */
  }
  res.json({ success: true, data: { value } })
})

app.put('/api/settings/:key', (req, res) => {
  const userId = req.authUser!.id
  const key = String(req.params.key || '').trim()
  if (!key || key.length > 128) {
    return fail(res, 400, Err.BAD_REQUEST, '无效的设置键', req)
  }
  if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'value')) {
    return fail(res, 400, Err.BAD_REQUEST, '缺少 value', req)
  }
  setSettingViaBase(settingsStorageKey(userId, key), JSON.stringify(req.body.value))
  res.json({ success: true, data: { ok: true } })
})

// ========== 用户 API ==========

// 获取本租户用户（API-08 + API-09）
app.get('/api/users', requirePermission('tenant_users'), (req, res) => {
  const tenantRootId = req.authUser!.tenantRootId
  const users = database.getUsersByTenantRootId(tenantRootId).map(sanitizeUser)
  res.json({ success: true, data: users })
})

// 根据ID获取用户（本人可自查；同租户可读资料用于备忘录创建人；跨用户管理须 tenant_users）
app.get('/api/users/:id', (req, res) => {
  const self = req.authUser!
  const targetId = req.params.id
  const user = database.getUserById(targetId)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  if (!assertSameTenant(req, user.tenantRootId)) {
    return forbidCrossTenant(res, req)
  }
  const isSelf = targetId === self.id
  const canListUsers = self.permissions.includes('tenant_users')
  const canMemoPeer =
    self.permissions.includes('memo_manage') &&
    (isSelf || user.tenantRootId === self.tenantRootId)
  if (!isSelf && !canListUsers && !canMemoPeer) {
    return fail(res, 403, Err.FORBIDDEN, '权限不足：缺少 tenant_users', req)
  }
  res.json({ success: true, data: sanitizeUser(user) })
})

// 根据用户名获取用户（API-09 脱敏；须已认证且同租户）
app.get('/api/users/by-username/:username', requirePermission('tenant_users'), (req, res) => {
  const user = database.getUserByUsername(req.params.username)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  if (!assertSameTenant(req, user.tenantRootId)) {
    return forbidCrossTenant(res, req)
  }
  res.json({ success: true, data: sanitizeUser(user) })
})

// 根据令牌获取用户（API-09；仅允许查自己的 token 资料）
app.get('/api/users/by-token/:token', requirePermission('tenant_users'), (req, res) => {
  const user = database.getUserByToken(req.params.token)
  if (!user) {
    return fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
  }
  if (req.authUser!.id !== user.id && !assertSameTenant(req, user.tenantRootId)) {
    return forbidCrossTenant(res, req)
  }
  if (req.authUser!.token !== req.params.token && req.authUser!.id !== user.id) {
    return fail(res, 403, Err.TOKEN_PROBE, '禁止用他人令牌探测', req)
  }
  res.json({ success: true, data: sanitizeUser(user) })
})

// 创建用户（成员须由本租户 Owner 创建；默认挂本租户）
app.post('/api/users', requirePermission('account_manage'), (req, res) => {
  try {
    const user = req.body || {}
    const id = user.id || uuidv4()
    const actor = req.authUser!
    
    // 检查用户名是否已存在（子账户撞名须提示联系主账户）
    if (database.usernameExists(user.username)) {
      return fail(res, 400, Err.USERNAME_EXISTS, resolveUsernameConflictMessage(user.username), req)
    }
    
    // 检查令牌是否已存在
    if (user.token && database.tokenExists(user.token)) {
      return fail(res, 400, Err.TOKEN_EXISTS, '令牌已存在', req)
    }

    const plainPassword = typeof user.password === 'string' ? user.password.trim() : ''
    const incomingHash =
      typeof user.passwordHash === 'string' ? String(user.passwordHash) : ''
    let passwordHash: string | null = null
    if (plainPassword) {
      // 权威路径：明文由服务端 bcrypt（与 /auth/login、/auth/register 一致）
      passwordHash = bcrypt.hashSync(plainPassword, 10)
    } else if (/^\$2[aby]\$/.test(incomingHash)) {
      // 兼容已是 bcrypt 的写入（迁移/脚本）
      passwordHash = incomingHash
    } else if (incomingHash) {
      return fail(
        res,
        400,
        Err.BAD_REQUEST,
        '禁止非 bcrypt 的 passwordHash（浏览器 PBKDF2 无法用于登录）；请传明文 password',
        req
      )
    } else {
      return fail(res, 400, Err.BAD_REQUEST, '创建用户须提供 password', req)
    }

    const role = user.role === 'owner' ? 'owner' : 'member'
    const tenantRootId = actor.tenantRootId
    const parentUserId =
      role === 'member' ? actor.id : user.parentUserId || null

    const permissions =
      role === 'member'
        ? normalizeMemberPermissions(user.permissions)
        : user.permissions || undefined
    
    createUserViaBase({
      id,
      username: user.username,
      passwordHash,
      token: user.token || null,
      securityQuestion: user.securityQuestion || null,
      gender: user.gender || null,
      email: user.email || null,
      birthDate: user.birthDate || null,
      phone: user.phone || null,
      address: user.address || null,
      position: user.position || null,
      company: user.company || null,
      bio: user.bio || null,
      rememberPassword: user.rememberPassword || false,
      isMainAccount: role === 'owner',
      parentUserId,
      permissions,
      createdAt: user.createdAt || new Date().toISOString(),
      lastLoginAt: user.lastLoginAt || new Date().toISOString(),
      role,
      tenantRootId,
    })
    
    res.json({ success: true, data: { id } })
  } catch (err) {
    logger.error('创建用户失败', err)
    fail(res, 500, inferCodeFromMessage(err instanceof Error ? err.message : '创建用户失败', 500), err instanceof Error ? err.message : '创建用户失败', req)
  }
})

// 更新用户（API-11：改 permissions 则轮换 token，旧 Bearer 立即失效）
app.patch('/api/users/:id', requirePermission('account_manage'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.id)) return
  const body = { ...req.body }
  delete body.tenantRootId
  delete body.role
  delete body.passwordHash
  delete body.id
  delete body.digitalId

  const before = database.getUserById(req.params.id)
  const targetIsMember =
    before?.role === 'member' || (!before?.isMainAccount && Boolean(before?.parentUserId))

  if (body.permissions !== undefined && targetIsMember) {
    body.permissions = normalizeMemberPermissions(body.permissions)
  }

  const permsChanging =
    body.permissions !== undefined &&
    before &&
    JSON.stringify(before.permissions) !== JSON.stringify(body.permissions)

  if (permsChanging) {
    let newToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    while (database.tokenExists(newToken)) {
      newToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    }
    body.token = newToken
    logger.audit(`权限变更吊销会话: ${before?.username || req.params.id}`, {
      level: 'warn',
      type: 'security',
      userId: req.authUser!.id,
      action: 'token_revoke_on_perm_change',
      context: {
        targetUserId: req.params.id,
        by: req.authUser!.id,
        digitalId: req.authUser!.digitalId,
      },
    })
  }

  try {
    updateUserViaBase(req.params.id, body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新用户失败'
    if (msg.startsWith('拒绝未知用户列')) {
      return fail(res, 400, Err.BAD_REQUEST, msg, req)
    }
    throw err
  }
  res.json({
    success: true,
    data: permsChanging ? { tokenRevoked: true } : null,
  })
})

// 删除用户（同时删除用户的所有数据和子账号）
app.delete('/api/users/:id', requirePermission('account_manage'), (req, res) => {
  try {
    const userId = req.params.id
    if (!guardTenantUser(req, res, userId)) return
    if (userId === req.authUser!.id) {
      return fail(res, 400, Err.SELF_DELETE, '不能删除当前登录用户', req)
    }
    const user = database.getUserById(userId)
    const result = deleteUserViaBase(userId)
    const message = result.subAccounts > 0 
      ? `用户及其 ${result.subAccounts} 个子账号的数据已删除`
      : '用户及其数据已删除'
    
    logger.audit(`删除用户: ${user?.username || userId}`, {
      action: 'user_delete',
      userId: req.authUser?.id,
      context: {
        userId,
        username: user?.username,
        digitalId: user?.digitalId,
        deleted: result,
      },
    })
    
    res.json({ 
      success: true, 
      data: { 
        message,
        deleted: result
      } 
    })
  } catch (err) {
    logger.error('删除用户失败', err)
    fail(res, 500, inferCodeFromMessage('删除用户失败', 500), '删除用户失败', req)
  }
})

// 检查用户名是否存在（A12-E / AUD：匿名不可枚举 — 恒 false；冲突仅注册/改密提交返回）
app.get('/api/users/check-username/:username', (_req, res) => {
  res.json({ success: true, data: { exists: false } })
})

// 检查令牌是否存在（AUD-S04：不可枚举 — 恒返回 false，防匿名探测）
app.get('/api/users/check-token/:token', (_req, res) => {
  res.json({ success: true, data: { exists: false } })
})

// 获取子账号列表（account_manage 管理 或 同租户 memo_manage 协作只读 · RBAC权限矩阵 矩阵属性）
app.get('/api/users/:parentUserId/sub-accounts', (req, res) => {
  const actor = req.authUser!
  const parentUserId = req.params.parentUserId
  if (!guardTenantUser(req, res, parentUserId)) return

  if (!canReadTenantPeer(actor, parentUserId)) {
    return fail(res, 403, Err.FORBIDDEN, '权限不足：缺少 account_manage', req)
  }

  const subAccounts = database.getSubAccounts(parentUserId).map(sanitizeUser)
  res.json({ success: true, data: subAccounts })
})

// ========== 备忘录 API ==========

function respondTenantMemos(req: import('express').Request, res: import('express').Response): void {
  const root = req.authUser?.tenantRootId
  const nameById = new Map<string, string>()
  if (root) {
    for (const u of database.getUsersByTenantRootId(root)) {
      nameById.set(u.id, u.username?.trim() || '未知用户')
    }
  }
  const memos = listTenantMemos(req)
    .map((m) => {
      const creatorName =
        (typeof m.creatorName === 'string' && m.creatorName.trim()) ||
        nameById.get(m.userId) ||
        '未知用户'
      return { ...m, creatorName }
    })
    .map(projectMemoForList)
  res.json({ success: true, data: memos })
}

/** 列表投影：截断大正文，对齐 REST list projection 业界实践；详情 GET /memos/:id 仍全文 */
const LIST_CONTENT_MAX = 256
function projectMemoForList<T extends { content?: string }>(
  memo: T
): T & { contentTruncated?: boolean } {
  const c = String(memo.content || '')
  if (c.length <= LIST_CONTENT_MAX) return memo
  return {
    ...memo,
    content: c.slice(0, LIST_CONTENT_MAX),
    contentTruncated: true,
  }
}

/**
 * 本租户可见备忘录列表（十权 memo_manage + 租户数据范围 · 身份访问管控/RBAC权限矩阵 唯一）
 * 须注册在 /api/memos/:id 之前
 */
app.get('/api/memos', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
  respondTenantMemos(req, res)
})

/** 已废止双路径：原 /memos/tenant-scope 一律 410，唯一列表为 GET /api/memos */
app.all('/api/memos/tenant-scope', (req, res) => {
  fail(res, 410, Err.GONE, 'API：/api/memos/tenant-scope 已废止，请使用 GET /api/memos', req)
})
app.all('/api/memos/tenant-scope/*', (req, res) => {
  fail(res, 410, Err.GONE, 'API：/api/memos/tenant-scope 已废止，请使用 GET /api/memos', req)
})

function enrichMemoCreator<T extends { userId: string; creatorName?: string }>(memo: T): T & { creatorName: string } {
  if (memo.creatorName?.trim()) {
    return { ...memo, creatorName: memo.creatorName.trim() }
  }
  const user = database.getUserById(memo.userId)
  return { ...memo, creatorName: user?.username || '未知用户' }
}

/**
 * 用户名冲突说明：子账户 ≠ 主账户自助注册名额。
 * 撞到子账户时明确告知联系对应主账户；撞到主账户则提示更换用户名。
 */
function resolveUsernameConflictMessage(username: string): string {
  const existing = database.getUserByUsername(String(username || '').trim())
  if (!existing) {
    return '用户名已存在'
  }
  const isMember =
    existing.role === 'member' ||
    (!existing.isMainAccount && Boolean(existing.parentUserId))
  if (isMember) {
    const ownerId = existing.parentUserId || existing.tenantRootId
    const owner = ownerId ? database.getUserById(ownerId) : undefined
    const ownerName = owner?.username?.trim()
    if (ownerName) {
      return `用户名「${existing.username}」已被主账户「${ownerName}」下的子账户占用，请联系该主账户处理，或更换用户名`
    }
    return `用户名「${existing.username}」已被某主账户下的子账户占用，请联系对应主账户处理，或更换用户名`
  }
  return `用户名「${existing.username}」已被主账户占用，请更换用户名`
}

// 获取用户的备忘录
app.get('/api/users/:userId/memos', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const user = database.getUserById(req.params.userId)
  const creatorName = user?.username?.trim() || '未知用户'
  const memos = database
    .getMemosListByUserIds([req.params.userId])
    .map((m) => ({
      ...m,
      creatorName: (typeof m.creatorName === 'string' && m.creatorName.trim()) || creatorName,
    }))
    .map(projectMemoForList)
  res.json({ success: true, data: memos })
})

// 获取备忘录
app.get('/api/memos/:id', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
  const memo = guardMemoAccess(req, res, req.params.id)
  if (!memo) return
  res.json({ success: true, data: enrichMemoCreator(memo) })
})

// 创建备忘录（业务协同对接 写服务 · 经 数据处理核算 管道 + 领域事件）
app.post('/api/memos', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
  const memo = req.body
  const userId = memo.userId || req.authUser!.id
  if (!guardTenantUser(req, res, userId)) return
  const id = memo.id || uuidv4()
  const result = createMemoViaBase({
    id,
    userId,
    title: memo.title,
    content: memo.content || '',
    tags: memo.tags || [],
    priority: memo.priority || null,
    attachments: memo.attachments || [],
    createdAt: memo.createdAt || new Date().toISOString(),
    updatedAt: memo.updatedAt || new Date().toISOString(),
    tenantRootId: req.authUser?.tenantRootId,
  })
  res.json({ success: true, data: { id: result.id } })
})

// 更新备忘录
app.patch('/api/memos/:id', requirePermission('memo_manage'), (req, res) => {
  if (!guardMemoAccess(req, res, req.params.id)) return
  const body = { ...req.body }
  delete body.userId
  updateMemoViaBase(req.params.id, body, req.authUser!.id)
  res.json({ success: true, data: null })
})

// 删除备忘录（业务协同对接 · ③ Saga）
app.delete('/api/memos/:id', requirePermission('memo_manage'), async (req, res) => {
  if (!guardMemoAccess(req, res, req.params.id)) return
  try {
    await deleteMemoViaBase(req.params.id, req.authUser!.id)
    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('删除备忘录失败', err)
    fail(res, 500, inferCodeFromMessage('删除失败', 500), '删除失败，请重试', req)
  }
})

// ========== 备忘录历史 API ==========

app.post('/api/memo-history', requirePermission('memo_manage'), (req, res) => {
  try {
    const history = req.body
    if (!guardMemoAccess(req, res, history.memoId)) return
    const id = createMemoHistoryViaBase({
      id: history.id,
      memoId: history.memoId,
      title: history.title || '',
      content: history.content || '',
      tags: history.tags || [],
      priority: history.priority || null,
      createdAt: history.createdAt || new Date().toISOString()
    })
    res.json({ success: true, data: { id } })
  } catch (err) {
    logger.error('创建备忘录历史失败', err)
    fail(res, 500, inferCodeFromMessage('创建备忘录历史失败', 500), '创建备忘录历史失败', req)
  }
})

app.get('/api/memos/:memoId/history', requirePermission('memo_manage'), (req, res) => {
  try {
    if (!guardMemoAccess(req, res, req.params.memoId)) return
    const history = database.getMemoHistory(req.params.memoId)
    res.json({ success: true, data: history })
  } catch (err) {
    logger.error('获取备忘录历史失败', err)
    fail(res, 500, inferCodeFromMessage('获取备忘录历史失败', 500), '获取备忘录历史失败', req)
  }
})

app.delete('/api/memos/:memoId/history', requirePermission('memo_manage'), (req, res) => {
  try {
    if (!guardMemoAccess(req, res, req.params.memoId)) return
    deleteMemoHistoryViaBase(req.params.memoId)
    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('删除备忘录历史失败', err)
    fail(res, 500, inferCodeFromMessage('删除备忘录历史失败', 500), '删除备忘录历史失败', req)
  }
})

// ========== 文件 API ==========

app.post('/api/files', requirePermission('attachment_manage'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, Err.NO_FILE, '未上传文件', req)
    }

    const metadataStr = req.body.metadata
    if (!metadataStr) {
      return fail(res, 400, Err.NO_META, '缺少文件元数据', req)
    }

    const metadata = JSON.parse(metadataStr)
    const userId = metadata.userId || req.authUser!.id
    if (!guardTenantUser(req, res, userId)) return
    if (metadata.memoId && !guardMemoAccess(req, res, metadata.memoId)) return
    const id = metadata.id || uuidv4()

    createFileViaBase({
      id,
      userId,
      memoId: metadata.memoId || null,
      filename: metadata.filename || req.file.originalname,
      mimeType: metadata.type || req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      path: req.file.path,
      createdAt: metadata.uploadedAt || new Date().toISOString()
    })

    res.json({ success: true, data: { id } })
  } catch (err) {
    logger.error('上传文件失败', err)
    fail(res, 500, inferCodeFromMessage('上传文件失败', 500), '上传文件失败', req)
  }
})

app.get('/api/files/:id/metadata', requirePermission('attachment_manage'), (req, res) => {
  const file = guardFileAccess(req, res, req.params.id)
  if (!file) return
  const full = database.getFileById(file.id)
  if (!full) {
    return fail(res, 404, Err.FILE_NOT_FOUND, '文件不存在', req)
  }

  res.json({
    success: true,
    data: {
      id: full.id,
      userId: full.userId,
      memoId: full.memoId,
      filename: full.filename,
      type: full.mimeType,
      size: full.size,
      uploadedAt: full.createdAt
    }
  })
})

app.get('/api/files/:id/blob', requirePermission('attachment_manage'), (req, res) => {
  const file = guardFileAccess(req, res, req.params.id)
  if (!file) return

  if (!fs.existsSync(file.path)) {
    return fail(res, 404, Err.FILE_BLOB_MISSING, '文件内容不存在', req)
  }

  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`)
  fs.createReadStream(file.path).pipe(res)
})

app.get('/api/users/:userId/files', requirePermission('attachment_manage'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return

  const files = database.getFilesByUserId(req.params.userId)

  const memos = database.getMemoAttachmentLinks(req.params.userId)
  const fileToMemos = new Map<string, string[]>()
  for (const memo of memos) {
    for (const fileId of memo.attachments || []) {
      if (!fileId) continue
      const list = fileToMemos.get(fileId) || []
      if (!list.includes(memo.id)) list.push(memo.id)
      fileToMemos.set(fileId, list)
    }
  }

  const formattedFiles = files.map(file => {
    const linked = [...(fileToMemos.get(file.id) || [])]
    if (file.memoId && !linked.includes(file.memoId)) linked.unshift(file.memoId)
    return {
      id: file.id,
      userId: file.userId,
      memoId: file.memoId,
      linkedMemoIds: linked,
      filename: file.filename,
      type: file.mimeType,
      size: file.size,
      uploadedAt: file.createdAt
    }
  })
  
  res.json({ success: true, data: formattedFiles })
})

app.get('/api/memos/:memoId/files', requirePermission('attachment_manage'), (req, res) => {
  if (!guardMemoAccess(req, res, req.params.memoId)) return
  const files = database.getFilesByMemoId(req.params.memoId)
  
  const formattedFiles = files.map(file => ({
    id: file.id,
    userId: file.userId,
    memoId: file.memoId,
    filename: file.filename,
    type: file.mimeType,
    size: file.size,
    uploadedAt: file.createdAt
  }))
  
  res.json({ success: true, data: formattedFiles })
})

app.patch('/api/files/:id', requirePermission('attachment_manage'), (req, res) => {
  try {
    if (!guardFileAccess(req, res, req.params.id)) return
    const body = (req.body || {}) as {
      memoId?: string | null
      filename?: string
      linkedMemoIds?: string[]
    }

    if (Array.isArray(body.linkedMemoIds)) {
      const ids = body.linkedMemoIds.map((id) => String(id || '').trim()).filter(Boolean)
      for (const memoId of ids) {
        if (!guardMemoAccess(req, res, memoId)) return
      }
      syncFileMemoLinksViaBase(req.params.id, ids)
    } else if (body.memoId !== undefined) {
      if (body.memoId && !guardMemoAccess(req, res, body.memoId)) return
      // 追加关联，不从其它备忘录抢走；memoId=null 为全部解绑
      syncFileMemoLinkViaBase(req.params.id, body.memoId || null)
    }
    if (typeof body.filename === 'string' && body.filename.trim()) {
      updateFileViaBase(req.params.id, { filename: body.filename.trim() })
    }

    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('更新文件失败', err)
    fail(res, 500, inferCodeFromMessage('更新文件失败', 500), '更新文件失败', req)
  }
})

app.delete('/api/files/:id', requirePermission('attachment_manage'), (req, res) => {
  try {
    const file = guardFileAccess(req, res, req.params.id)
    if (!file) return

    // 删磁盘 + 元数据，并同步从备忘录 attachments 移除
    deleteFileWithBlobViaBase(req.params.id)
    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('删除文件失败', err)
    fail(res, 500, inferCodeFromMessage('删除文件失败', 500), '删除文件失败', req)
  }
})

app.get('/api/users/:userId/storage', requirePermission('attachment_manage'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const files = database.getFilesByUserId(req.params.userId)
  const accountUsed = files.reduce((total, file) => total + (file.size || 0), 0)
  // 与 health.storageSpace 同一口径：服务器 dataDir 唯一根所在卷（对外正式名「存储空间」）
  const disk = config ? getDiskSpace(config.dataDir) : null
  res.json({
    success: true,
    data: {
      used: disk?.used ?? 0,
      total: disk?.total ?? 0,
      available: disk?.available ?? 0,
      accountUsed,
    },
  })
})

// ========== 分享 API ==========

/** 公开访问分享（无需登录；白名单见身份访问管控） */
app.post('/api/public/shares/:id/access', (req, res) => {
  try {
    const shareId = req.params.id
    const share = database.getShareById(shareId)
    if (!share) {
      res.json({
        success: true,
        data: { success: false, error: '分享链接不存在' },
      })
      return
    }

    if (share.expiresAt) {
      const expires = new Date(share.expiresAt)
      if (!Number.isNaN(expires.getTime()) && Date.now() > expires.getTime()) {
        res.json({
          success: true,
          data: { success: false, error: '分享链接已过期' },
        })
        return
      }
    }

    const passwordHash = share.passwordHash
    if (passwordHash) {
      const password =
        typeof req.body?.password === 'string' ? req.body.password : ''
      if (!password) {
        res.json({
          success: true,
          data: {
            success: false,
            requiresPassword: true,
            error: '需要输入访问密码',
          },
        })
        return
      }
      if (!bcrypt.compareSync(password, passwordHash)) {
        res.json({
          success: true,
          data: {
            success: false,
            requiresPassword: true,
            error: '密码错误',
          },
        })
        return
      }
    }

    const memo = database.getMemoById(share.memoId)
    if (!memo || memo.deletedAt) {
      res.json({
        success: true,
        data: { success: false, error: '备忘录不存在' },
      })
      return
    }

    updateShareViaBase(share.id, {
      viewCount: (share.viewCount || 0) + 1,
    })

    res.json({
      success: true,
      data: {
        success: true,
        memo: {
          id: memo.id,
          userId: memo.userId,
          title: memo.title,
          content: memo.content,
          tags: memo.tags || [],
          priority: memo.priority,
          attachments: memo.attachments || [],
          createdAt: memo.createdAt,
          updatedAt: memo.updatedAt,
        },
      },
    })
  } catch (err) {
    logger.error('公开访问分享失败', err)
    fail(res, 500, inferCodeFromMessage('访问失败', 500), '访问失败，请重试', req)
  }
})

const SHARE_FEEDBACK = new Set(['helpful', 'neutral', 'improve'])

function serializeShareComment(c: {
  id: string
  shareId: string
  authorName: string
  content: string
  feedback: string
  createdAt: string
  replyContent?: string | null
  replyAt?: string | null
  replyBy?: string | null
}) {
  return {
    id: c.id,
    shareId: c.shareId,
    authorName: c.authorName,
    content: c.content,
    feedback: c.feedback,
    createdAt: c.createdAt,
    replyContent: c.replyContent || null,
    replyAt: c.replyAt || null,
    replyBy: c.replyBy || null,
  }
}

function assertPublicShareReadable(
  share: ReturnType<typeof database.getShareById>,
  password: string | undefined
): { ok: true } | { ok: false; status?: number; body: Record<string, unknown> } {
  if (!share) {
    return { ok: false, body: { success: false, error: '分享链接不存在' } }
  }
  if (share.expiresAt) {
    const expires = new Date(share.expiresAt)
    if (!Number.isNaN(expires.getTime()) && Date.now() > expires.getTime()) {
      return { ok: false, body: { success: false, error: '分享链接已过期' } }
    }
  }
  const passwordHash = share.passwordHash
  if (passwordHash) {
    const pwd = typeof password === 'string' ? password : ''
    if (!pwd) {
      return {
        ok: false,
        body: {
          success: false,
          requiresPassword: true,
          error: '需要输入访问密码',
        },
      }
    }
    if (!bcrypt.compareSync(pwd, passwordHash)) {
      return {
        ok: false,
        body: {
          success: false,
          requiresPassword: true,
          error: '密码错误',
        },
      }
    }
  }
  return { ok: true }
}

/** 公开列出分享评论（无需登录） */
app.get('/api/public/shares/:id/comments', (req, res) => {
  try {
    const shareId = req.params.id
    const share = database.getShareById(shareId)
    const password =
      typeof req.query.password === 'string' ? req.query.password : undefined
    const gate = assertPublicShareReadable(share, password)
    if (!gate.ok) {
      res.json({ success: true, data: gate.body })
      return
    }
    const comments = database.getShareCommentsByShareId(shareId).map(serializeShareComment)
    res.json({ success: true, data: { success: true, comments } })
  } catch (err) {
    logger.error('公开列出分享评论失败', err)
    fail(res, 500, inferCodeFromMessage('加载评论失败', 500), '加载评论失败，请重试', req)
  }
})

/** 公开发表分享评论（无需登录；须带反馈） */
app.post('/api/public/shares/:id/comments', (req, res) => {
  try {
    const shareId = req.params.id
    const share = database.getShareById(shareId)
    const password =
      typeof req.body?.password === 'string' ? req.body.password : undefined
    const gate = assertPublicShareReadable(share, password)
    if (!gate.ok) {
      res.json({ success: true, data: gate.body })
      return
    }

    const content =
      typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!content || content.length > 500) {
      fail(res, 400, Err.BAD_REQUEST, '评论内容须为 1–500 字', req)
      return
    }
    const feedback =
      typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : ''
    if (!SHARE_FEEDBACK.has(feedback)) {
      fail(res, 400, Err.BAD_REQUEST, '请选择反馈：有帮助 / 一般 / 需改进', req)
      return
    }
    const authorName =
      typeof req.body?.authorName === 'string'
        ? req.body.authorName.trim().slice(0, 32)
        : ''

    const id = createShareCommentViaBase({
      shareId,
      authorName: authorName || '匿名访客',
      content,
      feedback: feedback as 'helpful' | 'neutral' | 'improve',
    })
    const created = database.getShareCommentById(id)
    res.json({
      success: true,
      data: {
        success: true,
        comment: created
          ? serializeShareComment(created)
          : serializeShareComment({
              id,
              shareId,
              authorName: authorName || '匿名访客',
              content,
              feedback,
              createdAt: new Date().toISOString(),
            }),
      },
    })
  } catch (err) {
    logger.error('公开发表分享评论失败', err)
    fail(res, 500, inferCodeFromMessage('发表评论失败', 500), '发表评论失败，请重试', req)
  }
})

app.post('/api/shares', requirePermission('share_manage'), (req, res) => {
  try {
    const share = req.body
    const userId = share.userId || req.authUser!.id
    if (!guardTenantUser(req, res, userId)) return
    if (share.memoId && !guardMemoAccess(req, res, share.memoId)) return
    const id = share.id || uuidv4()

    const rawPassword =
      typeof share.password === 'string' && share.password.trim()
        ? share.password.trim()
        : ''
    const passwordHash = rawPassword ? bcrypt.hashSync(rawPassword, 10) : null

    const expiresAt =
      share.expiresAt == null
        ? null
        : typeof share.expiresAt === 'string'
          ? share.expiresAt
          : new Date(share.expiresAt).toISOString()

    createShareViaBase({
      id,
      userId,
      memoId: share.memoId,
      shareCode: share.shareCode || uuidv4().replace(/-/g, '').substring(0, 8),
      passwordHash,
      expiresAt,
      viewCount: share.viewCount || share.accessCount || 0,
      createdAt: share.createdAt || new Date().toISOString(),
    })

    res.json({ success: true, data: { id } })
  } catch (err) {
    logger.error('创建分享链接失败', err)
    fail(res, 500, inferCodeFromMessage('创建分享链接失败', 500), '创建分享链接失败', req)
  }
})

app.get('/api/shares/:id', requirePermission('share_manage'), (req, res) => {
  const share = guardShareAccess(req, res, req.params.id)
  if (!share) return
  const full = database.getShareById(share.id)!

  res.json({
    success: true,
    data: {
      id: full.id,
      userId: full.userId,
      memoId: full.memoId,
      shareCode: full.shareCode,
      hasPassword: Boolean(full.passwordHash),
      expiresAt: full.expiresAt,
      accessCount: full.viewCount || 0,
      createdAt: full.createdAt,
    },
  })
})

app.get('/api/users/:userId/shares', requirePermission('share_manage'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const shares = database.getSharesByUserId(req.params.userId)
  
  const formattedShares = shares.map(share => ({
    id: share.id,
    userId: share.userId,
    memoId: share.memoId,
    shareCode: share.shareCode,
    hasPassword: Boolean(share.passwordHash),
    expiresAt: share.expiresAt,
    accessCount: share.viewCount || 0,
    createdAt: share.createdAt
  }))
  
  res.json({ success: true, data: formattedShares })
})

/** 分享主人查看访客评论与反馈（须登录；不走公开口令） */
app.get('/api/users/:userId/share-comments', requirePermission('share_manage'), (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const shareIds = database.getSharesByUserId(req.params.userId).map((s) => s.id)
  const comments = database.getShareCommentsByShareIds(shareIds).map(serializeShareComment)
  res.json({ success: true, data: comments })
})

/** 分享主人回复访客评论 */
app.post(
  '/api/shares/:id/comments/:commentId/reply',
  requirePermission('share_manage'),
  (req, res) => {
    try {
      const share = guardShareAccess(req, res, req.params.id)
      if (!share) return
      const comment = database.getShareCommentById(req.params.commentId)
      if (!comment || comment.shareId !== share.id) {
        fail(res, 404, Err.NOT_FOUND, '评论不存在', req)
        return
      }
      const replyContent =
        typeof req.body?.content === 'string' ? req.body.content.trim() : ''
      if (!replyContent || replyContent.length > 500) {
        fail(res, 400, Err.BAD_REQUEST, '回复内容须为 1–500 字', req)
        return
      }
      replyShareCommentViaBase({
        commentId: comment.id,
        replyContent,
        replyBy: req.authUser!.id,
      })
      const updated = database.getShareCommentById(comment.id)!
      res.json({ success: true, data: serializeShareComment(updated) })
    } catch (err) {
      logger.error('回复分享评论失败', err)
      fail(res, 500, inferCodeFromMessage('回复失败', 500), '回复失败，请重试', req)
    }
  }
)

/** 站内通知收件箱（⑫ · 含运维告警站内；需能读自己的收件） */
const notifyInboxPerm = requireAnyPermission(
  'share_manage',
  'memo_manage',
  'tenant_monitor',
  'profile_self'
)

app.get('/api/users/:userId/notifications', notifyInboxPerm, (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const unreadOnly = String(req.query.unreadOnly || '') === '1'
  const items = listUserNotifications(req.params.userId, { unreadOnly, limit: 50 })
  res.json({
    success: true,
    data: {
      items,
      unreadCount: listUserNotifications(req.params.userId, { unreadOnly: true, limit: 200 }).length,
    },
  })
})

/** 站内通知长轮询：since 之后有新通知立即返回（Bearer 可鉴权，替代 EventSource） */
app.get('/api/users/:userId/notifications/wait', notifyInboxPerm, async (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const since =
    typeof req.query.since === 'string' && req.query.since.trim()
      ? req.query.since.trim()
      : '1970-01-01T00:00:00.000Z'
  const timeoutRaw = Number(req.query.timeoutMs)
  const timeoutMs = Number.isFinite(timeoutRaw) ? timeoutRaw : 25000

  let closed = false
  const onClose = () => {
    closed = true
  }
  req.on('close', onClose)

  try {
    const arrived = await waitUserNotifications(req.params.userId, since, timeoutMs)
    if (closed) return
    res.json({
      success: true,
      data: {
        items: arrived,
        unreadCount: listUserNotifications(req.params.userId, {
          unreadOnly: true,
          limit: 200,
        }).length,
      },
    })
  } catch (err) {
    if (!closed) {
      logger.error('通知长轮询失败', err)
      fail(res, 500, inferCodeFromMessage('通知等待失败', 500), '通知等待失败', req)
    }
  } finally {
    req.off('close', onClose)
  }
})

app.post('/api/users/:userId/notifications/read-all', notifyInboxPerm, (req, res) => {
  if (!guardTenantUser(req, res, req.params.userId)) return
  const n = markAllUserNotificationsRead(req.params.userId)
  res.json({ success: true, data: { marked: n } })
})

app.post(
  '/api/users/:userId/notifications/:nid/read',
  notifyInboxPerm,
  (req, res) => {
    if (!guardTenantUser(req, res, req.params.userId)) return
    const item = markUserNotificationRead(req.params.userId, req.params.nid)
    if (!item) {
      fail(res, 404, Err.NOT_FOUND, '通知不存在', req)
      return
    }
    res.json({ success: true, data: item })
  }
)

app.get('/api/memos/:memoId/shares', requirePermission('share_manage'), (req, res) => {
  if (!guardMemoAccess(req, res, req.params.memoId)) return
  const shares = database.getSharesByMemoId(req.params.memoId)
  
  const formattedShares = shares.map(share => ({
    id: share.id,
    userId: share.userId,
    memoId: share.memoId,
    shareCode: share.shareCode,
    hasPassword: Boolean(share.passwordHash),
    expiresAt: share.expiresAt,
    accessCount: share.viewCount || 0,
    createdAt: share.createdAt
  }))
  
  res.json({ success: true, data: formattedShares })
})

app.patch('/api/shares/:id', requirePermission('share_manage'), (req, res) => {
  try {
    if (!guardShareAccess(req, res, req.params.id)) return

    const updates: Record<string, unknown> = {}
    if (req.body.accessCount !== undefined) {
      updates.viewCount = req.body.accessCount
    }
    if (req.body.viewCount !== undefined) {
      updates.viewCount = req.body.viewCount
    }
    if (req.body.expiresAt !== undefined) {
      updates.expiresAt = req.body.expiresAt
    }

    updateShareViaBase(req.params.id, updates)
    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('更新分享链接失败', err)
    fail(res, 500, inferCodeFromMessage('更新分享链接失败', 500), '更新分享链接失败', req)
  }
})

app.delete('/api/shares/:id', requirePermission('share_manage'), (req, res) => {
  try {
    if (!guardShareAccess(req, res, req.params.id)) return
    deleteShareViaBase(req.params.id)
    res.json({ success: true, data: null })
  } catch (err) {
    logger.error('删除分享链接失败', err)
    fail(res, 500, inferCodeFromMessage('删除分享链接失败', 500), '删除分享链接失败', req)
  }
})

// ========== 统计 API ==========

app.get('/api/data/statistics', requirePermission('statistics_view'), (req, res) => {
  const ids = [...listTenantUserIds(req)]
  res.json({
    success: true,
    data: {
      userCount: ids.length,
      memoCount: database.countByUserIds('memos', ids),
      fileCount: database.countByUserIds('files', ids),
      shareCount: database.countByUserIds('shares', ids),
      logCount: database.countLogsVisibleToUserIds(ids),
    },
  })
})

// ========== 数据导入导出 API ==========

app.get('/api/data/export', requirePermission('tenant_database'), (req, res) => {
  const tenantIds = listTenantUserIds(req)
  const data = {
    users: database.getUsers().filter((u) => tenantIds.has(u.id)).map(sanitizeUser),
    memos: database.getMemos().filter((m) => tenantIds.has(m.userId)),
    files: database.getFiles().filter((f) => tenantIds.has(f.userId)),
    shares: database.getShares().filter((s) => tenantIds.has(s.userId)),
    logs: database.getLogs().filter((l) => !l.userId || tenantIds.has(l.userId)),
    settings: {},
  }
  const payload = JSON.stringify(data)
  const bytesApprox = Buffer.byteLength(payload, 'utf8')
  const traceId =
    (req.headers['x-trace-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    `exp_${Date.now().toString(36)}`
  recordExportTelemetry({
    tenantRootId: req.authUser?.tenantRootId,
    digitalId: req.authUser?.digitalId,
    bytesApprox,
    rowCounts: {
      users: data.users.length,
      memos: data.memos.length,
      files: data.files.length,
      shares: data.shares.length,
      logs: data.logs.length,
    },
    trace_id: traceId,
  })
  recordLineageEdge({
    source: 'export',
    table: 'tenant_bundle',
    op: 'export',
    key: req.authUser?.tenantRootId || 'unknown',
    sink: 'http_response',
    trace_id: traceId,
    tenantRootId: req.authUser?.tenantRootId,
    digitalId: req.authUser?.digitalId,
    bytesApprox,
  })
  res.json({ success: true, data: payload })
})

app.post('/api/data/import', requirePermission('tenant_database'), (req, res) => {
  try {
    const { data } = req.body
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    const tenantRootId = req.authUser!.tenantRootId
    
    let imported = { users: 0, memos: 0 }
    
    if (parsed.users && Array.isArray(parsed.users)) {
      for (const user of parsed.users) {
        if (!database.getUserById(user.id) && !database.getUserByUsername(user.username)) {
          createUserViaBase({
            ...user,
            role: user.role === 'owner' ? 'member' : (user.role || 'member'),
            tenantRootId,
            parentUserId: user.parentUserId || req.authUser!.id,
            isMainAccount: false,
          })
          imported.users++
        }
      }
    }
    
    if (parsed.memos && Array.isArray(parsed.memos)) {
      for (const memo of parsed.memos) {
        if (!database.getMemoById(memo.id)) {
          const ownerId = memo.userId && listTenantUserIds(req).has(memo.userId)
            ? memo.userId
            : req.authUser!.id
          createMemoViaBase({
            id: memo.id || uuidv4(),
            userId: ownerId,
            title: memo.title || '',
            content: memo.content || '',
            tags: memo.tags || [],
            priority: memo.priority || null,
            attachments: memo.attachments || [],
            createdAt: memo.createdAt || new Date().toISOString(),
            updatedAt: memo.updatedAt || new Date().toISOString(),
            tenantRootId: req.authUser?.tenantRootId,
          })
          imported.memos++
        }
      }
    }
    
    res.json({ 
      success: true, 
      data: { 
        message: `导入成功：${imported.users} 个用户，${imported.memos} 条备忘录`,
        imported 
      } 
    })
  } catch (err) {
    fail(res, 400, Err.BAD_DATA, '数据格式错误', req)
  }
})

/** 仅清空本租户数据（禁止 clearAll 跨租户） */
app.delete('/api/data/clear', requirePermission('tenant_database'), async (req, res) => {
  try {
    if (req.authUser!.role !== 'owner') {
      return fail(res, 403, 'E030', '仅 Owner 可清空本租户数据', req)
    }
    const tenantIds = [...listTenantUserIds(req)]
    const selfId = req.authUser!.id
    for (const uid of tenantIds) {
      if (uid === selfId) continue
      deleteUserViaBase(uid)
    }
    // 清本 Owner 的业务数据但保留账号
    for (const m of database.getMemosByUserId(selfId)) {
      await deleteMemoViaBase(m.id, selfId)
    }
    for (const f of database.getFilesByUserId(selfId)) {
      if (f.path && fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path) } catch { /* ignore */ }
      }
      deleteFileViaBase(f.id)
    }
    for (const s of database.getSharesByUserId(selfId)) {
      deleteShareViaBase(s.id)
    }
    res.json({ success: true, data: { message: '本租户数据已清空（Owner 账号保留）' } })
  } catch (err) {
    fail(res, 500, inferCodeFromMessage('清空数据库失败', 500), '清空数据库失败', req)
  }
})

// ========== 日志 API ==========

/** SIX-LOG：客户端错误上报走统一 API 预算（系统韧性保障），禁止平行限流 Map */
function allowClientError(ip: string): boolean {
  const budget = consumeApiBudget(`client-error:${ip}`, getMachineCapacity().clientErrorRpm)
  return budget.ok
}

function optionalAuthUserId(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  if (!token) return null
  const user = database.getUserByToken(token)
  return user?.id ?? null
}

/**
 * SIX-LOG 轻量客户端错误上报（白名单；可选 Bearer 关联 userId）
 * 服务端脱敏落库；限流；消息/上下文长度封顶
 */
app.post('/api/logs/client-error', (req, res) => {
  try {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : '') ||
      req.socket.remoteAddress ||
      'unknown'
    if (!allowClientError(ip)) {
      fail(res, 429, Err.CLIENT_RATE_LIMITED, '客户端错误上报过于频繁', req)
      return
    }

    const body = (req.body || {}) as Record<string, unknown>
    const rawLevel = body.level === 'warn' ? 'warn' : 'error'
    const messageRaw = typeof body.message === 'string' ? body.message : 'client error'
    const message = messageRaw.slice(0, 2000)
    const source = typeof body.source === 'string' ? body.source.slice(0, 64) : 'unknown'
    const action =
      typeof body.action === 'string' && body.action.trim()
        ? body.action.slice(0, 64)
        : 'client_error'

    let createdAt = new Date().toISOString()
    if (typeof body.timestamp === 'string') {
      const t = new Date(body.timestamp)
      if (!isNaN(t.getTime())) createdAt = t.toISOString()
    }

    const contextIn =
      body.context && typeof body.context === 'object' && !Array.isArray(body.context)
        ? (body.context as Record<string, unknown>)
        : {}
    const detailsObj: Record<string, unknown> = {
      ...contextIn,
      source,
      clientReport: true,
    }
    let detailsJson = JSON.stringify(detailsObj)
    if (detailsJson.length > 8000) {
      detailsJson = JSON.stringify({
        source,
        clientReport: true,
        truncated: true,
        preview: detailsJson.slice(0, 500),
      })
    }

    const traceId =
      (typeof body.traceId === 'string' && body.traceId.trim()) ||
      req.traceId ||
      null

    const userId = optionalAuthUserId(req)

    log({
      level: rawLevel === 'warn' ? 'warn' : 'error',
      type: 'error',
      message,
      action,
      context: {
        ...JSON.parse(detailsJson),
        userId,
        clientReport: true,
      },
    })

    const logCtx = { action, source, traceId, userId }
    if (rawLevel === 'warn') {
      logger.warn(`[client-error] ${message}`, logCtx)
    } else {
      logger.error(`[client-error] ${message}`, undefined, logCtx)
    }

    res.json({ success: true, data: { id: req.requestId || null, traceId } })
  } catch (err) {
    logger.error('客户端错误上报失败', err)
    fail(res, 500, inferCodeFromMessage('创建日志失败', 500), '创建日志失败', req)
  }
})

app.post('/api/logs', (req, res) => {
  try {
    const logBody = req.body
    const userId = logBody.userId || req.authUser!.id
    if (logBody.userId && !guardTenantUser(req, res, logBody.userId)) return

    log({
      level: (logBody.level as 'debug' | 'info' | 'warn' | 'error') || 'info',
      type: 'business',
      message: String(logBody.message || ''),
      action: logBody.action,
      context: {
        ...(logBody.context && typeof logBody.context === 'object' ? logBody.context : {}),
        userId,
        clientLogId: logBody.id,
      },
    })
    res.json({ success: true, data: { id: req.requestId || logBody.id || null } })
  } catch (err) {
    logger.error('创建日志失败', err)
    fail(res, 500, inferCodeFromMessage('创建日志失败', 500), '创建日志失败', req)
  }
})

function mapLogsForClient(rawLogs: ReturnType<typeof database.getLogs>) {
  return rawLogs.map(log => ({
    id: log.id,
    level: log.level,
    message: log.message,
    action: log.action ?? undefined,
    userId: log.userId ?? undefined,
    context: log.details ? (() => {
      try {
        return JSON.parse(log.details)
      } catch {
        return undefined
      }
    })() : undefined,
    timestamp: log.createdAt,
    traceId: log.traceId ?? undefined,
  }))
}

/** R-015：运维检索 = 业务库审计/安全 + 独立观测库；禁止只读业务库冒充全量流水 */
function mergeTenantLogs(opts: {
  tenantIds: Set<string>
  traceId?: string
  level?: string
  /** 默认 200，上限 2000，避免一次合并拉爆响应 */
  limit?: number
}): ReturnType<typeof mapLogsForClient> {
  const { tenantIds, traceId, level } = opts
  const limit = Math.min(2000, Math.max(1, Math.floor(opts.limit ?? 200)))
  const fromBiz = (
    traceId
      ? database.getLogsByTrace(traceId)
      : level
        ? database.getLogsByLevel(level)
        : database.getLogs()
  ).filter((l) => !l.userId || tenantIds.has(l.userId))

  const fromObs = isObservabilityStoreReady()
    ? (
        traceId
          ? listObservabilityLogsByTrace(traceId)
          : level
            ? listObservabilityLogsByLevel(level)
            : listObservabilityLogs()
      ).filter((l) => !l.userId || tenantIds.has(l.userId))
    : []

  const byId = new Map<string, (typeof fromBiz)[number]>()
  for (const row of [...fromBiz, ...fromObs]) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  const merged = [...byId.values()].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  )
  return mapLogsForClient(merged.slice(0, limit))
}

app.get('/api/logs', requirePermission('tenant_logs'), (req, res) => {
  try {
    const tenantIds = listTenantUserIds(req)
    const qTrace = typeof req.query.traceId === 'string' ? req.query.traceId.trim() : ''
    const qLimitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
    const qLimit = Number.isFinite(qLimitRaw) ? qLimitRaw : undefined
    res.json({
      success: true,
      data: mergeTenantLogs({
        tenantIds,
        traceId: qTrace || undefined,
        limit: qLimit,
      }),
      meta: {
        observabilityDb: getObservabilityDbPath(),
        storageRoles: {
          businessDb: 'database.sqlite',
          observabilityDb: 'logs/observability.sqlite',
          jsonl: 'logs/<type>/',
          objectStore: 'uploads/',
        },
      },
    })
  } catch (err) {
    logger.error('获取日志失败', err)
    fail(res, 500, inferCodeFromMessage('获取日志失败', 500), '获取日志失败', req)
  }
})

app.get('/api/logs/by-trace/:traceId', requirePermission('tenant_logs'), (req, res) => {
  try {
    const tenantIds = listTenantUserIds(req)
    res.json({
      success: true,
      data: mergeTenantLogs({ tenantIds, traceId: req.params.traceId }),
    })
  } catch (err) {
    logger.error('按 traceId 获取日志失败', err)
    fail(res, 500, inferCodeFromMessage('获取日志失败', 500), '获取日志失败', req)
  }
})

app.get('/api/logs/by-code/:code', requirePermission('tenant_logs'), (req, res) => {
  try {
    const code = String(req.params.code || '').trim()
    if (!/^[A-Za-z0-9_-]{2,32}$/.test(code)) {
      fail(res, 400, Err.BAD_REQUEST, '业务码格式无效', req)
      return
    }
    const tenantIds = listTenantUserIds(req)
    const rawLogs = database
      .getLogsByBusinessCode(code)
      .filter((l) => !l.userId || tenantIds.has(l.userId))
    const mapped = mapLogsForClient(rawLogs)
    const traceIds = [
      ...new Set(
        rawLogs
          .map((l) => (l as { traceId?: string }).traceId)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    res.json({ success: true, data: { code, traceIds, logs: mapped } })
  } catch (err) {
    logger.error('按业务码获取日志失败', err)
    fail(res, 500, inferCodeFromMessage('获取日志失败', 500), '获取日志失败', req)
  }
})

app.get('/api/logs/by-level/:level', requirePermission('tenant_logs'), (req, res) => {
  try {
    const tenantIds = listTenantUserIds(req)
    res.json({
      success: true,
      data: mergeTenantLogs({ tenantIds, level: req.params.level }),
    })
  } catch (err) {
    logger.error('按级别获取日志失败', err)
    fail(res, 500, inferCodeFromMessage('获取日志失败', 500), '获取日志失败', req)
  }
})

app.delete('/api/logs', requirePermission('tenant_logs'), (req, res) => {
  try {
    clearLogsViaBase()
    res.json({ success: true, data: { message: '日志已清空' } })
  } catch (err) {
    fail(res, 500, inferCodeFromMessage('清空日志失败', 500), '清空日志失败', req)
  }
})

app.delete('/api/logs/before/:date', requirePermission('tenant_logs'), (req, res) => {
  try {
    const deleted = deleteOldLogsViaBase(req.params.date)
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    fail(res, 500, inferCodeFromMessage('删除日志失败', 500), '删除日志失败', req)
  }
})

// ========== 清理 API ==========

app.delete('/api/cleanup/deleted-memos', requirePermission('tenant_database'), (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const deleted = cleanDeletedMemosViaBase(days)
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    logger.error('清理已删除备忘录失败', err)
    fail(res, 500, inferCodeFromMessage('清理失败', 500), '清理失败', req)
  }
})

app.delete('/api/cleanup/orphaned-files', requirePermission('tenant_database'), (req, res) => {
  try {
    const deleted = cleanOrphanedFilesViaBase()
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    logger.error('清理孤立文件失败', err)
    fail(res, 500, inferCodeFromMessage('清理失败', 500), '清理失败', req)
  }
})

app.delete(
  '/api/cleanup/expired-shares',
  requireAnyPermission('share_manage', 'tenant_database'),
  (req, res) => {
  try {
    const deleted = cleanExpiredSharesViaBase()
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    logger.error('清理过期分享失败', err)
    fail(res, 500, inferCodeFromMessage('清理失败', 500), '清理失败', req)
  }
})

app.post('/api/cleanup/perform', requirePermission('tenant_database'), (req, res) => {
  try {
    const days = parseInt(req.body?.days as string) || 30
    const hours = parseInt(req.body?.hours as string) || 12
    const result = performCleanupViaBase(days, hours)
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('执行清理失败', err)
    fail(res, 500, inferCodeFromMessage('清理失败', 500), '清理失败', req)
  }
})

app.delete('/api/cleanup/all', requirePermission('tenant_database'), async (req, res) => {
  try {
    const { confirmCode } = req.body
    
    if (confirmCode !== 'DELETE_ALL_DATA') {
      return fail(res, 400, inferCodeFromMessage('需要提供确认码 DELETE_ALL_DATA 才能执行此操作', 400), '需要提供确认码 DELETE_ALL_DATA 才能执行此操作', req)
    }
    if (req.authUser!.role !== 'owner') {
      return fail(res, 403, 'E030', '仅 Owner 可执行完全清理', req)
    }

    logger.audit('执行本租户完全数据清理', {
      level: 'warn',
      type: 'security',
      action: 'cleanup_all',
      userId: req.authUser!.id,
      context: {
        timestamp: new Date().toISOString(),
        tenantRootId: req.authUser!.tenantRootId,
        digitalId: req.authUser!.digitalId,
      },
    })

    // 转调本租户清空（非全局 clearAllData）
    const tenantIds = [...listTenantUserIds(req)]
    const selfId = req.authUser!.id
    for (const uid of tenantIds) {
      if (uid === selfId) continue
      deleteUserViaBase(uid)
    }
    for (const m of database.getMemosByUserId(selfId)) {
      await deleteMemoViaBase(m.id, selfId)
    }
    for (const f of database.getFilesByUserId(selfId)) {
      if (f.path && fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path) } catch { /* ignore */ }
      }
      deleteFileViaBase(f.id)
    }
    for (const s of database.getSharesByUserId(selfId)) {
      deleteShareViaBase(s.id)
    }
    
    logger.info('本租户完全数据清理完成')
    
    res.json({ 
      success: true, 
      data: { 
        message: '本租户数据已清理完成（Owner 保留）',
        timestamp: new Date().toISOString()
      } 
    })
  } catch (err) {
    logger.error('完全数据清理失败', err)
    fail(res, 500, inferCodeFromMessage('清理失败', 500), '清理失败', req)
  }
})

// ========== SPA 路由回退（网关层 · 唯一产品壳 app · VIEW-05）==========
{
  const appDistPath = path.join(__dirname, '../../app/dist')
  const appDistExists = fs.existsSync(appDistPath)

  if (appDistExists) {
    gatewayApp.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/healthz') ||
        req.path.startsWith('/health/') ||
        req.path.startsWith('/mcp') ||
        req.path.startsWith('/admin')
      ) {
        return next()
      }
      const indexPath = path.join(appDistPath, 'index.html')
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).send('App index.html not found')
      }
    })
  }
}

/** R3：未捕获异常 → 七字段信封 */
app.use(globalErrorHandler)

// 启动服务器：先 bootstrap（Phase0–4），通过后才 listen；配置非法不得开端口
async function start() {
  try {
    logger.startup('🔄 正在启动 CYP-memo API 服务器（B18 bootstrap）...')

    const boot = await runBootstrap()
    if (!boot.ready || !boot.configReady) {
      logger.error('bootstrap 未就绪，拒绝监听业务端口', undefined, {
        trace_id: boot.trace_id,
        error: boot.error,
        ready: boot.ready,
        configReady: boot.configReady
      })
      process.exit(1)
    }

    const routeCount = bootstrapBusinessRouteCatalog()
    if (!isBusinessRouteRegistryReady() || routeCount < 1) {
      logger.error('业务路由表未登记，拒绝监听（底座强制）', undefined, {
        trace_id: boot.trace_id,
        routeCount,
      })
      process.exit(1)
    }
    logger.info('business_route_catalog.ready', {
      trace_id: boot.trace_id,
      routeCount: getBusinessRouteCount(),
    })

    // Phase0 已校验配置；此处取单例供路由使用
    config = getConfig()
    PORT = config.port
    API_PORT = config.apiPort

    // 同步 Phase2 登记的上传目录（唯一根 = config.dataDir/uploads）
    try {
      uploadDir = getUploadRoot()
    } catch {
      uploadDir = path.join(config.dataDir, 'uploads')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }
    }

    // ========== 网关层：挂载 /api 代理、/mcp 代理 ==========
    // /api/* → 后端 API 服务（127.0.0.1:API_PORT）
    gatewayApp.use('/api', (req, res) => {
      proxyApiToBackend(req, res)
    })

    // /healthz/* → 代理到后端 API 服务（就绪探针）
    gatewayApp.use('/healthz', (req, res) => {
      proxyApiToBackend(req, res)
    })

    // /health/* → 代理到后端 API 服务（存活探针）
    gatewayApp.use('/health', (req, res) => {
      proxyApiToBackend(req, res)
    })

    // /mcp → MCP 旁路服务（127.0.0.1:13175）· 网关反代中间件
    gatewayApp.use(mcpGatewayProxyMiddleware())

    // 网关层全局错误处理
    gatewayApp.use((err: Error, _req: Request, res: Response, _next: () => void) => {
      logger.error('gateway.error', err)
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          code: 'E500',
          message: '网关内部错误',
          timestamp: new Date().toISOString(),
        })
      }
    })

    // ========== 启动后端 API 服务（仅环回，不直接对外暴露）==========
    app.listen(API_PORT, '127.0.0.1', () => {
      logger.startup(`🔧 CYP-memo 后端 API 服务运行在 http://127.0.0.1:${API_PORT}`, {
        trace_id: boot.trace_id,
        totalDurationMs: boot.totalDurationMs
      })
      logger.info('api_server.listen', {
        trace_id: boot.trace_id,
        apiPort: API_PORT,
        bind: '127.0.0.1',
        bootstrapMs: boot.totalDurationMs,
      })
    })

    // ========== 启动网关层（产品统一入口，对外暴露 · HTTPS）==========
    const tlsMaterial = await ensureApiTlsMaterial(config.dataDir)
    const gatewayServer = https.createServer({ key: tlsMaterial.key, cert: tlsMaterial.cert, minVersion: 'TLSv1.2' }, gatewayApp)
    gatewayServer.listen(PORT, '0.0.0.0', () => {
      logger.startup(`🚀 CYP-memo 产品网关运行在 https://0.0.0.0:${PORT} (${tlsMaterial.source})`, {
        trace_id: boot.trace_id,
        totalDurationMs: boot.totalDurationMs
      })
      logger.startup(`📊 健康检查: https://localhost:${PORT}/api/health`)
      logger.startup(`✅ 就绪探针: https://localhost:${PORT}/healthz/ready`)
      logger.startup(`💚 存活探针: https://localhost:${PORT}/health/live`)
      logger.startup(`🌐 外部访问: https://<your-ip>:${PORT}`)
      logger.startup(`🔌 API 后端: 127.0.0.1:${API_PORT}（仅环回）`)
      logger.startup(`🔌 MCP 旁路: 127.0.0.1:${Number(process.env.CYP_MCP_HTTP_PORT || 13175)}（仅环回 · HTTPS）`)

      logger.info('gateway.listen', {
        trace_id: boot.trace_id,
        port: config.port,
        apiPort: config.apiPort,
        dataDir: config.dataDir,
        logLevel: config.logLevel,
        nodeEnv: config.nodeEnv,
        version: config.version,
        timezone: config.timezone,
        bootstrapMs: boot.totalDurationMs,
        phases: boot.phases.map(p => ({
          phase: p.phase,
          name: p.name,
          status: p.status,
          durationMs: p.durationMs
        }))
      })

      logger.audit(`服务器启动成功，网关端口 ${PORT}，API 端口 ${API_PORT}（仅环回）`, {
        type: 'runtime',
        action: 'server_start',
        context: {
          port: config.port,
          apiPort: config.apiPort,
          dataDir: config.dataDir,
          logLevel: config.logLevel,
          nodeEnv: config.nodeEnv,
          version: config.version,
          timezone: config.timezone,
          trace_id: boot.trace_id,
          bootstrapMs: boot.totalDurationMs,
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      })
    })

    // 优雅关闭
    process.on('SIGINT', () => {
      logger.startup('\n🛑 正在关闭服务器...')
      logger.audit('服务器正在关闭 (SIGINT)', {
        type: 'runtime',
        action: 'server_shutdown',
        context: {
          signal: 'SIGINT',
          trace_id: boot.trace_id,
          timestamp: new Date().toISOString(),
        },
      })
      database.close()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      logger.startup('\n🛑 正在关闭服务器...')
      logger.audit('服务器正在关闭 (SIGTERM)', {
        type: 'runtime',
        action: 'server_shutdown',
        context: {
          signal: 'SIGTERM',
          trace_id: boot.trace_id,
          timestamp: new Date().toISOString(),
        },
      })
      database.close()
      process.exit(0)
    })
  } catch (err) {
    logger.error('服务器启动失败', err)
    try {
      if (database.isHealthy()) {
        logger.audit(`服务器启动失败: ${err instanceof Error ? err.message : String(err)}`, {
          level: 'error',
          type: 'error',
          action: 'server_start_failed',
          context: { error: err instanceof Error ? err.stack : String(err) },
        })
      }
    } catch (_) {
      // 忽略日志记录失败
    }
    process.exit(1)
  }
}

start()
