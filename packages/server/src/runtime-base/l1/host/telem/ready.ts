/**
 * 态势采集监测 · RB-L1-HOST-TELEM-01
 * 专属：路径×状态码、唯一目标、错误风暴粗检；安全事件最小字段。
 * 红线：不替代风险运行管控的处置闭环；不替代规则校验研判的阈值权威。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import type { Request, Response, NextFunction } from 'express'
import { log as log } from '../../../l0/infra/log/ready.js'
import { getRiskThresholds } from '../rule/ready.js'

export interface SecurityEventMin {
  event_id: string
  event_type: string
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  source_ip: string
  source_region?: string | null
  device_hint?: string | null
  subject_id?: string | null
  tenant_root_id?: string | null
  api_path?: string
  http_status?: number
  trigger_rule?: string
  action_taken?: string
  trace_id?: string
  timestamp: string
}

interface PathStat {
  count: number
  status: Record<string, number>
  bytesApprox: number
}

const pathWindow = new Map<string, PathStat>()
const ipHits = new Map<string, number>()
const tenantHits = new Map<string, number>()
let status5xx = 0
let status4xx = 0
let reqTotal = 0
let lastFlush = Date.now()
const WINDOW_FLUSH_MS = 60_000
let telemetryReady = false
let telemDataDir: string | null = null

let crossTenantDenied = 0
let crossTenantWindowStart = Date.now()
const CROSS_TENANT_WINDOW_MS = 60_000
const CROSS_TENANT_ALERT = 10

export function initSecurityTelemetry(opts?: { dataDir?: string }): { ready: boolean } {
  telemDataDir = opts?.dataDir?.trim() || null
  if (telemDataDir) {
    const dir = path.join(telemDataDir, 'telem')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  telemetryReady = true
  return { ready: true }
}

export function resetSecurityTelemetry(): void {
  telemetryReady = false
  telemDataDir = null
  pathWindow.clear()
  ipHits.clear()
  tenantHits.clear()
  status5xx = 0
  status4xx = 0
  reqTotal = 0
  crossTenantDenied = 0
}

export function isSecurityTelemetryReady(): boolean {
  return telemetryReady
}

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  )
}

export function deviceHintFromRequest(req: Request): string {
  const ua = String(req.headers['user-agent'] || '').slice(0, 180)
  let h = 0
  for (let i = 0; i < ua.length; i++) h = (h * 31 + ua.charCodeAt(i)) >>> 0
  return `uah_${h.toString(16)}`
}

function emitDataflowAlert(signal: string, title: string, detail: string, grade: 'warn' | 'critical'): void {
  void import('../alert/ready.js')
    .then((m) => {
      m.gradeAndEmitAlertCandidate({
        signal,
        source: 'telem',
        title,
        detail,
        grade,
      })
    })
    .catch(() => undefined)
}

export function securityTelemetryMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!telemetryReady) telemetryReady = true
    const started = Date.now()
    res.on('finish', () => {
      const pathKey = `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]}`.slice(0, 160)
      const st = String(res.statusCode)
      let row = pathWindow.get(pathKey)
      if (!row) {
        row = { count: 0, status: {}, bytesApprox: 0 }
        pathWindow.set(pathKey, row)
      }
      row.count += 1
      row.status[st] = (row.status[st] || 0) + 1
      const clen = Number(req.headers['content-length'] || 0)
      if (Number.isFinite(clen) && clen > 0) row.bytesApprox += clen

      reqTotal += 1
      if (res.statusCode >= 500) status5xx += 1
      else if (res.statusCode >= 400) status4xx += 1

      const ip = clientIp(req)
      ipHits.set(ip, (ipHits.get(ip) || 0) + 1)

      const now = Date.now()
      if (now - lastFlush >= WINDOW_FLUSH_MS) {
        lastFlush = now
        flushTelemetryWindow(now - started)
      }
    })
    next()
  }
}

function flushTelemetryWindow(_latencySample: number): void {
  if (pathWindow.size === 0 && reqTotal === 0) return
  const snapshot: Record<string, PathStat> = {}
  for (const [k, v] of pathWindow) {
    snapshot[k] = { count: v.count, status: { ...v.status }, bytesApprox: v.bytesApprox }
  }
  pathWindow.clear()

  let total = 0
  let notFound = 0
  let bytes = 0
  for (const v of Object.values(snapshot)) {
    total += v.count
    notFound += v.status['404'] || 0
    bytes += v.bytesApprox
  }
  const ratio404 = total > 0 ? notFound / total : 0
  const uniquePaths = Object.keys(snapshot).length
  const uniqueIps = ipHits.size
  const uniqueTenants = tenantHits.size
  const err5xx = status5xx
  const err4xx = status4xx
  const allReq = reqTotal

  status5xx = 0
  status4xx = 0
  reqTotal = 0
  ipHits.clear()
  tenantHits.clear()

  const thr = getRiskThresholds()
  const scanSuspect =
    uniquePaths >= thr.scanUniquePaths && ratio404 >= thr.scan404Ratio && total >= thr.scanMinSamples
  const errorStorm = err5xx >= thr.errorStorm5xx

  log({
    level: scanSuspect || errorStorm ? 'warn' : 'debug',
    type: 'security',
    message: 'telem_dataflow_window',
    action: 'dataflow_metrics',
    context: {
      total: allReq || total,
      notFound,
      ratio404: Number(ratio404.toFixed(3)),
      uniquePaths,
      uniqueIps,
      uniqueTenants,
      err5xx,
      err4xx,
      bytesApprox: bytes,
      scanSuspect,
      errorStorm,
      sample: Object.entries(snapshot)
        .slice(0, 8)
        .map(([p, s]) => ({ p, c: s.count, status: s.status })),
    },
  })

  if (scanSuspect) {
    emitDataflowAlert(
      'dataflow_path_scan',
      'path scan suspicion',
      `uniquePaths=${uniquePaths} ratio404=${ratio404.toFixed(3)} total=${total}`,
      'warn'
    )
  }
  if (errorStorm) {
    emitDataflowAlert(
      'dataflow_error_storm',
      'error storm (G20 coarse)',
      `5xx=${err5xx} in ~60s window`,
      'critical'
    )
  }
}

export function buildSecurityEventPartial(
  req: Request,
  patch: Partial<SecurityEventMin>
): SecurityEventMin {
  return {
    event_id: patch.event_id || `sev_${Date.now().toString(36)}`,
    event_type: patch.event_type || 'unknown',
    risk_level: patch.risk_level || 'low',
    source_ip: patch.source_ip || clientIp(req),
    source_region: patch.source_region ?? null,
    device_hint: patch.device_hint ?? deviceHintFromRequest(req),
    subject_id: patch.subject_id ?? null,
    tenant_root_id: patch.tenant_root_id ?? null,
    api_path: patch.api_path || `${req.method} ${req.path}`,
    http_status: patch.http_status,
    trigger_rule: patch.trigger_rule,
    action_taken: patch.action_taken,
    trace_id: patch.trace_id || (req.headers['x-request-id'] as string) || undefined,
    timestamp: new Date().toISOString(),
  }
}

export function getPathTelemetrySnapshot(): Record<string, PathStat> {
  const out: Record<string, PathStat> = {}
  for (const [k, v] of pathWindow) {
    out[k] = { count: v.count, status: { ...v.status }, bytesApprox: v.bytesApprox }
  }
  return out
}

export function recordCrossTenantDenied(req: Request, reason: string): void {
  const now = Date.now()
  if (now - crossTenantWindowStart >= CROSS_TENANT_WINDOW_MS) {
    crossTenantDenied = 0
    crossTenantWindowStart = now
  }
  crossTenantDenied += 1
  const actor = (req as { authUser?: { id?: string; tenantRootId?: string; digitalId?: string } })
    .authUser
  log({
    level: 'warn',
    type: 'security',
    message: 'cross_tenant_denied',
    action: 'cross_tenant_denied',
    context: {
      reason,
      countInWindow: crossTenantDenied,
      actorId: actor?.id || null,
      actorDigitalId: actor?.digitalId || null,
      actorTenantRootId: actor?.tenantRootId || null,
      path: `${req.method} ${req.path}`.slice(0, 160),
    },
  })
  if (crossTenantDenied >= CROSS_TENANT_ALERT) {
    emitDataflowAlert(
      'dataflow_cross_tenant',
      'cross-tenant deny burst',
      `count=${crossTenantDenied} in ~60s`,
      'critical'
    )
    crossTenantDenied = 0
    crossTenantWindowStart = now
  }
}

export function getCrossTenantDeniedCount(): number {
  return crossTenantDenied
}

export function recordExportTelemetry(input: {
  tenantRootId?: string | null
  digitalId?: string | null
  bytesApprox: number
  rowCounts: Record<string, number>
  trace_id?: string
  path?: string
}): void {
  log({
    level: 'info',
    type: 'security',
    message: 'data_export',
    action: 'dataflow_export',
    context: {
      tenantRootId: input.tenantRootId || null,
      digitalId: input.digitalId || null,
      bytesApprox: input.bytesApprox,
      rowCounts: input.rowCounts,
      trace_id: input.trace_id || null,
      path: input.path || '/api/data/export',
    },
  })
  const bytes = input.bytesApprox
  if (bytes >= 2_000_000) {
    emitDataflowAlert(
      'dataflow_export_bulk',
      'bulk export suspicion',
      `bytesApprox=${bytes}`,
      bytes >= 10_000_000 ? 'critical' : 'warn'
    )
  }
}

/** 实现锚点 · RB-L1-HOST-TELEM-01 · 指标来自本组件 */
export function ready_rb_l1_host_telem_01(): boolean {
  return isSecurityTelemetryReady() && telemDataDir != null
}
