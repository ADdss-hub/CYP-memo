/**
 * CYP-memo 全局调度服务（系统级 · 嵌入式 · 时间驱动）
 *
 * 边界红线：
 * - 专属：Cron / 延迟任务 / 触发与分派；回调状态写入日志服务
 * - 禁止：探活、摘除节点、拦截实时业务事件、承载业务逻辑本身
 * - 禁止：import governance / cache / mq 做探活或健康扫视
 *
 * 本服务只维护任务表与时钟，通过 handlerName 分派到已登记的轻量回调；
 * 系统内置回调仅打日志或调用日志服务清理接口，不内嵌业务域逻辑。
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { cleanupExpiredLogs, log as log } from '../../../l0/infra/log/ready.js'
import { shouldDeferScheduleForPerf } from '../../mgmt/perf/ready.js'

export type JobKind = 'cron' | 'delay'
export type JobRunStatus = 'idle' | 'running' | 'ok' | 'error' | 'done' | 'deferred'

export interface ScheduleJob {
  id: string
  kind: JobKind
  /** 简化 cron：星号/N（每 N 分钟）或 Ns / every:Ns（每 N 秒） */
  cronExpr?: string
  runAtMs?: number
  handlerName: string
  enabled: boolean
  system: boolean
  createdAt: string
  lastRunAt: string | null
  lastStatus: JobRunStatus
  lastError: string | null
  nextRunAt: number | null
}

export interface ScheduleState {
  ready: boolean
  dataDir: string | null
  tickIntervalMs: number
  lastTickAt: string | null
  startedAt: string | null
  jobCount: number
  enabledCount: number
}

type JobHandler = () => void | Promise<void>

interface PersistedJobsFile {
  version: 1
  jobs: Array<{
    id: string
    kind: JobKind
    cronExpr?: string
    runAtMs?: number
    handlerName: string
    enabled: boolean
    system: boolean
    createdAt: string
    lastRunAt: string | null
    lastStatus: JobRunStatus
    lastError: string | null
    nextRunAt: number | null
  }>
}

const DEFAULT_TICK_MS = 1_000
const SYSTEM_LOG_CLEANUP_ID = 'sys.log_cleanup'
const SYSTEM_HEARTBEAT_ID = 'sys.schedule_heartbeat'

const jobs = new Map<string, ScheduleJob>()
const handlers = new Map<string, JobHandler>()

/** Saga 补偿登记（运行底座接线 · memo.delete 等） */
export type SagaContext = Record<string, unknown>
export type SagaCompensateFn = (ctx: SagaContext) => void | Promise<void>
export type SagaForwardFn = (ctx: SagaContext) => void | Promise<void>
interface SagaReg {
  sagaType: string
  stepId: string
  compensate: SagaCompensateFn
}
const sagaRegs = new Map<string, SagaReg>()
function sagaKey(sagaType: string, stepId: string): string {
  return `${sagaType}::${stepId}`
}
function sagaRegistryPath(): string {
  if (!schedState.dataDir) throw new Error('schedule dataDir unset')
  return path.join(schedState.dataDir, 'schedule', 'saga-registry.json')
}

const schedState: {
  ready: boolean
  dataDir: string | null
  tickIntervalMs: number
  lastTickAt: string | null
  startedAt: string | null
  tickTimer: ReturnType<typeof setInterval> | null
  running: Set<string>
} = {
  ready: false,
  dataDir: null,
  tickIntervalMs: DEFAULT_TICK_MS,
  lastTickAt: null,
  startedAt: null,
  tickTimer: null,
  running: new Set(),
}

function nowIso(): string {
  return new Date().toISOString()
}

function scheduleDir(): string | null {
  if (!schedState.dataDir) return null
  return path.join(schedState.dataDir, 'schedule')
}

function jobsFilePath(): string | null {
  const dir = scheduleDir()
  return dir ? path.join(dir, 'jobs.json') : null
}

