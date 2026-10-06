/**
 * CYP-memo 数据管道同步服务（嵌入式）
 * 专属：监听「变更事件」并同步到目标（内存队列 → cache set / 落盘 sync-log）
 * 红线：不算业务逻辑；不做 Cron；不存目标数据本体（只搬运）
 *
 * 导出 API：init / reset / getState / isReady / enqueueChange / flushOnce
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { getSystemCache } from '../../../l0/infra/cache/ready.js'
import { log as log, getLogRetentionDays } from '../../../l0/infra/log/ready.js'
import { recordLineageEdge, initLineage } from '../../col/data/ready.js'
import { database } from '../../../l0/infra/db/ready.js'
import { publishEntityChange } from '../../col/evt/ready.js'
import { deleteOldLogsViaBase } from '../tracean/ready.js'

export interface RegisteredSource {
  source: string
  tables?: string[]
  note?: string
  registeredAt: string
}

interface RegistryFile {
  sources: RegisteredSource[]
}

const DEFAULT_SOURCES: RegisteredSource[] = [
  {
    source: 'sqlite',
    tables: [
      'users',
      'memos',
      'memo_history',
      'files',
      'shares',
      'share_comments',
      'logs',
      'settings',
    ],
    note: 'embedded db',
    registeredAt: 'bootstrap',
  },
  { source: 'cache', tables: ['*'], note: 'embedded cache', registeredAt: 'bootstrap' },
  { source: 'pipeline', tables: ['*'], note: 'self', registeredAt: 'bootstrap' },
  { source: 'export', tables: ['tenant_bundle'], note: 'data export', registeredAt: 'bootstrap' },
  { source: 'test', tables: ['*'], note: 'local verify', registeredAt: 'bootstrap' },
]

let dataDirRef: string | null = null
const memory = new Map<string, RegisteredSource>()

function registryPath(): string | null {
  if (!dataDirRef) return null
  return path.join(dataDirRef, 'governance', 'data-sources.json')
}

function persist(): void {
  const p = registryPath()
  if (!p) return
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const body: RegistryFile = { sources: [...memory.values()] }
  fs.writeFileSync(p, JSON.stringify(body, null, 2), 'utf-8')
}

export function initDataSourceRegistry(opts: { dataDir: string }): void {
  dataDirRef = opts.dataDir
  memory.clear()
  for (const s of DEFAULT_SOURCES) {
    memory.set(s.source, { ...s, tables: [...(s.tables || [])], registeredAt: s.registeredAt || new Date().toISOString() })
  }
  const p = registryPath()
  if (p && fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as RegistryFile
      for (const s of raw.sources || []) {
        if (!s?.source) continue
        const src = String(s.source)
        const existing = memory.get(src)
        if (!existing) {
          memory.set(src, s)
          continue
        }
        // 磁盘不得删掉代码侧必建表；做并集，避免陈旧 data-sources.json 覆盖后漏登记打告警
        const diskTables = s.tables || []
        const baseTables = existing.tables || []
        const merged =
          diskTables.includes('*') || baseTables.includes('*')
            ? ['*']
            : [...new Set([...baseTables, ...diskTables])]
        memory.set(src, {
          source: src,
          tables: merged,
          note: s.note || existing.note,
          registeredAt: s.registeredAt || existing.registeredAt,
        })
      }
    } catch {
      /* keep defaults */
    }
  }
  persist()
  log({
    level: 'info',
    type: 'runtime',
    message: 'data source registry ready',
    action: 'g06_registry_ready',
    context: { count: memory.size },
  })
}

export function registerDataSource(input: {
  source: string
  tables?: string[]
  note?: string
}): RegisteredSource {
  const source = String(input.source || '').trim()
  if (!source) throw new Error('source required')
  const rec: RegisteredSource = {
    source,
    tables: input.tables,
    note: input.note,
    registeredAt: new Date().toISOString(),
  }
  memory.set(source, rec)
  persist()
  return rec
}

export function listRegisteredSources(): RegisteredSource[] {
  return [...memory.values()]
}

export function isSourceRegistered(source: string, table?: string): boolean {
  const s = memory.get(String(source || '').trim())
  if (!s) return false
  if (!table) return true
  const tables = s.tables || ['*']
  return tables.includes('*') || tables.includes(table)
}

