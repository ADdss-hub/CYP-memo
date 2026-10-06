/**
 * CYP-memo B18 初始化组件 · 唯一 bootstrap 编排器
 * Phase0–4 串行 · 任务注册表 · 全程 trace_id
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 契约：reports/P3/CYP-memo-实现约束契约.md · B18
 * 改版：reports/P3/CYP-memo-改版清单.md 2.3 INIT-SYS-*
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getConfig, formatConfigInfo, formatStartupReportLine, type ServerConfig, initInfraResource, resetInfraResource, getInfraResourceState, isInfraResourceReady, initEnvIsolation, resetEnvIsolation, getEnvIsolationState, isEnvIsolationReady, getDiskSpace, MIN_DISK_SPACE_BYTES } from './runtime-base/l0/infra/cfg/ready.js'
import { initConfigRevision, isConfigRevisionReady, getConfigRevisionView } from './runtime-base/l1/mgmt/conf/ready.js'
import { initLog, log as log, resetLog, cleanupExpiredLogs, isLogReady, initLogger, logger } from './runtime-base/l0/infra/log/ready.js'
import {
  initObservabilityStore,
  appendObservabilityLog,
  resetObservabilityStore,
} from './runtime-base/l0/infra/log/obs-store.js'
import { initDatabase, database, initFileStorage, resetFileStorage, getFileStorageState, initMigration, resetMigration, getMigrationState, isMigrationReady, runPendingMigrations } from './runtime-base/l0/infra/db/ready.js'
import { getSystemCache, resetSystemCache } from './runtime-base/l0/infra/cache/ready.js'
import { initSystemMq, getSystemMq, resetSystemMq } from './runtime-base/l0/infra/mq/ready.js'
import { getRequestTraceId } from './runtime-base/l1/mgmt/trace/ready.js'
import { requirePermission } from './runtime-base/l1/mgmt/rbac/ready.js'
import { Err, fail, globalErrorHandler } from './runtime-base/l1/mgmt/code/ready.js'
import { getZeroTrustStatus, isPublicAccessSecurityReady } from './runtime-base/l1/pub/acc/ready.js'
import {
  initGovernance,
  resetGovernance,
  isKillSwitchActive,
  getGovernanceState,
  authenticate,
  sanitizeUser,
  registerEgressAutoAllow,
  getEgressAllowlist,
} from './runtime-base/l1/mgmt/iam/ready.js'
import {
  initSchedule,
  resetSchedule,
  getScheduleState,
} from './runtime-base/l1/host/sched/ready.js'
import {
  initRegistry,
  resetRegistry,
  registerSelfAfterInit,
  getRegistryState,
  bindEmbeddedServiceCollab,
  serviceCollabGrantCount,
  initServiceRegistry,
  registerService,
  getServiceRegistryState,
} from './runtime-base/l1/col/svc/ready.js'
import {
  initGateway,
  resetGateway,
  getGatewayState,
  isServiceCollabReady,
  bootstrapBusinessRouteCatalog,
  isBusinessRouteRegistryReady,
  getBusinessRouteCount,
} from './runtime-base/l1/host/biz/ready.js'
import {
  initMetadata,
  resetMetadata,
  getMetadataState,
} from './runtime-base/l1/mgmt/code/ready.js'
import {
  initAlert,
  resetAlert,
  getAlertState,
  isAlertDispositionReady,
} from './runtime-base/l1/host/alert/ready.js'
import {
  initKms,
  resetKms,
  getKmsState,
  isKmsReady,
} from './runtime-base/l1/mgmt/kms/client.js'
import {
  initMtls,
  shutdownMtls,
  getMtlsState,
  isMtlsReady,
} from './runtime-base/l1/mgmt/kms/mtls.js'
import {
  initRateLimiter,
  shutdownRateLimiter,
  startBucketCleanup,
  stopBucketCleanup,
  getRateLimiterState,
  isRateLimiterReady,
} from './runtime-base/l1/host/biz/rate-limiter.js'
import {
  initEwTraffic,
  shutdownEwTraffic,
  getEwTrafficState,
  isEwTrafficReady,
} from './runtime-base/l1/col/svc/ew-traffic-middleware.js'
import {
  initAudit,
  resetAudit,
  getAuditState,
  isAuditReady,
  recordAudit,
} from './runtime-base/l1/host/audit/ready.js'
import {
  initTracing,
  resetTracing,
  getTracingState,
  isTracingReady,
} from './runtime-base/l1/host/tracean/ready.js'
import {
  initRelease,
  resetRelease,
  getReleaseState,
  isReleaseReady,
  registerArtifact,
  promote,
} from './runtime-base/l1/host/rel/ready.js'
import {
  initFrontendHost,
  resetFrontendHost,
  getFrontendHostState,
  isFrontendHostReady,
} from './runtime-base/l1/mgmt/fesec/ready.js'
import {
  initApiContract,
  resetApiContract,
  getApiContractState,
  isApiContractReady,
  isContractGovernanceReady,
} from './runtime-base/l1/col/ctr/ready.js'
import {
  initDataPipeline,
  resetDataPipeline,
  getDataPipelineState,
  isDataPipelineReady,
  initDataSourceRegistry,
  resetDataSourceRegistry,
  listRegisteredSources,
} from './runtime-base/l1/host/acct/ready.js'
import {
  initTenantCollabService,
  resetTenantCollabService,
  isTenantCollabReady,
} from './runtime-base/l1/col/ten/ready.js'
import {
  initDataCollabService,
  resetDataCollabService,
  isDataCollabReady,
  initLineage,
  resetLineage,
} from './runtime-base/l1/col/data/ready.js'
import {
  initOpenCollab,
  resetOpenCollab,
  isOpenCollabReady,
} from './runtime-base/l1/pub/open/ready.js'
import {
  initChaos,
  resetChaos,
  getChaosState,
  isChaosReady,
} from './runtime-base/l1/host/resil/ready.js'
import { isElasticityReady, getElasticityState } from './runtime-base/l1/host/resil/ready.js'
import { isNotifyReady, isNotifyChannelRegistryReady } from './notify-service.js'
import { buildRuntimeBaseProjection, wireRuntimeModules, resetRuntimeModulesWiring } from './runtime-base/l0/coord/cmp/ready.js'
import { setBootstrapReadyFlags } from './runtime-base/l0/infra/init/ready.js'
import { listWiringRows } from './runtime-base/l0/coord/plt/ready.js'
import { isDomainEventBusReady, isEventCollabReady } from './runtime-base/l1/col/evt/ready.js'
import {
  initPerf,
  resetPerf,
  isPerfReady,
  getPerfState,
} from './runtime-base/l1/mgmt/perf/ready.js'
import {
  initIdempotency,
  resetIdempotency,
  isIdempotencyReady,
} from './runtime-base/l1/mgmt/fesec/ready.js'
import {
  initSecurityTelemetry,
  resetSecurityTelemetry,
  isSecurityTelemetryReady,
} from './runtime-base/l1/host/telem/ready.js'
import {
  initRiskControl,
  resetRiskControl,
  isRiskDispositionReady,
} from './runtime-base/l1/mgmt/risk/ready.js'
import {
  initRuleJudge,
  resetRuleJudge,
  isRiskPolicyBound,
} from './runtime-base/l1/host/rule/ready.js'
import {
  initFullChainLog,
  resetFullChainLog,
  isFullChainLogReady,
} from './runtime-base/l1/mgmt/trace/ready.js'
import {
  initBootDependencyGate,
  resetBootDependencyGate,
  registerBootProbe,
  markBootProbe,
  isBootDependencyGateOpen,
} from './runtime-base/l1/mgmt/boot/ready.js'
/** B18 五阶段 */
export type BootstrapPhase = 0 | 1 | 2 | 3 | 4

