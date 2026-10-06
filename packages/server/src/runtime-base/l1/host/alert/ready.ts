/**
 * CYP-memo 全局告警服务（嵌入式 · ⑦ On-call 拨号执行面）
 * 专属：只消费⑤ AlertCandidate 并拨号；去重/升级/静默位
 * 5.7 + IA13-X：系统处置单开单即派 automation:* 并闭环关单；运维不人工指派/关闭
 * 红线：拨号面不定级（定级只走 gradeAndEmitAlertCandidate）；不自行修障；历史归档查日志服务；不承担业务用户站内通知
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { log as log } from '../../../l0/infra/log/ready.js'
import { publishDomainEvent, subscribeDomainEvent } from '../../col/evt/ready.js'
import { egressFetch } from '../resil/egress.js'

export type AlertGrade = 'info' | 'warn' | 'critical'

export interface GradeInput {
  signal: string
  source: string
  title: string
  detail?: string
  metricValue?: number
  threshold?: number
  grade?: AlertGrade
}

/**
 * 定级并发布 AlertCandidate；同时可记 BusinessErrorRecorded
 */
export function gradeAndEmitAlertCandidate(input: GradeInput): void {
  const grade: AlertGrade =
    input.grade ||
    (input.signal.includes('kill') || input.signal.includes('fail') ? 'critical' : 'warn')
  const fingerprint = `${input.source}|${input.signal}|${input.title}`

  publishDomainEvent(
    'BusinessErrorRecorded',
    5,
    {
      errorCode: input.signal,
      domain: input.source,
      title: input.title,
    },
    grade === 'critical' ? 'error' : 'warn'
  )

  publishDomainEvent(
    'AlertCandidate',
    5,
    {
      severity: grade === 'critical' ? 'P0' : grade === 'warn' ? 'P1' : 'P2',
      grade,
      signal: input.signal,
      fingerprint,
      count: 1,
      source: input.source,
      title: input.title,
      detail: input.detail,
      metricValue: input.metricValue,
      threshold: input.threshold,
    },
    grade === 'critical' ? 'critical' : 'warn'
  )

  log({
    level: grade === 'critical' ? 'error' : 'warn',
    type: 'security',
    message: `alert_candidate:${input.title}`,
    service: 'alert-grading',
    action: 'AlertCandidate',
    context: { fingerprint, grade },
  })
}

export type AlertSeverity = 'P0' | 'P1' | 'P2'
export type AlertTicketStatus = 'open' | 'assigned' | 'closed'

export interface AlertEvent {
  id: string
  severity: AlertSeverity
  source: string
  title: string
  detail?: string
  at: string
}

export interface AlertDispositionRecord {
  at: string
  action: 'open' | 'assign' | 'close'
  actor: string
  detail?: string
}

/** 告警工单（自动派自动化 · 闭环关闭；运维只观测） */
export interface AlertTicket {
  id: string
  severity: AlertSeverity
  source: string
  title: string
  detail?: string
  status: AlertTicketStatus
  assignee: string | null
  assignedAt: string | null
  closedAt: string | null
  closeReason: string | null
  createdAt: string
  dispositions: AlertDispositionRecord[]
}

/** 按来源映射自动化执行面：hold=等恢复事件关闭；ack_close=信号已处理则立刻闭环 */
type AutomationPlan = { assignee: string; mode: 'hold' | 'ack_close' }

const AUTOMATION_BY_SOURCE: Record<string, AutomationPlan> = {
  'perf-service': { assignee: 'automation:perf', mode: 'hold' },
  telem: { assignee: 'automation:telem', mode: 'ack_close' },
  'g06-registry': { assignee: 'automation:dataflow', mode: 'ack_close' },
  mcp: { assignee: 'automation:mcp', mode: 'ack_close' },
  manual: { assignee: 'automation:probe', mode: 'ack_close' },
}

function resolveAutomation(source: string): AutomationPlan {
  return (
    AUTOMATION_BY_SOURCE[source] || {
      assignee: 'automation:system',
      mode: 'ack_close',
    }
  )
}

export interface AlertState {
  ready: boolean
  dispositionReady: boolean
  lastAlertAt: string | null
  suppressed: number
  delivered: number
  openCount: number
  assignedCount: number
  closedCount: number
}

const state: AlertState = {
  ready: false,
  dispositionReady: false,
  lastAlertAt: null,
  suppressed: 0,
  delivered: 0,
  openCount: 0,
  assignedCount: 0,
  closedCount: 0,
}