/** 未登记则拒绝；返回拒因或 null */
export function assertSourceRegistered(source: string, table: string): string | null {
  if (isSourceRegistered(source, table)) return null
  const reason = `unregistered_source:${source}/${table}`
  log({
    level: 'warn',
    type: 'security',
    message: 'G06 reject unregistered source',
    action: 'g06_source_rejected',
    context: { source, table, reason },
  })
  void import('../alert/ready.js')
    .then((m) => {
      m.gradeAndEmitAlertCandidate({
        signal: 'dataflow_unregistered_source',
        source: 'g06-registry',
        title: 'unregistered data source',
        detail: reason,
        grade: 'warn',
      })
    })
    .catch(() => undefined)
  return reason
}

export function resetDataSourceRegistry(): void {
  memory.clear()
  dataDirRef = null
}

export type PipelineOp = 'insert' | 'update' | 'delete' | 'upsert' | string

export interface PipelineChangeEvent {
  source: string
  table: string
  op: PipelineOp
  key: string
  /** 入队时间戳（ms）；用于 lagMs */
  enqueuedAt: number
}

export interface DataPipelineState {
  ready: boolean
  dataDir: string | null
  queueDepth: number
  flushed: number
  /** 最近一次 flush 的最大滞后（ms） */
  lagMs: number
  lastFlushAt: string | null
}

const state: DataPipelineState = {
  ready: false,
  dataDir: null,
  queueDepth: 0,
  flushed: 0,
  lagMs: 0,
  lastFlushAt: null,
}

/** 进程内变更队列（非 Cron；仅由 flushOnce 主动排空） */
const queue: PipelineChangeEvent[] = []

function syncLogPath(): string {
  return path.join(state.dataDir || '.', 'pipeline', 'sync-log.jsonl')
}

function ensureDir(): void {
  if (!state.dataDir) return
  const dir = path.join(state.dataDir, 'pipeline')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * 入队一条变更事件（只记录搬运元数据，不带业务行数据本体）。
 */
export function enqueueChange(input: {
  source: string
  table: string
  op: PipelineOp
  key: string
}): PipelineChangeEvent {
  if (!state.ready) throw new Error('data-pipeline not ready')
  const source = String(input.source || '').trim()
  const table = String(input.table || '').trim()
  const op = String(input.op || '').trim()
  const key = String(input.key || '').trim()
  if (!source || !table || !op || !key) {
    throw new Error('enqueueChange requires source, table, op, key')
  }
  const reject = assertSourceRegistered(source, table)
  if (reject) throw new Error(`G06 ${reject}`)
  const ev: PipelineChangeEvent = {
    source,
    table,
    op,
    key,
    enqueuedAt: Date.now(),
  }
  queue.push(ev)
  state.queueDepth = queue.length
  return { ...ev }
}

/**
 * 排空当前队列一次：写入 embedded cache（元数据指针）+ append sync-log。
 * 不存目标数据本体；不调度定时器。
 */
export function flushOnce(): { flushed: number; lagMs: number } {
  if (!state.ready) return { flushed: 0, lagMs: state.lagMs }
  if (queue.length === 0) return { flushed: 0, lagMs: state.lagMs }

  const now = Date.now()
  let maxLag = 0
  const batch = queue.splice(0, queue.length)
  state.queueDepth = 0
  ensureDir()
  const cache = getSystemCache()
  const logPath = syncLogPath()

  for (const ev of batch) {
    const lag = Math.max(0, now - ev.enqueuedAt)
    if (lag > maxLag) maxLag = lag
    // 只搬运：cache 存变更指针，不落业务行
    const cacheKey = `pipeline:change:${ev.source}:${ev.table}:${ev.key}`
    cache.set(cacheKey, {
      source: ev.source,
      table: ev.table,
      op: ev.op,
      key: ev.key,
      enqueuedAt: ev.enqueuedAt,
      flushedAt: now,
      lagMs: lag,
    })
    const row = {
      source: ev.source,
      table: ev.table,
      op: ev.op,
      key: ev.key,
      enqueuedAt: ev.enqueuedAt,
      flushedAt: now,
      lagMs: lag,
    }
    fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf-8')
    recordLineageEdge({
      source: ev.source,
      table: ev.table,
      op: ev.op,
      key: ev.key,
      sink: 'embedded-cache',
      trace_id: `pipe_${ev.source}_${ev.key}`,
    })
  }

  state.flushed += batch.length
  state.lagMs = maxLag
  state.lastFlushAt = new Date(now).toISOString()
  return { flushed: batch.length, lagMs: maxLag }
}

/**
 * 对账回放条数口径来自配置管控绑定的日志保留期（嵌入式等价，非独立核算引擎）。
 */
export function replayLimitFromConfig(): number {
  const days = Number(getLogRetentionDays().business || 7)
  const n = Math.floor(days * 50)
  return Math.min(2000, Math.max(50, Number.isFinite(n) ? n : 200))
}

function aggregateFile(): string {
  return path.join(state.dataDir || '.', 'pipeline', 'aggregate.json')
}

/**
 * 5.7 清洗后的聚合：按表与操作计数，口径受配置管控回放条数约束。
 */
export function aggregateSyncLog(): { tables: Record<string, number>; ops: Record<string, number>; counted: number } {
  const tables: Record<string, number> = {}
  const ops: Record<string, number> = {}
  if (!state.dataDir) return { tables, ops, counted: 0 }
  const logPath = syncLogPath()
  if (!fs.existsSync(logPath)) return { tables, ops, counted: 0 }
  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)
  const slice = lines.slice(-replayLimitFromConfig())
  for (const line of slice) {
    try {
      const row = JSON.parse(line) as { table?: string; op?: string }
      const t = String(row.table || 'unknown')
      const o = String(row.op || 'unknown')
      tables[t] = (tables[t] || 0) + 1
      ops[o] = (ops[o] || 0) + 1
    } catch {
      /* skip */
    }
  }
  const counted = slice.length
  if (state.dataDir) {
    ensureDir()
    fs.writeFileSync(aggregateFile(), JSON.stringify({ at: new Date().toISOString(), tables, ops, counted }, null, 2), 'utf-8')
  }
  return { tables, ops, counted }
}