function ensureScheduleDir(): void {
  const dir = scheduleDir()
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 解析简化调度表达式，返回间隔毫秒。
 * 支持：
 * - 星号/N 或 星号/N * * * * → 每 N 分钟
 * - Ns / Nm → 每 N 秒 / 分钟
 * - every:Ns / @every Ns → 每 N 秒
 */
export function parseSimpleCronIntervalMs(expr: string): number {
  const raw = String(expr || '').trim()
  if (!raw) throw new Error('cronExpr empty')

  const everySec = raw.match(/^(?:@?every:?)\s*(\d+)\s*s$/i)
  if (everySec) {
    const n = Number(everySec[1])
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid interval: ${raw}`)
    return n * 1000
  }

  const everyMin = raw.match(/^(?:@?every:?)\s*(\d+)\s*m(?:in(?:ute)?s?)?$/i)
  if (everyMin) {
    const n = Number(everyMin[1])
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid interval: ${raw}`)
    return n * 60_000
  }

  const plainSec = raw.match(/^(\d+)\s*s$/i)
  if (plainSec) {
    const n = Number(plainSec[1])
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid interval: ${raw}`)
    return n * 1000
  }

  const plainMin = raw.match(/^(\d+)\s*m$/i)
  if (plainMin) {
    const n = Number(plainMin[1])
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid interval: ${raw}`)
    return n * 60_000
  }

  // 星号/N 或标准五段中的分钟位 星号/N * * * *
  const starSlash = raw.match(/^\*\/(\d+)(?:\s+\*\s+\*\s+\*\s+\*)?$/)
  if (starSlash) {
    const n = Number(starSlash[1])
    if (!Number.isFinite(n) || n < 1) throw new Error(`invalid cron star/N: ${raw}`)
    return n * 60_000
  }

  throw new Error(`unsupported cronExpr (use star/N minutes or Ns): ${raw}`)
}

function computeNextCronRun(cronExpr: string, fromMs = Date.now()): number {
  const interval = parseSimpleCronIntervalMs(cronExpr)
  return fromMs + interval
}

function snapshotJob(job: ScheduleJob): ScheduleJob {
  return { ...job }
}

