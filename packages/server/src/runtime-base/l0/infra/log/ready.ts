/**
 * CYP-memo 系统日志服务（嵌入式 · SIX-LOG / B15 · LC18–LC21）
 * 统一 log()：控制台 + DB + 按类型目录分片；敏感字段脱敏；与 Trace 同信封
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 禁止直接 import sqlite-database（避免环依赖）；persist 由 bootstrap 注入。
 */

import fs from 'fs'
import path from 'path'
import type { CreateLogParams } from '../../../../types.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** @deprecated 兼容旧名；请用 LogLevel */
export type LogLevelName = LogLevel

export type LogType =
  | 'runtime'
  | 'error'
  | 'access'
  | 'audit'
  | 'security'
  | 'business'
  | 'debug'
  | 'perf'
  | 'trace'
  | 'ci'

export interface LogInput {
  level: LogLevel
  message: string
  service?: string
  type?: LogType
  traceId?: string
  spanId?: string
  userId?: string | null
  action?: string | null
  context?: Record<string, unknown>
}

export interface LogEnvelope {
  ts: string
  level: LogLevel
  message: string
  service: string
  type: LogType
  traceId?: string
  spanId?: string
  userId?: string | null
  action?: string | null
  context?: Record<string, unknown>
}

const FULL_MASK_KEYS = new Set([
  'password',
  'passwd',
  'passwordhash',
  'secret',
  'apikey',
  'privatekey',
])

const TOKEN_LIKE_KEYS = new Set(['token', 'authorization', 'accesstoken', 'refreshtoken'])

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase()
}

function classifySensitive(key: string): 'full' | 'token' | null {
  const k = normalizeKey(key)
  if (FULL_MASK_KEYS.has(k)) return 'full'
  if (TOKEN_LIKE_KEYS.has(k)) return 'token'
  if (k.includes('password') || k.includes('passwd')) return 'full'
  if (k.includes('secret') || k.includes('apikey') || k.includes('privatekey')) return 'full'
  if (k.includes('token') && !k.includes('traceid')) return 'token'
  if (k.includes('authorization')) return 'token'
  return null
}

function maskTokenLike(value: unknown): string {
  if (value == null) return '***'
  const s = String(value)
  if (s.length <= 4) return '***'
  return `${s.slice(0, 4)}***`
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  try {
    if (depth > 8) return '[MaxDepth]'
    if (value == null) return value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }
    if (Array.isArray(value)) {
      return value.map((v) => redactSensitive(v, depth + 1))
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const kind = classifySensitive(key)
        if (kind === 'full') {
          out[key] = '***'
        } else if (kind === 'token') {
          out[key] = maskTokenLike(raw)
        } else {
          out[key] = redactSensitive(raw, depth + 1)
        }
      }
      return out
    }
    return String(value)
  } catch {
    return undefined
  }
}

export function buildLogEnvelope(input: LogInput, defaultService = 'cyp-memo-server'): LogEnvelope {
  const redactedCtx =
    input.context !== undefined
      ? (redactSensitive(input.context) as Record<string, unknown> | undefined)
      : undefined

  return {
    ts: new Date().toISOString(),
    level: input.level,
    message: input.message,
    service: input.service || defaultService,
    type: input.type || 'runtime',
    traceId: input.traceId,
    spanId: input.spanId,
    userId: input.userId ?? null,
    action: input.action ?? null,
    context: redactedCtx,
  }
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LOG_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: '📋',
  warn: '⚠️',
  error: '❌',
}

/** LC18：十类标准类型 */
export const LOG_TYPES: readonly LogType[] = [
  'debug',
  'runtime',
  'error',
  'access',
  'audit',
  'business',
  'security',
  'perf',
  'trace',
  'ci',
] as const

/** LC20：按类型热存天数（可被配置管控热变更覆盖） */
const DEFAULT_RETENTION_DAYS: Record<LogType, number> = {
  debug: 1,
  runtime: 7,
  error: 30,
  access: 15,
  audit: 365,
  business: 30,
  security: 365,
  perf: 30,
  trace: 7,
  ci: 7,
}

const RETENTION_DAYS: Record<LogType, number> = { ...DEFAULT_RETENTION_DAYS }

export interface LogPersistRow extends CreateLogParams {
  traceId?: string | null
}

export interface LogOptions {
  /** 核心业务库：仅 audit / security（R-015） */
  persist: (row: LogPersistRow) => void
  /** 独立观测库：运维可检索流水（与 database.sqlite 分离） */
  persistObservability?: (row: LogPersistRow) => void
  service?: string
  getDefaultTraceId?: () => string | undefined
  /** LC19 根目录：通常为 `{dataDir}/logs` */
  logsRoot?: string
}