export const PHASE_NAMES: Record<BootstrapPhase, string> = {
  0: 'config_ready',
  1: 'database_ready',
  2: 'modules_registered',
  3: 'warmup',
  4: 'system_ready'
}

export type TaskStatus = 'pending' | 'ok' | 'skip' | 'failed'

export interface BootstrapTaskResult {
  id: string
  name: string
  status: TaskStatus
  durationMs: number
  skipReason?: string
  error?: string
}

export interface BootstrapPhaseResult {
  phase: BootstrapPhase
  name: string
  status: TaskStatus
  durationMs: number
  tasks: BootstrapTaskResult[]
}

export interface BootstrapState {
  ready: boolean
  trace_id: string
  configReady: boolean
  startedAt: string | null
  finishedAt: string | null
  totalDurationMs: number
  phases: BootstrapPhaseResult[]
  error?: string
}

export interface BootstrapContext {
  trace_id: string
  config: ServerConfig | null
  /** Phase2 可写入：上传目录等运行时路径 */
  uploadDir: string
}

/** 任务主动 skip 时抛出，由 runner 记为 skip（非失败） */
export class BootstrapSkipError extends Error {
  readonly skipReason: string
  constructor(reason: string) {
    super(reason)
    this.name = 'BootstrapSkipError'
    this.skipReason = reason
  }
}

type TaskFn = (ctx: BootstrapContext) => Promise<void> | void

export interface BootstrapTaskDef {
  id: string
  phase: BootstrapPhase
  name: string
  run: TaskFn
}

/** 生成 32 位 hex trace_id（W3C Trace Context 风格） */
export function createTraceId(): string {
  return uuidv4().replace(/-/g, '')
}

const state: BootstrapState = {
  ready: false,
  trace_id: '',
  configReady: false,
  startedAt: null,
  finishedAt: null,
  totalDurationMs: 0,
  phases: []
}

/** 任务注册表（权威清单） */
const taskRegistry: BootstrapTaskDef[] = []

/**
 * 注册 bootstrap 任务（同 id 覆盖）
 */
export function registerBootstrapTask(task: BootstrapTaskDef): void {
  const idx = taskRegistry.findIndex(t => t.id === task.id)
  if (idx >= 0) {
    taskRegistry[idx] = task
  } else {
    taskRegistry.push(task)
  }
}

function syncBootstrapReadyFlags(): void {
  setBootstrapReadyFlags({
    ready: state.ready,
    finished: Boolean(state.finishedAt),
    configReady: state.configReady,
  })
}

/**
 * 读取当前就绪态（供 /healthz/ready）
 */
export function getBootstrapState(): Readonly<BootstrapState> {
  return { ...state, phases: state.phases.map(p => ({ ...p, tasks: [...p.tasks] })) }
}

function resetState(trace_id: string): void {
  state.ready = false
  state.trace_id = trace_id
  state.configReady = false
  state.startedAt = new Date().toISOString()
  state.finishedAt = null
  state.totalDurationMs = 0
  state.phases = []
  state.error = undefined
}

/**
 * 登记内置五阶段任务（server 权威路径）
 */
