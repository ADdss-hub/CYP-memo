/**
 * CYP-memo 链路追踪服务（嵌入式 · Span 环形缓冲）
 * 专属：收 Span 元数据、内存环形缓冲、可选落盘 jsonl、按 traceId 组树
 * 红线：不存 Payload（无 body/attrs 业务载荷）；不触发调度/消息服务
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { database } from '../../../l0/infra/db/ready.js'
import { cleanupExpiredLogs, log as log } from '../../../l0/infra/log/ready.js'

export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  service: string
  durationMs: number
  statusCode?: number
  startAt: string
}

export interface TraceTreeNode extends TraceSpan {
  children: TraceTreeNode[]
}

export interface TracingState {
  ready: boolean
  capacity: number
  size: number
  persisted: boolean
  dataDir: string | null
  totalRecorded: number
}

export interface InitTracingOptions {
  dataDir: string
  /** 环形缓冲容量，默认 2048 */
  capacity?: number
  /** 是否落盘 spans.jsonl，默认 true */
  persist?: boolean
}

const DEFAULT_CAPACITY = 2048

const state: TracingState = {
  ready: false,
  capacity: DEFAULT_CAPACITY,
  size: 0,
  persisted: false,
  dataDir: null,
  totalRecorded: 0,
}

/** 环形缓冲：按写入顺序覆盖 */
let ring: (TraceSpan | null)[] = []
let writeIndex = 0
let filled = 0
let persistEnabled = false

function spansPath(): string {
  return path.join(state.dataDir || '.', 'tracing', 'spans.jsonl')
}

function ensurePersistDir(): void {
  if (!state.dataDir || !persistEnabled) return
  const dir = path.join(state.dataDir, 'tracing')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * 仅保留 Span 元数据字段；显式丢弃任何 payload/attrs/body 键
 */
function sanitizeSpan(input: TraceSpan): TraceSpan {
  const row: TraceSpan = {
    traceId: String(input.traceId),
    spanId: String(input.spanId),
    name: String(input.name),
    service: String(input.service),
    durationMs: Number(input.durationMs) || 0,
    startAt: String(input.startAt || new Date().toISOString()),
  }
  if (input.parentSpanId != null && input.parentSpanId !== '') {
    row.parentSpanId = String(input.parentSpanId)
  }
  if (input.statusCode != null && Number.isFinite(Number(input.statusCode))) {
    row.statusCode = Number(input.statusCode)
  }
  return row
}

function appendDisk(span: TraceSpan): void {
  if (!persistEnabled || !state.dataDir) return
  try {
    ensurePersistDir()
    fs.appendFileSync(spansPath(), `${JSON.stringify(span)}\n`, 'utf-8')
  } catch {
    /* 落盘失败不影响内存路径 */
  }
}

export function recordSpan(input: TraceSpan): TraceSpan {
  if (!state.ready) {
    throw new Error('tracing not ready')
  }
  const span = sanitizeSpan(input)
  ring[writeIndex] = span
  writeIndex = (writeIndex + 1) % state.capacity
  if (filled < state.capacity) filled += 1
  state.size = filled
  state.totalRecorded += 1
  appendDisk(span)
  return { ...span }
}

/** 当前环形缓冲内全部 Span（最新覆盖后的有效集） */
function snapshotSpans(): TraceSpan[] {
  if (filled === 0) return []
  if (filled < state.capacity) {
    return ring.slice(0, filled).filter((s): s is TraceSpan => s != null).map((s) => ({ ...s }))
  }
  const out: TraceSpan[] = []
  for (let i = 0; i < state.capacity; i++) {
    const idx = (writeIndex + i) % state.capacity
    const s = ring[idx]
    if (s) out.push({ ...s })
  }
  return out
}

/**
 * 按 parentSpanId 组装树；无 parent 或 parent 不在缓冲内的节点为根
 */
export function getTraceTree(traceId: string): TraceTreeNode[] {
  const spans = snapshotSpans().filter((s) => s.traceId === traceId)
  if (spans.length === 0) return []

  const byId = new Map<string, TraceTreeNode>()
  for (const s of spans) {
    byId.set(s.spanId, { ...s, children: [] })
  }

  const roots: TraceTreeNode[] = []
  for (const node of byId.values()) {
    const parentId = node.parentSpanId
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortRec = (nodes: TraceTreeNode[]) => {
    nodes.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.spanId.localeCompare(b.spanId))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

export function getTracingState(): TracingState {
  return { ...state }
}

export function isTracingReady(): boolean {
  return state.ready
}

export function initTracing(opts: InitTracingOptions): TracingState {
  const capacity = Math.max(16, opts.capacity ?? DEFAULT_CAPACITY)
  state.dataDir = opts.dataDir
  state.capacity = capacity
  state.persisted = opts.persist !== false
  persistEnabled = state.persisted
  ring = new Array(capacity).fill(null)
  writeIndex = 0
  filled = 0
  state.size = 0
  state.totalRecorded = 0
  if (persistEnabled) ensurePersistDir()
  state.ready = true
  return getTracingState()
}

export function resetTracing(): void {
  state.ready = false
  state.capacity = DEFAULT_CAPACITY
  state.size = 0
  state.persisted = false
  state.dataDir = null
  state.totalRecorded = 0
  ring = []
  writeIndex = 0
  filled = 0
  persistEnabled = false
}

export function ready_rb_l1_host_tracean_01(): boolean {
  return isTracingReady()
}


export function clearLogsViaBase(): void {
  database.clearLogs()
  log({
    level: 'info',
    type: 'audit',
    message: 'logs cleared via tracing',
    action: 'logs_clear',
  })
}

export function deleteOldLogsViaBase(beforeIso: string): number {
  const deleted = database.deleteOldLogs(beforeIso)
  log({
    level: 'info',
    type: 'audit',
    message: 'old logs deleted via tracing',
    action: 'logs_delete_before',
    context: { beforeIso, deleted },
  })
  return deleted
}

export function cleanupLogFilesViaBase(): { deleted: number; audited: boolean } {
  return cleanupExpiredLogs()
}