interface LogState {
  ready: boolean
  level: LogLevel
  isProduction: boolean
  /** LC03：INFO 采样百分率 1–100；100=全量 */
  infoSamplePercent: number
  service: string
  persist: ((row: LogPersistRow) => void) | null
  persistObservability: ((row: LogPersistRow) => void) | null
  getDefaultTraceId: (() => string | undefined) | null
  logsRoot: string | null
  lastWrite: Partial<Record<LogType, number>>
}

const state: LogState = {
  ready: false,
  level: 'info',
  isProduction: true,
  infoSamplePercent: 100,
  service: 'cyp-memo-server',
  persist: null,
  persistObservability: null,
  getDefaultTraceId: null,
  logsRoot: null,
  lastWrite: {},
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[state.level]
}

function formatLine(level: LogLevel, message: string, envelope: Record<string, unknown>): string {
  const timestamp = new Date().toISOString()
  const icon = LOG_ICONS[level]
  return `[${timestamp}] ${icon} [${level.toUpperCase()}] ${message} ${JSON.stringify(envelope)}`
}

function emitConsole(level: LogLevel, line: string): void {
  switch (level) {
    case 'debug':
      console.debug(line)
      break
    case 'info':
      console.info(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
  }
}

function shanghaiDateStamp(d = new Date()): string {
  // Asia/Shanghai 日历日（LC20）
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${day}`
}

/** LC19：ensure-dirs */
export function ensureLogTypeDirs(logsRoot: string): string[] {
  const created: string[] = []
  if (!fs.existsSync(logsRoot)) {
    fs.mkdirSync(logsRoot, { recursive: true })
    created.push(logsRoot)
  }
  for (const t of LOG_TYPES) {
    const dir = path.join(logsRoot, t)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      created.push(dir)
    }
  }
  return created
}

function appendTypeFile(type: LogType, line: string): void {
  if (!state.logsRoot) return
  // 生产默认关闭 debug 落盘（LC18 + CI02）
  if (type === 'debug' && state.isProduction) return
  const dir = path.join(state.logsRoot, type)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${shanghaiDateStamp()}.log`)
  fs.appendFileSync(file, line + '\n', 'utf-8')
  state.lastWrite[type] = Date.now()
}

/** LC21：按保留期清理过期分片；返回删除数量 */
export function cleanupExpiredLogs(logsRoot?: string): { deleted: number; audited: boolean } {
  const root = logsRoot || state.logsRoot
  if (!root || !fs.existsSync(root)) return { deleted: 0, audited: false }
  let deleted = 0
  const now = Date.now()
  for (const t of LOG_TYPES) {
    const dir = path.join(root, t)
    if (!fs.existsSync(dir)) continue
    const keepMs = RETENTION_DAYS[t] * 24 * 60 * 60 * 1000
    for (const name of fs.readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (now - st.mtimeMs > keepMs) {
        fs.unlinkSync(full)
        deleted += 1
      }
    }
  }
  if (deleted > 0) {
    const auditDir = path.join(root, 'audit')
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true })
    const auditLine = JSON.stringify({
      ts: new Date().toISOString(),
      action: 'log_cleanup',
      deleted,
      actor: 'log-service',
    })
    fs.appendFileSync(path.join(auditDir, `${shanghaiDateStamp()}.log`), auditLine + '\n', 'utf-8')
  }
  return { deleted, audited: deleted > 0 }
}

export function getLogTypeHeartbeats(): Partial<Record<LogType, number>> {
  return { ...state.lastWrite }
}

export function setLogLevel(level: LogLevel): void {
  state.level = level
}

/** LC03 INFO 采样；非法值拒绝 */
export function setLogInfoSamplePercent(percent: number): number {
  const n = Math.round(Number(percent))
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    throw new Error('infoSamplePercent 须在 1–100')
  }
  state.infoSamplePercent = n
  return n
}

export function getLogInfoSamplePercent(): number {
  return state.infoSamplePercent
}

export function getLogRetentionDays(): Record<LogType, number> {
  return { ...RETENTION_DAYS }
}

/** 覆盖部分类型保留期；未知类型忽略；天数须 ≥1 */
export function setLogRetentionDays(patch: Partial<Record<LogType, number>>): Record<LogType, number> {
  for (const t of LOG_TYPES) {
    if (patch[t] === undefined) continue
    const days = Math.round(Number(patch[t]))
    if (!Number.isFinite(days) || days < 1) {
      throw new Error(`retentionDays.${t} 须为正整数`)
    }
    RETENTION_DAYS[t] = days
  }
  return getLogRetentionDays()
}