function registerBuiltinTasks(): void {
  // —— Phase0 预检配置 ——
  registerBootstrapTask({
    id: 'cfg.load_validate',
    phase: 0,
    name: '加载并校验配置',
    run: (ctx) => {
      const config = getConfig()
      const rev = initConfigRevision(config.dataDir)
      // CI16/G04：kill-switch 武装则拒绝进入后续阶段（先于 configReady）
      if (config.killSwitchArmed) {
        throw new Error('CI16/G04 kill-switch armed：拒绝启动（清除 data/governance/kill-switch.on 或 CYP_KILL_SWITCH）')
      }
      // CI02：始终按生产基准初始化日志（敏感通道关闭）
      initLogger(rev.logLevel, true)
      ctx.config = config
      state.configReady = true
      // 启动审计：环境标识固定 prod（配置管控规范 9.1）
      console.log(`[CYP-memo] APP_ENV=${config.appEnv} NODE_ENV=${config.nodeEnv} version=${config.version}`)
      logger.info('bootstrap.phase0.config_ready', {
        trace_id: ctx.trace_id,
        appEnv: config.appEnv,
        port: config.port,
        dataDir: config.dataDir,
        logLevel: config.logLevel,
        configRevision: rev.version,
        nodeEnv: config.nodeEnv,
        version: config.version,
        timezone: config.timezone,
        machineIdPrefix: config.machineId.slice(0, 8),
        lbnBound: Boolean(config.lbnBindingCode),
      })
      logger.event('config.inject', {
        trace_id: ctx.trace_id,
        source: 'env+defaults',
        env: config.appEnv,
        result: 'success',
        validate: 'ok',
        items: 6,
      })
      // Phase0 存储空间门禁：配置注入后探测 dataDir 唯一根所在卷（R-010）
      const disk = getDiskSpace(config.dataDir)
      if (!disk) {
        throw new Error(`无法探测存储空间（dataDir 卷）: ${config.dataDir}（拒绝启动）`)
      }
      if (disk.available < MIN_DISK_SPACE_BYTES) {
        throw new Error(
          `存储空间不足: available=${disk.available} < ${MIN_DISK_SPACE_BYTES}（${config.dataDir}）`
        )
      }
      logger.info('bootstrap.phase0.storage_space', {
        trace_id: ctx.trace_id,
        dataDir: config.dataDir,
        used: disk.used,
        available: disk.available,
        total: disk.total,
      })
    }
  })

  // —— Phase0 · 基础设施资源（配置之后）——
  registerBootstrapTask({
    id: 'cfg.loadz_infra_resource',
    phase: 0,
    name: '登记基础设施资源服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetInfraResource()
      const infra = initInfraResource({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase0.infra_resource', {
        trace_id: ctx.trace_id,
        ready: infra.ready,
      })
    },
  })

  // —— Phase0 · KMS（配置之后、用密之前）——
  registerBootstrapTask({
    id: 'cfg.m_kms',
    phase: 0,
    name: '登记密钥保险箱（KMS）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetKms()
      const kms = initKms({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase0.kms', {
        trace_id: ctx.trace_id,
        ready: kms.ready,
        secretCount: kms.secretCount,
      })
    },
  })

  // —— Phase0 · mTLS（依赖 KMS SPIFFE 信任根 · 服务网格预埋）——
  registerBootstrapTask({
    id: 'cfg.m_mtls',
    phase: 0,
    name: 'mTLS 双向认证（服务网格预埋）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      shutdownMtls()
      const mtls = initMtls({
        dataDir: ctx.config.dataDir,
        serviceStableId: 'RB-L1-HOST-BIZ-01',
      })
      logger.info('bootstrap.phase0.mtls', {
        trace_id: ctx.trace_id,
        enabled: mtls.ok,
        reason: mtls.reason || 'ok',
      })
    },
  })

  // —— Phase1 基础 DB ——
  registerBootstrapTask({
    id: 'db.init_sqljs',
    phase: 1,
    name: 'sql.js 建库建表',
    run: async (ctx) => {
      // skipSeed：种子仅走 Phase2 唯一路径（INIT-SYS-07）
      await initDatabase({ skipSeed: true })
      if (!database.isHealthy()) {
        throw new Error('数据库初始化后健康检查失败')
      }
      logger.info('bootstrap.phase1.database_ready', {
        trace_id: ctx.trace_id,
        healthy: true
      })
    }
  })

  // —— Phase1 · 数据迁移（Schema 版本化）——
  registerBootstrapTask({
    id: 'db.migration',
    phase: 1,
    name: '登记并执行数据迁移服务',
    run: async (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetMigration()
      initMigration({
        dataDir: ctx.config.dataDir,
        execSql: (sql) => database.execSql(sql),
        queryApplied: () => database.listAppliedMigrationScripts(),
      })
      const result = await runPendingMigrations()
      logger.info('bootstrap.phase1.migration', {
        trace_id: ctx.trace_id,
        applied: result.applied,
        skipped: result.skipped,
        migrationsDir: result.migrationsDir,
        state: getMigrationState(),
      })
    },
  })

  // —— Phase1 · 文件存储（初始化规范：基础设施；唯一根 = dataDir/uploads）——
  registerBootstrapTask({
    id: 'db.z_file_storage',
    phase: 1,
    name: '登记文件存储服务（存储空间唯一根）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetFileStorage()
      const files = initFileStorage({ dataDir: ctx.config.dataDir })
      ctx.uploadDir = files.rootDir || path.join(ctx.config.dataDir, 'uploads')
      logger.info('bootstrap.phase1.file_storage', {
        trace_id: ctx.trace_id,
        rootDir: files.rootDir,
      })
    },
  })

  // —— Phase2 托管业务服务登记 ——
  registerBootstrapTask({
    id: 'mod.seed_owner',
    phase: 2,
    name: '空库唯一系统 Owner 种子（server 唯一种子路径）',
    run: (ctx) => {
      const seeded = database.ensureSystemOwnerSeed()
      logger.info('bootstrap.phase2.seed_owner', {
        trace_id: ctx.trace_id,
        seeded,
        path: 'users.role=owner',
        note: 'CFG-SYS-05：无 CYP_BOOTSTRAP_OWNER_PASSWORD 则跳过种子，走自助注册',
      })
    }
  })

  // —— Phase2 · INIT-SYS-04 鉴权 / 错误信封 / 码值登记 ——
  registerBootstrapTask({
    id: 'mod.auth_gate',
    phase: 2,
    name: '登记鉴权门面（Bearer + 权限守卫）',
    run: (ctx) => {
      if (typeof authenticate !== 'function' || typeof requirePermission !== 'function') {
        throw new Error('鉴权中间件未导出，禁止继续')
      }
      if (typeof sanitizeUser !== 'function') {
        throw new Error('sanitizeUser 未导出，禁止继续')
      }
      logger.info('bootstrap.phase2.auth_gate', {
        trace_id: ctx.trace_id,
        surface: 'authenticate+requirePermission+sanitizeUser',
        mount: 'app.use(/api, authenticate) @ index.ts',
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.error_envelope',
    phase: 2,
    name: '登记错误捕获与七字段信封',
    run: (ctx) => {
      if (typeof fail !== 'function' || typeof globalErrorHandler !== 'function') {
        throw new Error('错误信封未导出，禁止继续')
      }
      logger.info('bootstrap.phase2.error_envelope', {
        trace_id: ctx.trace_id,
        surface: 'fail+globalErrorHandler',
        fields: 'success,code,message,data,timestamp,request_id,trace_id',
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.metadata',
    phase: 2,
    name: '登记码值服务（含 Err 语义码表）',
    run: (ctx) => {
      resetMetadata()
      const meta = initMetadata()
      if (meta.entryCount < 8) {
        throw new Error(`码值服务过薄：仅 ${meta.entryCount} 条`)
      }
      // 信封 Err 仍作码值源；语义归属码值服务（非基础设施组件）
      const codes = Object.values(Err)
      logger.info('bootstrap.phase2.metadata', {
        trace_id: ctx.trace_id,
        entryCount: meta.entryCount,
        errCodes: codes.length,
        note: 'error codes = metadata semantics; not an infra component',
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.log',
    phase: 2,
    name: '登记系统日志服务',
    run: async (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetLog()
      resetObservabilityStore()
      const logsRoot = path.join(ctx.config.dataDir, 'logs')
      // R-015：独立观测库与核心业务 database.sqlite 分离；JSONL 仍为全量追加面
      const obs = await initObservabilityStore(logsRoot)
      initLog({
        service: 'cyp-memo-server',
        logsRoot,
        getDefaultTraceId: () =>
          getRequestTraceId() || getBootstrapState().trace_id || ctx.trace_id,
        persist: (row) => {
          // 仅 audit 进入核心业务库（由 resolveLogPersistTarget 保证）
          database.createLog(row)
        },
        persistObservability: (row) => {
          appendObservabilityLog(row)
        },
      })
      const cleaned = cleanupExpiredLogs(logsRoot)
      log({
        level: 'info',
        message: 'log component ready',
        type: 'runtime',
        action: 'log_ready',
        traceId: ctx.trace_id,
        context: {
          component: 'bootstrap',
          phase: 2,
          logsRoot,
          observabilityDb: obs.dbPath,
          cleaned: cleaned.deleted,
        },
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.alert',
    phase: 2,
    name: '登记告警服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetAlert()
      const alert = initAlert({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.alert', {
        trace_id: ctx.trace_id,
        ready: alert.ready,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.audit',
    phase: 2,
    name: '登记审计服务（人/管理行为）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetAudit()
      const audit = initAudit({ dataDir: ctx.config.dataDir })
      recordAudit({
        actor: 'system',
        action: 'bootstrap.audit_ready',
        resource: 'audit-service',
        detail: `trace=${ctx.trace_id}`,
      })
      logger.info('bootstrap.phase2.audit', {
        trace_id: ctx.trace_id,
        ready: audit.ready,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.tracing',
    phase: 2,
    name: '登记链路追踪服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetTracing()
      const tr = initTracing({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.tracing', {
        trace_id: ctx.trace_id,
        ready: tr.ready,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.release',
    phase: 2,
    name: '登记交付/发布服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetRelease()
      const rel = initRelease({ dataDir: ctx.config.dataDir })
      registerArtifact(ctx.config.version, 'bootstrap active artifact')
      if (!rel.activeVersion) {
        promote(ctx.config.version)
      }
      recordAudit({
        actor: 'system',
        action: 'release.register',
        resource: `version:${ctx.config.version}`,
      })
      logger.info('bootstrap.phase2.release', {
        trace_id: ctx.trace_id,
        state: getReleaseState(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.data_source_registry',
    phase: 2,
    name: '登记 G06 数据源目录',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetDataSourceRegistry()
      initDataSourceRegistry({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.data_source_registry', {
        trace_id: ctx.trace_id,
        count: listRegisteredSources().length,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.lineage',
    phase: 2,
    name: '登记 G07 血缘服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetLineage()
      initLineage({ dataDir: ctx.config.dataDir })
      resetTenantCollabService()
      initTenantCollabService({ dataDir: ctx.config.dataDir })
      resetDataCollabService()
      initDataCollabService({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.lineage', {
        trace_id: ctx.trace_id,
        ready: true,
        tenantCollab: isTenantCollabReady(),
        dataCollab: isDataCollabReady(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.pipeline',
    phase: 2,
    name: '登记数据管道管道服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetDataPipeline()
      const p = initDataPipeline({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.pipeline', {
        trace_id: ctx.trace_id,
        ready: p.ready,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.api_contract',
    phase: 2,
    name: '登记 API 契约契约服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetApiContract()
      const c = initApiContract({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.api_contract', {
        trace_id: ctx.trace_id,
        contractCount: c.contractCount,
      })
      resetOpenCollab()
      initOpenCollab({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.open_collab', {
        trace_id: ctx.trace_id,
        openCollabReady: isOpenCollabReady(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.env_isolation',
    phase: 2,
    name: '登记环境分支隔离服务',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetEnvIsolation()
      const e = initEnvIsolation({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.env_isolation', {
        trace_id: ctx.trace_id,
        ready: e.ready,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.frontend_host',
    phase: 2,
    name: '登记前端托管前端托管',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetFrontendHost()
      const distRoot = path.resolve(ctx.config.dataDir, '..', '..', 'app', 'dist')
      const fe = initFrontendHost({
        distRoot: fs.existsSync(distRoot) ? distRoot : undefined,
        version: ctx.config.version,
      })
      logger.info('bootstrap.phase2.frontend_host', {
        trace_id: ctx.trace_id,
        ready: fe.ready,
        distRoot: fe.distRoot,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.chaos',
    phase: 2,
    name: '登记混沌混沌服务（默认未武装）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetChaos()
      const ch = initChaos({ dataDir: ctx.config.dataDir })
      logger.info('bootstrap.phase2.chaos', {
        trace_id: ctx.trace_id,
        ready: ch.ready,
        emergencyStopped: ch.emergencyStopped,
        activeCount: ch.activeCount,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.registry',
    phase: 2,
    name: '登记服务注册（待命，成功后才入册）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetRegistry()
      const reg = initServiceRegistry({
        dataDir: ctx.config.dataDir,
        mode: ctx.config.serviceRegistryMode,
        consulAddr: ctx.config.consulHttpAddr,
        consulToken: ctx.config.consulHttpToken ?? undefined,
      })
      logger.info('bootstrap.phase2.registry', {
        trace_id: ctx.trace_id,
        ready: reg.ready,
        mode: reg.mode,
        note: 'no self-register until bootstrap success',
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.gateway',
    phase: 2,
    name: '登记网关服务',
    run: (ctx) => {
      resetGateway()
      // 版本探测必建：自动放行 api.github.com（禁止依赖手工 CYP_EGRESS_ALLOWLIST）
      const allow = registerEgressAutoAllow(['api.github.com'])
      const gw = initGateway({ serviceName: 'cyp-memo-server' })
      logger.info('bootstrap.phase2.gateway', {
        trace_id: ctx.trace_id,
        ready: gw.ready,
        egressAutoAllow: allow.includes('api.github.com'),
        egressAllowlistEffective: getEgressAllowlist(),
        versionProbe: 'required',
      })
    },
  })

  // —— Phase2 · 令牌桶限流（服务网格预埋）——
  registerBootstrapTask({
    id: 'mod.rate_limiter',
    phase: 2,
    name: '令牌桶限流器（服务网格预埋）',
    run: (ctx) => {
      shutdownRateLimiter()
      stopBucketCleanup()
      initRateLimiter()
      if (isRateLimiterReady()) {
        startBucketCleanup(60_000)
      }
      const state = getRateLimiterState()
      logger.info('bootstrap.phase2.rate_limiter', {
        trace_id: ctx.trace_id,
        enabled: state.enabled,
        policyCount: state.policyCount,
      })
    },
  })

  // —— Phase2 · East-West 流量管控中间件（服务网格预埋）——
  registerBootstrapTask({
    id: 'mod.ew_traffic',
    phase: 2,
    name: 'East-West 流量管控中间件（服务网格预埋）',
    run: (ctx) => {
      shutdownEwTraffic()
      initEwTraffic()
      const state = getEwTrafficState()
      logger.info('bootstrap.phase2.ew_traffic', {
        trace_id: ctx.trace_id,
        enabled: state.enabled,
        authMode: state.authMode,
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.business_route_catalog',
    phase: 2,
    name: '登记业务路由表（底座强制）',
    run: (ctx) => {
      const n = bootstrapBusinessRouteCatalog()
      if (!isBusinessRouteRegistryReady() || n < 1) {
        throw new Error(`业务路由表登记失败 count=${n}`)
      }
      logger.info('bootstrap.phase2.business_route_catalog', {
        trace_id: ctx.trace_id,
        routeCount: getBusinessRouteCount(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.sec_governance',
    phase: 2,
    name: '登记治理服务（G04/G21–G26）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetGovernance()
      const gov = initGovernance({
        dataDir: ctx.config.dataDir,
        lbnBindingCode: ctx.config.lbnBindingCode,
        machineId: ctx.config.machineId,
        expectedMachineId: process.env.CYP_EXPECTED_MACHINE_ID || null,
      })
      if (isKillSwitchActive() || !gov.machineBoundOk) {
        throw new Error(
          `治理服务阻断启动：killSwitch=${gov.killSwitch} machineBoundOk=${gov.machineBoundOk} reason=${gov.killSwitchReason || 'n/a'}`
        )
      }
      logger.info('bootstrap.phase2.governance', {
        trace_id: ctx.trace_id,
        machineIdPrefix: gov.machineId.slice(0, 8),
        lbnBound: Boolean(gov.lbnBindingCode),
        killSwitch: gov.killSwitch,
        state: getGovernanceState(),
      })
    },
  })

  // —— Phase2 · SIX-CACHE 嵌入式缓存组件登记 ——
  registerBootstrapTask({
    id: 'mod.cache',
    phase: 2,
    name: '登记嵌入式缓存组件（进程内）',
    run: (ctx) => {
      resetSystemCache()
      const cache = getSystemCache()
      cache.markRegistered()
      // 启动元数据进缓存（非 DB 权威；供健康/诊断）
      cache.set('bootstrap:trace_id', ctx.trace_id)
      cache.set('bootstrap:registered_at', Date.now())
      logger.info('bootstrap.phase2.cache', {
        trace_id: ctx.trace_id,
        stats: cache.stats(),
        note: 'embedded in-process; not Redis; desktop CacheManager is not the cache component'
      })
    }
  })

  // —— Phase2 · 全局消息队列（事件驱动 · embedded-mq）——
  registerBootstrapTask({
    id: 'mod.mq',
    phase: 2,
    name: '登记全局消息队列（进程内+outbox）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetSystemMq()
      const outboxPath = path.join(ctx.config.dataDir, 'mq', 'outbox.json')
      const mq = initSystemMq({ outboxPath, maxAttempts: 5 })
      mq.loadOutbox()
      const revived = mq.revivePendingToQueue()
      mq.markRegistered()
      logger.info('bootstrap.phase2.message', {
        trace_id: ctx.trace_id,
        outboxPath,
        revived,
        stats: mq.stats(),
        note: 'event-driven messaging; not time-driven schedule',
      })
    }
  })

  // —— Phase2 · 全局调度服务（时间驱动）——
  registerBootstrapTask({
    id: 'mod.schedule',
    phase: 2,
    name: '登记全局调度服务（Cron/延迟）',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetSchedule()
      const sched = initSchedule({
        dataDir: ctx.config.dataDir,
        tickIntervalMs: 5000,
      })
      logger.info('bootstrap.phase2.schedule', {
        trace_id: ctx.trace_id,
        jobCount: sched.jobCount,
        ready: sched.ready,
        note: 'time-driven only; health probes belong to governance',
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.runtime_modules_wire',
    phase: 2,
    name: '接线运行底座模块领域事件与⑧⑫',
    run: (ctx) => {
      if (!ctx.config) throw new Error('配置未就绪')
      resetRuntimeModulesWiring()
      wireRuntimeModules({ dataDir: ctx.config.dataDir, port: ctx.config.port })
      logger.info('bootstrap.phase2.runtime_modules_wire', {
        trace_id: ctx.trace_id,
        domainBus: isDomainEventBusReady(),
        elasticity: isElasticityReady(),
        notify: isNotifyReady(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.security_telemetry_risk',
    phase: 2,
    name: '登记态势采集、规则研判、风险处置与全链路',
    run: (ctx) => {
      resetSecurityTelemetry()
      initSecurityTelemetry({ dataDir: ctx.config?.dataDir })
      resetRuleJudge()
      initRuleJudge()
      resetRiskControl()
      initRiskControl({ dataDir: ctx.config?.dataDir })
      resetFullChainLog()
      initFullChainLog({ getDefaultTraceId: () => ctx.trace_id })
      logger.info('bootstrap.phase2.security_telemetry', {
        trace_id: ctx.trace_id,
        telem: isSecurityTelemetryReady(),
        rule: isRiskPolicyBound(),
        disposition: isRiskDispositionReady(),
        traceChain: isFullChainLogReady(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.idempotency',
    phase: 2,
    name: '登记请求防重（前端安全防护）',
    run: (ctx) => {
      resetIdempotency()
      initIdempotency()
      logger.info('bootstrap.phase2.idempotency', {
        trace_id: ctx.trace_id,
        ready: isIdempotencyReady(),
      })
    },
  })

  registerBootstrapTask({
    id: 'mod.perf',
    phase: 2,
    name: '登记性能运行管控（性能运行管控）',
    run: (ctx) => {
      const dataDir = ctx.config?.dataDir
      if (!dataDir) throw new Error('性能运行管控：配置未注入 dataDir')
      resetPerf()
      const snap = getConfigRevisionView().snapshot
      initPerf({ dataDir, sla: snap.perfSla })
      logger.info('bootstrap.phase2.perf', {
        trace_id: ctx.trace_id,
        ready: isPerfReady(),
        elasticity: isElasticityReady(),
        sla: getPerfState().sla,
      })
    },
  })

  // —— Phase3 校验/预热 ——
  registerBootstrapTask({
    id: 'warm.cache_snapshot',
    phase: 3,
    name: '缓存快照预热',
    run: (ctx) => {
      const cache = getSystemCache()
      if (!cache.isRegistered()) {
        throw new Error('缓存组件未登记，禁止预热')
      }
      // sql.js 全库已在 Phase1 热加载；进程内 KV 无落盘快照文件时显式 skip（INIT-SYS-05）
      const snap = cache.exportSnapshot('warmup')
      const keyCount = Object.keys(snap.entries).length
      if (keyCount === 0) {
        throw new BootstrapSkipError(
          'sql.js in-memory already hot; embedded KV has no persisted snapshot to restore'
        )
      }
      logger.info('bootstrap.phase3.cache_snapshot', {
        trace_id: ctx.trace_id,
        keyCount,
        stats: cache.stats()
      })
    }
  })

  registerBootstrapTask({
    id: 'warm.mq_revive',
    phase: 3,
    name: 'MQ outbox 恢复校验',
    run: (ctx) => {
      const mq = getSystemMq()
      if (!mq.isRegistered()) {
        throw new Error('消息队列未登记，禁止预热')
      }
      const stats = mq.stats()
      // 启动期仅校验登记与 outbox 可读；无 pending 时显式 skip
      if (stats.outboxPending === 0 && stats.queueDepth === 0) {
        throw new BootstrapSkipError('mq outbox empty; nothing to revive at warmup')
      }
      logger.info('bootstrap.phase3.mq_revive', {
        trace_id: ctx.trace_id,
        stats
      })
    }
  })

  registerBootstrapTask({
    id: 'warm.db_probe',
    phase: 3,
    name: 'DB 探针校验',
    run: (ctx) => {
      if (!database.isHealthy()) {
        throw new Error('Phase3 DB 探针失败')
      }
      logger.info('bootstrap.phase3.db_probe', {
        trace_id: ctx.trace_id,
        status: 'ok'
      })
    }
  })

  // —— Phase4 就绪 ——
  registerBootstrapTask({
    id: 'ready.mark',
    phase: 4,
    name: '标记系统就绪',
    run: (ctx) => {
      state.ready = true
      logger.info('bootstrap.phase4.system_ready', {
        trace_id: ctx.trace_id,
        ready: true
      })
      log({
        level: 'info',
        message: '系统 bootstrap 就绪',
        type: 'runtime',
        action: 'bootstrap_ready',
        traceId: ctx.trace_id,
        context: { status: 'ready' },
      })
    }
  })
}

async function runTask(
  task: BootstrapTaskDef,
  ctx: BootstrapContext
): Promise<BootstrapTaskResult> {
  const started = Date.now()
  try {
    await task.run(ctx)
    return {
      id: task.id,
      name: task.name,
      status: 'ok',
      durationMs: Date.now() - started
    }
  } catch (err) {
    if (err instanceof BootstrapSkipError) {
      logger.info('bootstrap.task.skip', {
        trace_id: ctx.trace_id,
        task_id: task.id,
        reason: err.skipReason
      })
      return {
        id: task.id,
        name: task.name,
        status: 'skip',
        durationMs: Date.now() - started,
        skipReason: err.skipReason
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: task.id,
      name: task.name,
      status: 'failed',
      durationMs: Date.now() - started,
      error: message
    }
  }
}

/**
 * 执行唯一 bootstrap 编排（失败不降级、不 listen）
 */
export async function runBootstrap(options?: {
  trace_id?: string
}): Promise<BootstrapState> {
  if (taskRegistry.length === 0) {
    registerBuiltinTasks()
  }

  const trace_id = options?.trace_id || createTraceId()
  resetState(trace_id)
  const wallStart = Date.now()

  const ctx: BootstrapContext = {
    trace_id,
    config: null,
    uploadDir: ''
  }

  logger.info('bootstrap.start', { trace_id })

  resetBootDependencyGate()
  initBootDependencyGate()
  for (const id of ['phase0', 'phase1', 'phase2', 'phase3', 'phase4'] as const) {
    registerBootProbe(id, id)
  }

  const phases: BootstrapPhase[] = [0, 1, 2, 3, 4]

  try {
    for (const phase of phases) {
      const phaseStart = Date.now()
      const tasks = taskRegistry
        .filter(t => t.phase === phase)
        .sort((a, b) => a.id.localeCompare(b.id))

      if (tasks.length === 0) {
        state.phases.push({
          phase,
          name: PHASE_NAMES[phase],
          status: 'skip',
          durationMs: 0,
          tasks: [{
            id: `phase${phase}.empty`,
            name: '无登记任务',
            status: 'skip',
            durationMs: 0,
            skipReason: 'registry empty for phase'
          }]
        })
        markBootProbe(`phase${phase}`, 'ok', 'empty phase')
        continue
      }

      const taskResults: BootstrapTaskResult[] = []
      let phaseFailed = false

      for (const task of tasks) {
        const result = await runTask(task, ctx)
        taskResults.push(result)
        logger.info('bootstrap.task', {
          trace_id,
          phase,
          task_id: task.id,
          status: result.status,
          durationMs: result.durationMs,
          skipReason: result.skipReason,
          error: result.error
        })
        if (result.status === 'failed') {
          phaseFailed = true
          break
        }
      }

      const phaseStatus: TaskStatus = phaseFailed
        ? 'failed'
        : taskResults.every(t => t.status === 'skip')
          ? 'skip'
          : 'ok'

      state.phases.push({
        phase,
        name: PHASE_NAMES[phase],
        status: phaseStatus,
        durationMs: Date.now() - phaseStart,
        tasks: taskResults
      })

      if (phaseFailed) {
        const failed = taskResults.find(t => t.status === 'failed')
        markBootProbe(`phase${phase}`, 'fail', failed?.error)
        throw new Error(
          `bootstrap Phase${phase}(${PHASE_NAMES[phase]}) 失败: ${failed?.error || 'unknown'}`
        )
      }
      markBootProbe(`phase${phase}`, 'ok')
    }

    state.ready = true
    state.finishedAt = new Date().toISOString()
    state.totalDurationMs = Date.now() - wallStart

    // 初始化成功后才向服务注册入册（SSOT：失败不得注册）
    try {
      if (ctx.config) {
        const inst = registerSelfAfterInit({
          serviceName: 'cyp-memo-server',
          instanceId: `cyp-memo-${ctx.config.machineId.slice(0, 12)}`,
          host: '127.0.0.1',
          port: ctx.config.port,
        })
        bindEmbeddedServiceCollab({ host: '127.0.0.1', port: ctx.config.port })

        // 跨系统编排：按角色注册多逻辑服务名（本地 + Consul 双模式）
        // gateway: 统一入口（5170 端口）
        // api: 业务 API（当前同端口，未来拆分独立端口）
        // kms: 密钥保险箱（当前嵌入式，未来独立端口）
        const baseTags = ctx.config.consulServiceTags
        const logicalServices = [
          {
            name: 'cyp-memo-gateway',
            role: 'gateway',
            healthPath: '/healthz/ready',
            port: ctx.config.port,
          },
          {
            name: 'cyp-memo-api',
            role: 'api',
            healthPath: '/api/health',
            port: ctx.config.port,
          },
          {
            name: 'cyp-memo-kms',
            role: 'kms',
            healthPath: '/healthz/ready',
            port: ctx.config.port,
          },
        ]

        const mid = ctx.config.machineId.slice(0, 12)
        for (const svc of logicalServices) {
          // 异步注册不阻塞主流程（Consul 不可达时降级为本地模式）
          registerService({
            serviceName: svc.name,
            instanceId: `${svc.name}-${mid}`,
            host: '127.0.0.1',
            port: svc.port,
            tags: [...baseTags, `role=${svc.role}`],
            version: ctx.config.version,
            healthCheckPath: svc.healthPath,
            healthCheckTtlSec: 30,
            meta: {
              role: svc.role,
              app: 'cyp-memo',
              machineId: mid,
            },
          }).catch((regErr) => {
            logger.warn('bootstrap.registry.logical_service_register_failed', {
              trace_id,
              serviceName: svc.name,
              error: regErr instanceof Error ? regErr.message : String(regErr),
            })
          })
        }

        logger.info('bootstrap.registry.self_register', {
          trace_id,
          instanceId: inst.instanceId,
          port: inst.port,
          serviceCollabGrants: serviceCollabGrantCount(),
          registryMode: getServiceRegistryState().mode,
        })
      }
    } catch (regErr) {
      logger.warn('bootstrap.registry.self_register_failed', {
        trace_id,
        error: regErr instanceof Error ? regErr.message : String(regErr),
      })
    }

    logger.info('bootstrap.summary', {
      trace_id,
      ready: true,
      totalDurationMs: state.totalDurationMs,
      phases: state.phases.map(p => ({
        phase: p.phase,
        name: p.name,
        status: p.status,
        durationMs: p.durationMs
      })),
      config: ctx.config
        ? {
            port: ctx.config.port,
            dataDir: ctx.config.dataDir,
            logLevel: ctx.config.logLevel,
            nodeEnv: ctx.config.nodeEnv,
            version: ctx.config.version,
            timezone: ctx.config.timezone
          }
        : null
    })

    if (ctx.config) {
      logger.startup(formatConfigInfo(ctx.config), { trace_id })
      console.log(formatStartupReportLine(ctx.config))
    }

    return getBootstrapState()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state.ready = false
    state.error = message
    state.finishedAt = new Date().toISOString()
    state.totalDurationMs = Date.now() - wallStart

    logger.error('bootstrap.failed', err, {
      trace_id,
      totalDurationMs: state.totalDurationMs,
      phases: state.phases.map(p => ({
        phase: p.phase,
        name: p.name,
        status: p.status,
        durationMs: p.durationMs
      }))
    })

    return getBootstrapState()
  }
}

/**
 * /healthz/ready 响应体
 */
let _readyRespCache: { at: number; statusCode: number; body: Record<string, unknown> } | null = null
const READY_RESP_TTL_MS = (() => {
  const n = Number(process.env.CYP_READY_RESPONSE_TTL_MS)
  return Number.isFinite(n) && n >= 0 ? n : 1000
})()

export function buildReadyResponse(): {
  statusCode: number
  body: Record<string, unknown>
} {
  const s = getBootstrapState()
  // 热点优化：就绪探针高频轮询时，整包投影（35 稳定 ID 就绪判定 + 接线 + 运行时态）重建成本高
  // （实测 p50≈2.5s）。健康态下以短窗 TTL 缓存整包；异常态始终实时返回，避免掩盖降级。
  if (_readyRespCache && s.ready && Date.now() - _readyRespCache.at < READY_RESP_TTL_MS) {
    return { statusCode: _readyRespCache.statusCode, body: _readyRespCache.body }
  }
  syncBootstrapReadyFlags()
  /** 统一运行底座投影：键＝35 稳定 ID；禁止读旧编制布尔 */
  const runtimeBase = buildRuntimeBaseProjection({ bootstrapReady: Boolean(s.ready) })
  const wiring = listWiringRows()
  const body = {
    success: s.ready,
    data: {
      ready: s.ready,
      trace_id: s.trace_id,
      configReady: s.configReady,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      totalDurationMs: s.totalDurationMs,
      /** 军械库统一运行底座投影（闭集 35 · V1.8.5） */
      runtimeBase,
      wiring,
      安全纵深: {
        原则: '永不信任，始终验证',
        不信任网络位置: true,
        公开面地址名单已启用: getZeroTrustStatus().publicAllowlistEnabled,
        公开面要求TLS: getZeroTrustStatus().publicTlsRequired,
        环回HTTP豁免: getZeroTrustStatus().loopbackHttpExempt,
        密钥保险箱: isKmsReady(),
        后端逐请求鉴权: Boolean(runtimeBase.items['RB-L1-MGMT-IAM-01']),
        公开接入安全: isPublicAccessSecurityReady(),
      },
      perf: getPerfState(),
      schedule: {
        jobCount: getScheduleState().jobCount,
        lastTickAt: getScheduleState().lastTickAt,
      },
      release: {
        activeVersion: getReleaseState().activeVersion,
        canaryWeight: getReleaseState().canaryWeight,
      },
      elasticity: getElasticityState(),
      phases: s.phases.map(p => ({
        phase: p.phase,
        name: p.name,
        status: p.status,
        durationMs: p.durationMs,
        tasks: p.tasks.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          durationMs: t.durationMs,
          skipReason: t.skipReason
        }))
      })),
      error: s.error
    }
  }
  const statusCode = s.ready ? 200 : 503
  // 仅健康态写入缓存（异常态始终实时，不写缓存以免恢复瞬间被旧缓存掩盖）
  if (s.ready) _readyRespCache = { at: Date.now(), statusCode, body }
  return { statusCode, body }
}
