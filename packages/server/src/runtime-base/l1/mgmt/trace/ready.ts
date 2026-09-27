import { AsyncLocalStorage } from 'node:async_hooks'
/**
 * 全链路日志 · RB-L1-MGMT-TRACE-01
 * 专属：请求链路统一标识检索；鉴权失败与公开面拒绝留痕。
 * 红线：不替代日志组件的采集持久化；不替代溯源检索分析的业务码定位。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { LOG_TYPES, getLogRetentionDays } from '../../../l0/infra/log/ready.js'

export type ChainMarkKind = 'auth_fail' | 'public_deny' | 'permission_deny' | 'wiring_deny'

export interface ChainMark {
  at: string
  kind: ChainMarkKind
  traceId: string
  detail?: string
}

const marks: ChainMark[] = []
const MAX_MARKS = 500
let chainReady = false
let getTraceId: (() => string | null | undefined) | null = null

export function initFullChainLog(opts?: {
  getDefaultTraceId?: () => string | null | undefined
}): { ready: boolean } {
  getTraceId = opts?.getDefaultTraceId || null
  chainReady = true
  return { ready: true }
}

export function resetFullChainLog(): void {
  chainReady = false
  getTraceId = null
  marks.length = 0
}

export function isFullChainLogReady(): boolean {
  return chainReady
}

export function recordChainMark(kind: ChainMarkKind, detail?: string, traceId?: string): ChainMark {
  const id = String(traceId || getTraceId?.() || '').trim() || `orphan_${Date.now().toString(36)}`
  const row: ChainMark = {
    at: new Date().toISOString(),
    kind,
    traceId: id.slice(0, 80),
    detail: detail ? String(detail).slice(0, 240) : undefined,
  }
  marks.push(row)
  if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS)
  return row
}

export function searchChainByTraceId(traceId: string): ChainMark[] {
  const id = String(traceId || '').trim()
  if (!id) return []
  return marks.filter((m) => m.traceId === id).map((m) => ({ ...m }))
}

export function listRecentChainMarks(limit = 50): ChainMark[] {
  const n = Math.min(Math.max(limit, 1), 200)
  return marks.slice(-n).map((m) => ({ ...m }))
}

/** 实现锚点 · RB-L1-MGMT-TRACE-01 · 与日志组件就绪分列 */
export function ready_rb_l1_mgmt_trace_01(): boolean {
  const days = getLogRetentionDays()
  return (
    isFullChainLogReady() &&
    LOG_TYPES.length >= 10 &&
    days.access >= 1 &&
    days.audit >= 1 &&
    typeof searchChainByTraceId === 'function'
  )
}

export interface RequestTraceContext {
  requestId: string
  traceId: string
}

export const requestTraceAls = new AsyncLocalStorage<RequestTraceContext>()

export function getRequestTrace(): RequestTraceContext | undefined {
  return requestTraceAls.getStore()
}

export function getRequestTraceId(): string | undefined {
  return requestTraceAls.getStore()?.traceId
}

export function getRequestId(): string | undefined {
  return requestTraceAls.getStore()?.requestId
}

/** 解析 W3C Trace Context：`00-{trace_id}-{parent_id}-{flags}` */
export function parseTraceparent(header: string | undefined): string | undefined {
  if (!header) return undefined
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(header.trim())
  return m ? m[1].toLowerCase() : undefined
}

export function buildTraceparent(traceId: string, spanId?: string): string {
  const tid = traceId.replace(/-/g, '').toLowerCase().padEnd(32, '0').slice(0, 32)
  const sid = (spanId || tid.slice(0, 16)).replace(/-/g, '').toLowerCase().padEnd(16, '0').slice(0, 16)
  return `00-${tid}-${sid}-01`
}