/**
 * 5.7 数据处理核算：对账结果可回放——按 sync-log 重放变更指针到系统缓存。
 * 只回放元数据指针，不恢复业务行本体。limit 缺省时读配置管控保留期口径。
 */
export function replaySyncLog(opts?: { limit?: number }): {
  replayed: number
  reconciled: number
  skipped: number
  limitUsed: number
} {
  const limitUsed =
    opts?.limit !== undefined
      ? Math.min(2000, Math.max(1, Math.floor(opts.limit)))
      : replayLimitFromConfig()
  if (!state.ready || !state.dataDir) {
    return { replayed: 0, reconciled: 0, skipped: 0, limitUsed }
  }
  const logPath = syncLogPath()
  if (!fs.existsSync(logPath)) return { replayed: 0, reconciled: 0, skipped: 0, limitUsed }
  const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/).filter(Boolean)
  const slice = lines.slice(Math.max(0, lines.length - limitUsed))
  const cache = getSystemCache()
  let replayed = 0
  let reconciled = 0
  let skipped = 0
  for (const line of slice) {
    try {
      const row = JSON.parse(line) as {
        source?: string
        table?: string
        op?: string
        key?: string
        enqueuedAt?: number
        flushedAt?: number
        lagMs?: number
      }
      if (!row.source || !row.table || !row.key || !row.op) {
        skipped += 1
        continue
      }
      const cacheKey = `pipeline:change:${row.source}:${row.table}:${row.key}`
      const prev = cache.get(cacheKey) as { flushedAt?: number } | undefined
      cache.set(cacheKey, {
        source: row.source,
        table: row.table,
        op: row.op,
        key: row.key,
        enqueuedAt: row.enqueuedAt || 0,
        flushedAt: row.flushedAt || Date.now(),
        lagMs: row.lagMs || 0,
        replayedAt: Date.now(),
      })
      replayed += 1
      if (prev && prev.flushedAt === row.flushedAt) reconciled += 1
      else if (!prev) reconciled += 1
    } catch {
      skipped += 1
    }
  }
  return { replayed, reconciled, skipped, limitUsed }
}

export function getState(): DataPipelineState {
  return {
    ...state,
    queueDepth: queue.length,
  }
}

export function isReady(): boolean {
  return state.ready
}