export function resetLogRetentionDays(): void {
  for (const t of LOG_TYPES) RETENTION_DAYS[t] = DEFAULT_RETENTION_DAYS[t]
}

export function setLogProduction(isProduction: boolean): void {
  state.isProduction = isProduction
}

export function setPersist(persist: (row: LogPersistRow) => void): void {
  state.persist = persist
  state.ready = true
}

export function isLogReady(): boolean {
  return state.ready && state.persist !== null
}

export function resetLog(): void {
  state.ready = false
  state.persist = null
  state.persistObservability = null
  state.getDefaultTraceId = null
  state.logsRoot = null
  state.lastWrite = {}
  state.infoSamplePercent = 100
  resetLogRetentionDays()
}

export function initLog(opts: LogOptions): void {
  state.persist = opts.persist
  state.persistObservability = opts.persistObservability || null
  state.service = opts.service || 'cyp-memo-server'
  state.getDefaultTraceId = opts.getDefaultTraceId || null
  state.logsRoot = opts.logsRoot || null
  if (state.logsRoot) {
    ensureLogTypeDirs(state.logsRoot)
    cleanupExpiredLogs(state.logsRoot)
  }
  state.ready = true
}

/**
 * R-015：写路径分流
 * - audit → 核心业务库（低频账号/操作审计）
 * - security / runtime / error / business → 独立观测库（运维安全与运行流水，含告警拨号）
 * - access / perf / domain-event-bus / debug / trace / ci → 仅 JSONL
 */
export function resolveLogPersistTarget(
  envelope: Pick<LogEnvelope, 'type' | 'service'>
): 'business' | 'observability' | 'jsonl_only' {
  if (envelope.type === 'access' || envelope.type === 'perf') return 'jsonl_only'
  if (envelope.service === 'domain-event-bus') return 'jsonl_only'
  if (envelope.type === 'debug' || envelope.type === 'trace' || envelope.type === 'ci') {
    return 'jsonl_only'
  }
  // 仅明确的操作审计进业务库；告警/风险等 security 运维流水进观测库，避免整库导出撞业务
  if (envelope.type === 'audit') return 'business'
  return 'observability'
}

export function log(input: LogInput): void {
  if (!shouldLog(input.level)) return
  // LC03：INFO 可采样（百分率由配置管控热变更）
  if (input.level === 'info' && state.infoSamplePercent < 100) {
    if (Math.random() * 100 >= state.infoSamplePercent) return
  }

  const traceId =
    input.traceId ||
    (typeof input.context?.trace_id === 'string' ? input.context.trace_id : undefined) ||
    (typeof input.context?.traceId === 'string' ? input.context.traceId : undefined) ||
    state.getDefaultTraceId?.()

  const envelope = buildLogEnvelope(
    {
      ...input,
      service: input.service || state.service,
      traceId,
    },
    state.service
  )

  if (input.context !== undefined && envelope.context === undefined) {
    console.warn('[log-service] redact failed; skip persist to avoid plaintext leak')
    emitConsole(
      input.level,
      formatLine(input.level, input.message, {
        traceId,
        redactFailed: true,
      })
    )
    return
  }

  const consolePayload: Record<string, unknown> = {
    service: envelope.service,
    type: envelope.type,
    traceId: envelope.traceId,
  }
  if (envelope.action) consolePayload.action = envelope.action
  if (envelope.userId) consolePayload.userId = envelope.userId
  if (envelope.spanId) consolePayload.spanId = envelope.spanId
  if (envelope.context && Object.keys(envelope.context).length > 0) {
    consolePayload.context = envelope.context
  }

  emitConsole(input.level, formatLine(input.level, input.message, consolePayload))

  // LC19/LC20：按类型目录 JSONL 分片（全量流水追加真相；与业务库/观测库写路径分离）
  try {
    appendTypeFile(envelope.type, JSON.stringify(envelope))
  } catch (err) {
    console.error('[log-service] type-file write failed', err instanceof Error ? err.message : String(err))
  }

  const target = resolveLogPersistTarget(envelope)
  if (target === 'jsonl_only') return

  const detailsObj: Record<string, unknown> = {
    service: envelope.service,
    type: envelope.type,
  }
  if (envelope.spanId) detailsObj.spanId = envelope.spanId
  if (envelope.context) detailsObj.context = envelope.context

  const row: LogPersistRow = {
    level: envelope.level,
    message: envelope.message,
    userId: envelope.userId ?? null,
    action: envelope.action ?? null,
    details: JSON.stringify(detailsObj),
    traceId: envelope.traceId ?? null,
    createdAt: envelope.ts,
  }

  if (target === 'business') {
    if (!state.ready || !state.persist) return
    try {
      state.persist(row)
    } catch (err) {
      console.error('[log-service] business persist failed', err instanceof Error ? err.message : String(err))
    }
    return
  }

  // observability
  if (!state.persistObservability) return
  try {
    state.persistObservability(row)
  } catch (err) {
    console.error('[log-service] observability persist failed', err instanceof Error ? err.message : String(err))
  }
}