let dataDirRef: string | null = null
let webhookUrl: string | null = null
const recentKeys = new Map<string, number>()
const DEDUP_MS = 3 * 60_000

function alertDir(): string {
  return path.join(dataDirRef || '.', 'alerts')
}

function ticketsPath(): string {
  return path.join(alertDir(), 'tickets.json')
}

function dedupeKey(ev: Omit<AlertEvent, 'id' | 'at'>): string {
  return `${ev.severity}|${ev.source}|${ev.title}`
}

function loadTickets(): AlertTicket[] {
  const p = ticketsPath()
  if (!fs.existsSync(p)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as AlertTicket[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function saveTickets(rows: AlertTicket[]): void {
  const dir = alertDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(ticketsPath(), JSON.stringify(rows, null, 2), 'utf-8')
  refreshTicketCounts(rows)
}

function refreshTicketCounts(rows?: AlertTicket[]): void {
  const list = rows || loadTickets()
  state.openCount = list.filter((t) => t.status === 'open').length
  state.assignedCount = list.filter((t) => t.status === 'assigned').length
  state.closedCount = list.filter((t) => t.status === 'closed').length
}

function openTicketFromDispatch(full: AlertEvent): AlertTicket {
  const rows = loadTickets()
  const existing = rows.find((t) => t.id === full.id)
  if (existing) return existing
  const now = full.at
  const ticket: AlertTicket = {
    id: full.id,
    severity: full.severity,
    source: full.source,
    title: full.title,
    detail: full.detail,
    status: 'open',
    assignee: null,
    assignedAt: null,
    closedAt: null,
    closeReason: null,
    createdAt: now,
    dispositions: [{ at: now, action: 'open', actor: 'system', detail: 'dispatched' }],
  }
  rows.unshift(ticket)
  // 保留近期工单，避免无限膨胀
  saveTickets(rows.slice(0, 500))
  log({
    level: 'info',
    message: `alert_ticket_open ${full.id}`,
    type: 'security',
    action: 'alert_ticket_open',
    context: { alertId: full.id, severity: full.severity, source: full.source },
  })
  void import('../../mgmt/risk/ready.js').then(({ recordRiskDisposition }) => {
    recordRiskDisposition({
      alertId: full.id,
      action: 'converge',
      actor: 'system',
      detail: `${full.severity}|${full.source}`,
    })
  })
  // 开单后立即自动派给自动化，禁止停在待人工指派
  return autoDispatchToAutomation(ticket.id) || ticket
}

/**
 * 工单自动派给自动化并按模式闭环。
 * hold：性能等恢复事件再关；ack_close：信号侧已处置则当场关闭。
 */
export function autoDispatchToAutomation(ticketId: string): AlertTicket | null {
  if (!isAlertDispositionReady()) return null
  const cur = getAlertTicket(ticketId)
  if (!cur || cur.status === 'closed') return cur
  const plan = resolveAutomation(cur.source)
  let row = cur
  if (cur.status === 'open' || cur.assignee !== plan.assignee) {
    const assigned = assignAlertTicket(ticketId, 'system', plan.assignee)
    if (!assigned) return null
    row = assigned
  }
  log({
    level: 'info',
    message: `alert_ticket_auto_dispatch ${ticketId} -> ${plan.assignee} mode=${plan.mode}`,
    type: 'security',
    action: 'alert_ticket_auto_dispatch',
    context: { alertId: ticketId, assignee: plan.assignee, mode: plan.mode, source: row.source },
  })
  if (plan.mode === 'ack_close') {
    return closeAlertTicket(ticketId, plan.assignee, 'auto_loop_complete')
  }
  return row
}

/** 启动时把遗留 open/未派单工单补派给自动化 */
export function reconcileOpenTicketsToAutomation(): number {
  if (!isAlertDispositionReady()) return 0
  const rows = loadTickets().filter(
    (t) => t.status === 'open' || (t.status === 'assigned' && !String(t.assignee || '').startsWith('automation:'))
  )
  let n = 0
  for (const t of rows) {
    if (autoDispatchToAutomation(t.id)) n += 1
  }
  return n
}

/** ⑦ 拨号执行：只应消费已定级候选 */
export async function dispatchAlert(
  ev: Omit<AlertEvent, 'id' | 'at'> & { id?: string }
): Promise<{ delivered: boolean; suppressed: boolean }> {
  if (!state.ready) return { delivered: false, suppressed: false }
  const key = dedupeKey(ev)
  const now = Date.now()
  const prev = recentKeys.get(key)
  if (prev && now - prev < DEDUP_MS) {
    state.suppressed += 1
    void import('../../mgmt/risk/ready.js').then(({ recordRiskDisposition }) => {
      recordRiskDisposition({
        alertId: `suppress:${key}`.slice(0, 80),
        action: 'suppress',
        actor: 'system',
        detail: 'dedupe_window',
      })
    })
    return { delivered: false, suppressed: true }
  }
  recentKeys.set(key, now)

  const full: AlertEvent = {
    id: ev.id || `AL-${now.toString(36)}`,
    severity: ev.severity,
    source: ev.source,
    title: ev.title,
    detail: ev.detail,
    at: new Date().toISOString(),
  }

  const dir = alertDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const outbox = path.join(dir, 'outbox.jsonl')
  fs.appendFileSync(outbox, `${JSON.stringify(full)}\n`, 'utf-8')

  log({
    level: ev.severity === 'P0' ? 'error' : 'warn',
    message: `[${ev.severity}] ${ev.title}`,
    type: 'security',
    action: 'alert_dispatch',
    context: { alertId: full.id, source: ev.source, detail: ev.detail },
  })

  let channel = 'outbox'
  let result = 'queued'
  if (webhookUrl) {
    channel = 'webhook'
    try {
      const eg = await egressFetch({
        dependency: 'alert-webhook',
        url: webhookUrl,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: full,
        timeoutMs: 5000,
        retries: 0,
      })
      result = eg.ok ? 'ok' : 'webhook_fail'
    } catch (err) {
      result = 'webhook_fail'
      log({
        level: 'warn',
        message: `alert webhook failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'runtime',
        action: 'alert_webhook_fail',
      })
    }
  }

  publishDomainEvent('AlertDispatched', 7, {
    alertId: full.id,
    channel,
    result,
    recipient: webhookUrl ? 'webhook' : 'local_outbox',
    severity: full.severity,
    source: full.source,
    title: full.title,
    detail: full.detail || '',
  })

  openTicketFromDispatch(full)

  state.delivered += 1
  state.lastAlertAt = full.at
  return { delivered: true, suppressed: false }
}

/** @deprecated 请走 gradeAndEmitAlertCandidate；保留兼容并转发定级 */
export async function emitAlert(
  ev: Omit<AlertEvent, 'id' | 'at'> & { id?: string }
): Promise<{ delivered: boolean; suppressed: boolean }> {
  gradeAndEmitAlertCandidate({
    signal: ev.source,
    source: ev.source,
    title: ev.title,
    detail: ev.detail,
    grade: ev.severity === 'P0' ? 'critical' : ev.severity === 'P1' ? 'warn' : 'info',
  })
  return { delivered: true, suppressed: false }
}

export function wireAlertSubscriptions(): void {
  subscribeDomainEvent('AlertCandidate', async ev => {
    const severity = (ev.payload.severity as AlertSeverity) || 'P1'
    await dispatchAlert({
      severity,
      source: String(ev.payload.source || 'observability'),
      title: String(ev.payload.title || ev.payload.signal || 'alert'),
      detail: ev.payload.detail ? String(ev.payload.detail) : undefined,
    })
  })
  subscribeDomainEvent('PerfSlaRecovered', async () => {
    closeOpenAlertsBySource('perf-service', 'perf-loop', 'sla_recovered')
  })
}

export function getAlertState(): AlertState {
  if (state.ready) refreshTicketCounts()
  return { ...state }
}

export function isAlertReady(): boolean {
  return state.ready
}

/** 5.7：分级拨号 + 自动派自动化 + 关闭闭环可核验 */
export function isAlertDispositionReady(): boolean {
  return state.ready && state.dispositionReady && Boolean(dataDirRef)
}

export function listAlertTickets(opts?: {
  status?: AlertTicketStatus | 'active'
  limit?: number
}): AlertTicket[] {
  const limit = Math.min(Math.max(opts?.limit || 50, 1), 200)
  let rows = loadTickets()
  if (opts?.status === 'active') {
    rows = rows.filter((t) => t.status === 'open' || t.status === 'assigned')
  } else if (opts?.status) {
    rows = rows.filter((t) => t.status === opts.status)
  }
  return rows.slice(0, limit)
}

export function getAlertTicket(id: string): AlertTicket | null {
  return loadTickets().find((t) => t.id === id) || null
}

export function assignAlertTicket(
  id: string,
  actor: string,
  assignee: string
): AlertTicket | null {
  if (!isAlertDispositionReady()) return null
  const rows = loadTickets()
  const idx = rows.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const t = rows[idx]
  if (t.status === 'closed') return null
  const now = new Date().toISOString()
  const who = String(assignee || '').trim().slice(0, 120)
  if (!who) return null
  rows[idx] = {
    ...t,
    status: 'assigned',
    assignee: who,
    assignedAt: now,
    dispositions: [
      ...t.dispositions,
      { at: now, action: 'assign', actor: String(actor || 'ops').slice(0, 120), detail: who },
    ],
  }
  saveTickets(rows)
  log({
    level: 'info',
    message: `alert_ticket_assign ${id} -> ${who}`,
    type: 'security',
    action: 'alert_ticket_assign',
    context: { alertId: id, assignee: who, actor },
  })
  publishDomainEvent('AlertAssigned', 7, {
    alertId: id,
    assignee: who,
    actor: String(actor || 'ops'),
  })
  void import('../../mgmt/risk/ready.js').then(({ recordRiskDisposition }) => {
    recordRiskDisposition({
      alertId: id,
      action: 'assign',
      actor: String(actor || 'ops'),
      detail: who,
    })
  })
  return rows[idx]
}

export function closeAlertTicket(
  id: string,
  actor: string,
  reason?: string
): AlertTicket | null {
  if (!isAlertDispositionReady()) return null
  const rows = loadTickets()
  const idx = rows.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const t = rows[idx]
  if (t.status === 'closed') return t
  const now = new Date().toISOString()
  const why = String(reason || 'resolved').trim().slice(0, 240)
  rows[idx] = {
    ...t,
    status: 'closed',
    closedAt: now,
    closeReason: why,
    dispositions: [
      ...t.dispositions,
      { at: now, action: 'close', actor: String(actor || 'ops').slice(0, 120), detail: why },
    ],
  }
  saveTickets(rows)
  log({
    level: 'info',
    message: `alert_ticket_close ${id}`,
    type: 'security',
    action: 'alert_ticket_close',
    context: { alertId: id, reason: why, actor, priorStatus: t.status },
  })
  publishDomainEvent('AlertClosed', 7, {
    alertId: id,
    reason: why,
    actor: String(actor || 'ops'),
  })
  void import('../../mgmt/risk/ready.js').then(({ recordRiskDisposition }) => {
    recordRiskDisposition({
      alertId: id,
      action: 'close',
      actor: String(actor || 'ops'),
      detail: why,
    })
  })
  return rows[idx]
}

/** 性能恢复闭环：按来源关闭仍开着的告警工单 */
export function closeOpenAlertsBySource(source: string, actor: string, reason: string): number {
  const rows = loadTickets().filter((t) => t.source === source && t.status !== 'closed')
  let n = 0
  for (const t of rows) {
    if (closeAlertTicket(t.id, actor, reason)) n += 1
  }
  return n
}

export function initAlert(opts: { dataDir: string; webhookUrl?: string | null }): AlertState {
  dataDirRef = opts.dataDir
  webhookUrl = opts.webhookUrl?.trim() || process.env.CYP_ALERT_WEBHOOK?.trim() || null
  const dir = alertDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(ticketsPath())) saveTickets([])
  else refreshTicketCounts()
  state.ready = true
  state.dispositionReady = true
  state.suppressed = 0
  state.delivered = 0
  state.lastAlertAt = null
  const reconciled = reconcileOpenTicketsToAutomation()
  log({
    level: 'info',
    message: 'alert ready',
    type: 'runtime',
    action: 'alert_ready',
    context: {
      webhookConfigured: Boolean(webhookUrl),
      dispositionReady: true,
      autoDispatch: true,
      reconciled,
    },
  })
  return getAlertState()
}

export function resetAlert(): void {
  dataDirRef = null
  webhookUrl = null
  recentKeys.clear()
  state.ready = false
  state.dispositionReady = false
  state.lastAlertAt = null
  state.suppressed = 0
  state.delivered = 0
  state.openCount = 0
  state.assignedCount = 0
  state.closedCount = 0
}

export function ready_rb_l1_host_alert_01(): boolean {
  return Boolean(getAlertState().ready && isAlertDispositionReady())
}