function persistJobs(): void {
  const file = jobsFilePath()
  if (!file) return
  try {
    ensureScheduleDir()
    const payload: PersistedJobsFile = {
      version: 1,
      jobs: Array.from(jobs.values()).map((j) => ({
        id: j.id,
        kind: j.kind,
        cronExpr: j.cronExpr,
        runAtMs: j.runAtMs,
        handlerName: j.handlerName,
        enabled: j.enabled,
        system: j.system,
        createdAt: j.createdAt,
        lastRunAt: j.lastRunAt,
        lastStatus: j.lastStatus,
        lastError: j.lastError,
        nextRunAt: j.nextRunAt,
      })),
    }
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8')
  } catch (err) {
    log({
      level: 'warn',
      message: 'schedule jobs persist failed',
      type: 'runtime',
      action: 'schedule_persist_error',
      context: {
        component: 'schedule-service',
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

function loadPersistedJobs(): void {
  const file = jobsFilePath()
  if (!file || !fs.existsSync(file)) return
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as PersistedJobsFile
    if (!parsed || !Array.isArray(parsed.jobs)) return
    for (const row of parsed.jobs) {
      if (!row?.id || !row.handlerName) continue
      // 系统任务由 init 重新登记，避免旧表达式覆盖内置默认
      if (row.system) continue
      if (row.kind === 'delay' && row.lastStatus === 'done') continue
      const job: ScheduleJob = {
        id: String(row.id),
        kind: row.kind === 'delay' ? 'delay' : 'cron',
        cronExpr: row.cronExpr,
        runAtMs: row.runAtMs,
        handlerName: String(row.handlerName),
        enabled: row.enabled !== false,
        system: false,
        createdAt: row.createdAt || nowIso(),
        lastRunAt: row.lastRunAt ?? null,
        lastStatus: row.lastStatus || 'idle',
        lastError: row.lastError ?? null,
        nextRunAt: row.nextRunAt ?? null,
      }
      if (job.kind === 'cron' && job.cronExpr) {
        if (job.nextRunAt == null || job.nextRunAt < Date.now()) {
          job.nextRunAt = computeNextCronRun(job.cronExpr)
        }
      }
      if (job.kind === 'delay' && job.runAtMs != null) {
        job.nextRunAt = job.runAtMs
      }
      jobs.set(job.id, job)
    }
  } catch (err) {
    log({
      level: 'warn',
      message: 'schedule jobs load failed',
      type: 'runtime',
      action: 'schedule_load_error',
      context: {
        component: 'schedule-service',
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

function registerBuiltinHandlers(): void {
  handlers.set('log_cleanup', () => {
    const logsRoot = schedState.dataDir ? path.join(schedState.dataDir, 'logs') : undefined
    const result = cleanupExpiredLogs(logsRoot)
    log({
      level: 'info',
      message: 'schedule dispatched log_cleanup',
      type: 'runtime',
      action: 'schedule_job_callback',
      context: {
        component: 'schedule-service',
        handlerName: 'log_cleanup',
        deleted: result.deleted,
        audited: result.audited,
      },
    })
  })

  handlers.set('schedule_heartbeat', () => {
    log({
      level: 'info',
      message: 'schedule heartbeat',
      type: 'runtime',
      action: 'schedule_heartbeat',
      context: {
        component: 'schedule-service',
        jobCount: jobs.size,
        ready: schedState.ready,
      },
    })
  })
}

function upsertSystemCron(id: string, cronExpr: string, handlerName: string): void {
  const existing = jobs.get(id)
  const nextRunAt = computeNextCronRun(cronExpr)
  if (existing) {
    existing.kind = 'cron'
    existing.cronExpr = cronExpr
    existing.handlerName = handlerName
    existing.enabled = true
    existing.system = true
    if (existing.nextRunAt == null || existing.nextRunAt < Date.now()) {
      existing.nextRunAt = nextRunAt
    }
    return
  }
  jobs.set(id, {
    id,
    kind: 'cron',
    cronExpr,
    handlerName,
    enabled: true,
    system: true,
    createdAt: nowIso(),
    lastRunAt: null,
    lastStatus: 'idle',
    lastError: null,
    nextRunAt,
  })
}

function logJobStatus(
  job: ScheduleJob,
  status: JobRunStatus,
  extra?: Record<string, unknown>
): void {
  log({
    level: status === 'error' ? 'error' : 'info',
    message: `schedule job ${status}`,
    type: 'runtime',
    action: 'schedule_job_status',
    context: {
      component: 'schedule-service',
      jobId: job.id,
      handlerName: job.handlerName,
      kind: job.kind,
      status,
      lastError: job.lastError,
      ...extra,
    },
  })
}

async function runJob(job: ScheduleJob, reason: 'tick' | 'trigger'): Promise<void> {
  if (schedState.running.has(job.id)) return
  /** 心跳类系统任务不推迟，其余自动 tick 受性能运行管控约束 */
  const exempt = job.id === 'sys.schedule_heartbeat' || job.handlerName === 'schedule_heartbeat'
  if (reason === 'tick' && !exempt) {
    const gate = shouldDeferScheduleForPerf()
    if (gate.defer) {
      job.lastStatus = 'deferred'
      job.lastError = gate.reason
      job.lastRunAt = nowIso()
      logJobStatus(job, 'deferred', { reason, perfGate: gate.reason })
      persistJobs()
      return
    }
  }
  const handler = handlers.get(job.handlerName)
  if (!handler) {
    job.lastStatus = 'error'
    job.lastError = `handler not registered: ${job.handlerName}`
    job.lastRunAt = nowIso()
    logJobStatus(job, 'error', { reason })
    persistJobs()
    return
  }

  schedState.running.add(job.id)
  job.lastStatus = 'running'
  job.lastError = null
  job.lastRunAt = nowIso()
  logJobStatus(job, 'running', { reason })

  try {
    await Promise.resolve(handler())
    if (job.kind === 'delay') {
      job.lastStatus = 'done'
      job.enabled = false
      job.nextRunAt = null
    } else {
      job.lastStatus = 'ok'
      if (job.cronExpr) {
        job.nextRunAt = computeNextCronRun(job.cronExpr)
      }
    }
    logJobStatus(job, job.lastStatus, { reason })
  } catch (err) {
    job.lastStatus = 'error'
    job.lastError = err instanceof Error ? err.message : String(err)
    if (job.kind === 'cron' && job.cronExpr) {
      job.nextRunAt = computeNextCronRun(job.cronExpr)
    }
    logJobStatus(job, 'error', { reason })
  } finally {
    schedState.running.delete(job.id)
    persistJobs()
  }
}

function tick(): void {
  if (!schedState.ready) return
  schedState.lastTickAt = nowIso()
  const now = Date.now()
  for (const job of jobs.values()) {
    if (!job.enabled) continue
    if (job.nextRunAt == null) continue
    if (job.nextRunAt > now) continue
    void runJob(job, 'tick')
  }
}

function startTicker(intervalMs: number): void {
  if (schedState.tickTimer) {
    clearInterval(schedState.tickTimer)
    schedState.tickTimer = null
  }
  schedState.tickIntervalMs = Math.max(200, intervalMs)
  schedState.tickTimer = setInterval(() => {
    try {
      tick()
    } catch (err) {
      log({
        level: 'error',
        message: 'schedule tick failed',
        type: 'runtime',
        action: 'schedule_tick_error',
        context: {
          component: 'schedule-service',
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }, schedState.tickIntervalMs)
  if (typeof schedState.tickTimer === 'object' && schedState.tickTimer && 'unref' in schedState.tickTimer) {
    ;(schedState.tickTimer as NodeJS.Timeout).unref()
  }
}

/** 登记命名回调（供内置或宿主注入；禁止在此写入业务域逻辑） */
export function registerJobHandler(name: string, handler: JobHandler): void {
  if (!name || typeof handler !== 'function') {
    throw new Error('registerJobHandler requires name and function')
  }
  handlers.set(name, handler)
}

export function registerCron(id: string, cronExpr: string, handlerName: string): ScheduleJob {
  if (!id) throw new Error('registerCron: id required')
  if (!handlerName) throw new Error('registerCron: handlerName required')
  parseSimpleCronIntervalMs(cronExpr)
  const nextRunAt = computeNextCronRun(cronExpr)
  const existing = jobs.get(id)
  const job: ScheduleJob = existing
    ? {
        ...existing,
        kind: 'cron',
        cronExpr,
        handlerName,
        enabled: true,
        nextRunAt,
        lastStatus: existing.lastStatus === 'done' ? 'idle' : existing.lastStatus,
      }
    : {
        id,
        kind: 'cron',
        cronExpr,
        handlerName,
        enabled: true,
        system: false,
        createdAt: nowIso(),
        lastRunAt: null,
        lastStatus: 'idle',
        lastError: null,
        nextRunAt,
      }
  jobs.set(id, job)
  persistJobs()
  log({
    level: 'info',
    message: 'schedule cron registered',
    type: 'runtime',
    action: 'schedule_register_cron',
    context: { component: 'schedule-service', jobId: id, cronExpr, handlerName },
  })
  return snapshotJob(job)
}

export function registerDelay(id: string, runAtMs: number, handlerName: string): ScheduleJob {
  if (!id) throw new Error('registerDelay: id required')
  if (!handlerName) throw new Error('registerDelay: handlerName required')
  if (!Number.isFinite(runAtMs)) throw new Error('registerDelay: runAtMs invalid')
  const existing = jobs.get(id)
  const job: ScheduleJob = existing
    ? {
        ...existing,
        kind: 'delay',
        cronExpr: undefined,
        runAtMs,
        handlerName,
        enabled: true,
        nextRunAt: runAtMs,
        lastStatus: 'idle',
        lastError: null,
      }
    : {
        id,
        kind: 'delay',
        runAtMs,
        handlerName,
        enabled: true,
        system: false,
        createdAt: nowIso(),
        lastRunAt: null,
        lastStatus: 'idle',
        lastError: null,
        nextRunAt: runAtMs,
      }
  jobs.set(id, job)
  persistJobs()
  log({
    level: 'info',
    message: 'schedule delay registered',
    type: 'runtime',
    action: 'schedule_register_delay',
    context: { component: 'schedule-service', jobId: id, runAtMs, handlerName },
  })
  return snapshotJob(job)
}

/** 立即触发一次 */
export function trigger(id: string): boolean {
  const job = jobs.get(id)
  if (!job) return false
  void runJob(job, 'trigger')
  return true
}

export function listJobs(): ScheduleJob[] {
  return Array.from(jobs.values())
    .map(snapshotJob)
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getScheduleState(): ScheduleState {
  let enabledCount = 0
  for (const j of jobs.values()) {
    if (j.enabled) enabledCount += 1
  }
  return {
    ready: schedState.ready,
    dataDir: schedState.dataDir,
    tickIntervalMs: schedState.tickIntervalMs,
    lastTickAt: schedState.lastTickAt,
    startedAt: schedState.startedAt,
    jobCount: jobs.size,
    enabledCount,
  }
}

export function isScheduleReady(): boolean {
  return schedState.ready === true
}

/**
 * Phase2 登记调度服务：内存任务表 + 可选落盘 {dataDir}/schedule/jobs.json
 */
export function initSchedule(opts: {
  dataDir: string
  /** 时钟滴答间隔，默认 1000ms */
  tickIntervalMs?: number
}): ScheduleState {
  schedState.dataDir = opts.dataDir
  ensureScheduleDir()
  jobs.clear()
  schedState.running.clear()
  registerBuiltinHandlers()
  loadPersistedJobs()

  // 内置系统任务：日志清理（每 60 分钟）+ 心跳（每 60 秒）
  upsertSystemCron(SYSTEM_LOG_CLEANUP_ID, '*/60', 'log_cleanup')
  upsertSystemCron(SYSTEM_HEARTBEAT_ID, '60s', 'schedule_heartbeat')

  persistJobs()
  schedState.startedAt = nowIso()
  schedState.ready = true
  startTicker(opts.tickIntervalMs ?? DEFAULT_TICK_MS)

  log({
    level: 'info',
    message: 'schedule ready',
    type: 'runtime',
    action: 'schedule_ready',
    context: {
      component: 'schedule-service',
      tickIntervalMs: schedState.tickIntervalMs,
      jobCount: jobs.size,
      systemJobs: [SYSTEM_LOG_CLEANUP_ID, SYSTEM_HEARTBEAT_ID],
    },
  })

  return getScheduleState()
}

export function resetSchedule(): void {
  if (schedState.tickTimer) {
    clearInterval(schedState.tickTimer)
    schedState.tickTimer = null
  }
  jobs.clear()
  handlers.clear()
  schedState.running.clear()
  schedState.ready = false
  schedState.dataDir = null
  schedState.lastTickAt = null
  schedState.startedAt = null
  schedState.tickIntervalMs = DEFAULT_TICK_MS
}

/** @deprecated 探活已移出调度服务；保留空操作以免旧调用崩（主会话接 bootstrap 后可删） */
export function sweepSchedule(): ScheduleState {
  return getScheduleState()
}

/** @deprecated 初始化探测不属于调度服务 */
export function setScheduleBootProbe(_fn: unknown): void {
  // no-op
}

export function registerSagaCompensation(
  sagaType: string,
  stepId: string,
  compensate: SagaCompensateFn
): void {
  sagaRegs.set(sagaKey(sagaType, stepId), { sagaType, stepId, compensate })
  if (schedState.dataDir) {
    const dir = path.join(schedState.dataDir, 'schedule')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const rows = [...sagaRegs.values()].map(r => ({ sagaType: r.sagaType, stepId: r.stepId }))
    fs.writeFileSync(sagaRegistryPath(), JSON.stringify({ version: 1, steps: rows }, null, 2), 'utf-8')
  }
}

/**
 * 执行已登记 Saga：正向步骤失败则逆序调用补偿（禁止空补偿占位）。
 */
export async function executeSaga(
  sagaType: string,
  ctx: SagaContext,
  forwards: Array<{ stepId: string; forward: SagaForwardFn }>
): Promise<void> {
  const { publishDomainEvent } = await import('../../col/evt/ready.js')
  const sagaId = `${sagaType}:${Date.now().toString(36)}`
  publishDomainEvent('SagaStarted', 3, { sagaId, sagaType, steps: forwards.map((s) => s.stepId) }, 'info')
  const done: string[] = []
  try {
    for (const step of forwards) {
      try {
        await step.forward(ctx)
        done.push(step.stepId)
      } catch (err) {
        publishDomainEvent(
          'SagaStepFailed',
          3,
          { sagaId, sagaType, stepId: step.stepId, error: err instanceof Error ? err.message : String(err) },
          'error'
        )
        throw err
      }
    }
  } catch (err) {
    for (const stepId of [...done].reverse()) {
      const reg = sagaRegs.get(sagaKey(sagaType, stepId))
      if (!reg) continue
      try {
        await reg.compensate(ctx)
      } catch (compErr) {
        log({
          level: 'error',
          type: 'runtime',
          message: `saga compensate failed ${sagaType}/${stepId}`,
          action: 'saga_compensate_fail',
          context: { err: String(compErr) },
        })
      }
    }
    publishDomainEvent(
      'SagaCompensated',
      3,
      { sagaId, sagaType, compensated: [...done].reverse() },
      'warn'
    )
    throw err
  }
}

export function ready_rb_l1_host_sched_01(): boolean {
  return isScheduleReady()
}