export function init(opts: { dataDir: string }): DataPipelineState {
  state.dataDir = opts.dataDir
  queue.length = 0
  state.queueDepth = 0
  state.flushed = 0
  state.lagMs = 0
  state.lastFlushAt = null
  ensureDir()
  state.ready = true
  return getState()
}

export function reset(): void {
  queue.length = 0
  state.ready = false
  state.dataDir = null
  state.queueDepth = 0
  state.flushed = 0
  state.lagMs = 0
  state.lastFlushAt = null
}

/** bootstrap / ready 探针兼容别名 */
export const initDataPipeline = init
export const resetDataPipeline = reset
export const getDataPipelineState = getState
export const isDataPipelineReady = isReady
export const replayDataPipelineSyncLog = replaySyncLog

export function runAcctReplayProbe(): {
  flushed: number
  replayed: number
  aggregated: number
  limitFromConfig: boolean
} {
  if (!state.ready || !state.dataDir) throw new Error('data-pipeline not ready')
  initDataSourceRegistry({ dataDir: state.dataDir })
  initLineage({ dataDir: state.dataDir })
  enqueueChange({ source: 'sqlite', table: 'memos', op: 'update', key: `eq-replay-${Date.now()}` })
  const flushed = flushOnce()
  const agg = aggregateSyncLog()
  const replayed = replaySyncLog()
  return {
    flushed: flushed.flushed,
    replayed: replayed.replayed,
    aggregated: agg.counted,
    limitFromConfig: replayed.limitUsed === replayLimitFromConfig(),
  }
}

export function ready_rb_l1_host_acct_01(): boolean {
  return isDataPipelineReady()
}

export function pipeEntityWrite(opts: {
  table: string
  op: 'insert' | 'update' | 'delete'
  key: string
  eventName: string
  payload: Record<string, unknown>
}): void {
  try {
    enqueueChange({
      source: 'sqlite',
      table: opts.table,
      op: opts.op,
      key: opts.key,
    })
    flushOnce()
  } catch (err) {
    log({
      level: 'warn',
      type: 'business',
      message: 'entity write pipeline enqueue failed',
      action: 'f04_enqueue_fail',
      context: { table: opts.table, key: opts.key, err: String(err) },
    })
  }
  publishEntityChange(opts.eventName, {
    ...opts.payload,
    entityType: opts.table.replace(/s$/, ''),
    op: opts.op === 'insert' ? 'create' : opts.op,
  })
}

let orphanFilePurge: (() => number) | null = null

/** 附件清理由附件写路径登记，避免本目录静态引用附件写路径 */
export function bindOrphanFilePurge(fn: () => number): void {
  orphanFilePurge = fn
}

export function cleanDeletedMemosViaBase(days: number): number {
  const deleted = database.cleanDeletedMemos(days)
  log({
    level: 'info',
    type: 'business',
    message: 'clean deleted memos',
    action: 'f04_clean_memos',
    context: { days, deleted },
  })
  pipeEntityWrite({
    table: 'memos',
    op: 'delete',
    key: `clean:${days}`,
    eventName: 'EntityArchived',
    payload: { op: 'clean_deleted_memos', days, deleted },
  })
  return deleted
}

export function cleanOrphanedFilesViaBase(): number {
  if (!orphanFilePurge) throw new Error('孤立附件清理未接线')
  const deleted = orphanFilePurge()
  log({
    level: 'info',
    type: 'business',
    message: 'clean orphaned files',
    action: 'f04_clean_files',
    context: { deleted },
  })
  return deleted
}

export function cleanExpiredSharesViaBase(): number {
  const deleted = database.cleanExpiredShares()
  log({
    level: 'info',
    type: 'business',
    message: 'clean expired shares',
    action: 'f04_clean_shares',
    context: { deleted },
  })
  return deleted
}

export function performCleanupViaBase(days: number, hours: number): {
  deletedMemosRemoved: number
  orphanedFilesRemoved: number
  expiredSharesRemoved: number
  oldLogsRemoved: number
} {
  const logCutoff = new Date()
  logCutoff.setHours(logCutoff.getHours() - hours)
  return {
    deletedMemosRemoved: cleanDeletedMemosViaBase(days),
    orphanedFilesRemoved: cleanOrphanedFilesViaBase(),
    expiredSharesRemoved: cleanExpiredSharesViaBase(),
    oldLogsRemoved: deleteOldLogsViaBase(logCutoff.toISOString()),
  }
}