export function logSensitive(message: string, context?: Record<string, unknown>): void {
  if (state.isProduction) return
  if (!shouldLog('debug')) return
  const safe = context !== undefined ? redactSensitive(context) : undefined
  emitConsole(
    'debug',
    formatLine('debug', `[SENSITIVE] ${message}`, {
      context: safe,
      note: 'console-only; never persisted',
    })
  )
}


export function ready_rb_l0_infra_log_01(): boolean {
  return isLogReady()
}

/**
 * 服务器日志类（兼容旧 API）
 */
class ServerLogger {
  private level: LogLevel = 'info'
  private isProduction: boolean = true // CI02

  setLevel(level: LogLevel): void {
    this.level = level
    setLogLevel(level)
  }

  setProduction(isProduction: boolean): void {
    this.isProduction = isProduction
    setLogProduction(isProduction)
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level]
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const icon = LOG_ICONS[level]
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] ${icon} [${level.toUpperCase()}] ${message}${contextStr}`
  }

  /** 服务未就绪：仅控制台 */
  private consoleOnly(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return
    const line = this.format(level, message, context)
    switch (level) {
      case 'debug':
        console.debug(line)
        break
      case 'info':
        console.info(line)
        break
      case 'warn':
        console.warn(line)
        break
      case 'error':
        console.error(line)
        break
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (isLogReady()) {
      log({ level: 'debug', message, context, type: 'debug' })
    } else {
      this.consoleOnly('debug', message, context)
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (isLogReady()) {
      log({ level: 'info', message, context, type: 'runtime' })
    } else {
      this.consoleOnly('info', message, context)
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (isLogReady()) {
      log({ level: 'warn', message, context, type: 'runtime' })
    } else {
      this.consoleOnly('warn', message, context)
    }
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext =
      error instanceof Error
        ? { ...context, errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { ...context, error: String(error) }
          : context
    if (isLogReady()) {
      log({ level: 'error', message, context: errorContext, type: 'error' })
    } else {
      this.consoleOnly('error', message, errorContext)
    }
  }

  /**
   * 启动信息（始终输出；服务未就绪时直接 console）
   */
  startup(message: string, context?: Record<string, unknown>): void {
    console.log(message)
    if (context && Object.keys(context).length > 0) {
      if (isLogReady()) {
        log({
          level: 'info',
          message: 'startup.context',
          context,
          type: 'runtime',
          action: 'startup',
        })
      } else {
        console.log(this.format('info', 'startup.context', context))
      }
    }
  }

  event(event: string, context?: Record<string, unknown>): void {
    if (isLogReady()) {
      log({ level: 'info', message: event, context, type: 'runtime', action: event })
    } else {
      this.consoleOnly('info', event, context)
    }
  }

  /** 审计/安全事件 → log-service（替代业务路由直调 database.createLog） */
  audit(
    message: string,
    opts?: {
      level?: LogLevel
      type?: 'audit' | 'security' | 'business' | 'runtime' | 'error'
      userId?: string | null
      action?: string
      context?: Record<string, unknown>
    }
  ): void {
    const level = opts?.level || 'info'
    const type = opts?.type || 'audit'
    if (isLogReady()) {
      log({
        level,
        message,
        type,
        userId: opts?.userId,
        action: opts?.action,
        context: opts?.context,
      })
    } else {
      this.consoleOnly(level, message, opts?.context)
    }
  }

  /**
   * 敏感信息：仅非生产基准时控制台输出（CI02 默认永不输出），永不落库
   */
  sensitive(message: string, context?: Record<string, unknown>): void {
    if (this.isProduction) return
    logSensitive(message, context)
  }
}

export const logger = new ServerLogger()

export function initLogger(level: LogLevel, isProduction: boolean): void {
  logger.setLevel(level)
  logger.setProduction(isProduction)
}
