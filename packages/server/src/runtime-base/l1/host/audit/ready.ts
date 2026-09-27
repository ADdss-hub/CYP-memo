/**
 * CYP-memo 全局审计服务（嵌入式 · Append-Only）
 * 专属：面向人的敏感操作 Who / When / What / How
 * 与日志服务区分：不写 Exception stack；不写普通业务 CRUD
 * 红线：禁止 truncate / delete API；保留期仅查询过滤，不删文件（防篡改）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'

/** 审计保留标记：180 天（仅 listRecentAudits 过滤，永不删文件） */
export const AUDIT_RETENTION_DAYS = 180

export interface AuditRecord {
  /** Who */
  actor: string
  /** What */
  action: string
  /** 资源标识 */
  resource: string
  /** How / 上下文（禁止堆栈） */
  detail?: string
  /** When（ISO） */
  at: string
  /** 调用方服务身份；用户请求链可空 */
  serviceIdentity?: string
  /** 有租户上下文则必填 */
  tenant?: string
  /** 命中的权限行；无行记「无行」 */
  permissionRow?: string
  /** 允许或拒绝 */
  result?: '允许' | '拒绝'
  /** 与全链路日志同一 trace-id */
  traceId?: string
}

export interface AuditState {
  ready: boolean
  auditPath: string | null
  recorded: number
  retentionDays: number
}

const state: AuditState = {
  ready: false,
  auditPath: null,
  recorded: 0,
  retentionDays: AUDIT_RETENTION_DAYS,
}

let dataDirRef: string | null = null

function auditDir(): string {
  return path.join(dataDirRef || '.', 'audit')
}

function auditFilePath(): string {
  return path.join(auditDir(), 'audit.jsonl')
}

function ensureAuditFile(): string {
  const dir = auditDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = auditFilePath()
  if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf-8')
  return p
}

/**
 * 追加一条敏感操作审计（Append-Only）。
 * 不接受 stack / error 字段；detail 仅短描述 How。
 */
export function recordAudit(input: {
  actor: string
  action: string
  resource: string
  detail?: string
  at?: string
  serviceIdentity?: string
  tenant?: string
  permissionRow?: string
  result?: '允许' | '拒绝'
  traceId?: string
}): AuditRecord {
  if (!state.ready) throw new Error('audit not ready')
  const actor = String(input.actor || '').trim()
  const action = String(input.action || '').trim()
  const resource = String(input.resource || '').trim()
  if (!actor || !action || !resource) {
    throw new Error('recordAudit requires actor, action, resource')
  }
  const detailRaw = input.detail != null ? String(input.detail) : undefined
  if (detailRaw && /\b(stack|exception|traceback)\b/i.test(detailRaw)) {
    throw new Error('audit refuses Exception stack; use the log component')
  }
  const row: AuditRecord = {
    actor,
    action,
    resource,
    detail: detailRaw?.slice(0, 2000),
    at: input.at?.trim() || new Date().toISOString(),
    serviceIdentity: input.serviceIdentity?.trim() || undefined,
    tenant: input.tenant?.trim() || undefined,
    permissionRow: input.permissionRow?.trim() || undefined,
    result: input.result,
    traceId: input.traceId?.trim() || undefined,
  }
  const p = ensureAuditFile()
  fs.appendFileSync(p, `${JSON.stringify(row)}\n`, 'utf-8')
  state.recorded += 1
  state.auditPath = p
  return { ...row }
}

/** 敏感操作审计；服务未就绪或拒绝堆栈时不打断请求 */
export function recordAuditSafe(input: {
  actor: string
  action: string
  resource: string
  detail?: string
  at?: string
  serviceIdentity?: string
  tenant?: string
  permissionRow?: string
  result?: '允许' | '拒绝'
  traceId?: string
}): AuditRecord | null {
  if (!state.ready) return null
  try {
    return recordAudit(input)
  } catch {
    return null
  }
}

/**
 * 读取最近 N 条；默认套用 180 天保留标记过滤（不删文件）。
 * 无 truncate / delete / clear API（防篡改）。
 */
export function listRecentAudits(
  limit = 100,
  opts?: { applyRetention?: boolean }
): AuditRecord[] {
  if (!state.ready) return []
  const p = auditFilePath()
  if (!fs.existsSync(p)) return []
  const applyRetention = opts?.applyRetention !== false
  const cutoff = applyRetention
    ? Date.now() - state.retentionDays * 24 * 3600_000
    : 0
  const max = Math.max(1, Math.min(10_000, Math.floor(limit) || 100))
  const text = fs.readFileSync(p, 'utf-8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const out: AuditRecord[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < max; i--) {
    try {
      const row = JSON.parse(lines[i]) as AuditRecord
      if (!row?.actor || !row?.action || !row?.resource || !row?.at) continue
      if (applyRetention) {
        const t = Date.parse(row.at)
        if (!Number.isFinite(t) || t < cutoff) continue
      }
      out.push({
        actor: row.actor,
        action: row.action,
        resource: row.resource,
        detail: row.detail,
        at: row.at,
      })
    } catch {
      /* skip corrupt line */
    }
  }
  return out
}

export function getAuditState(): AuditState {
  return { ...state }
}

export function isAuditReady(): boolean {
  return state.ready
}

export function initAudit(opts: { dataDir: string }): AuditState {
  dataDirRef = opts.dataDir
  const p = ensureAuditFile()
  state.ready = true
  state.auditPath = p
  state.recorded = 0
  state.retentionDays = AUDIT_RETENTION_DAYS
  return getAuditState()
}

export function resetAudit(): void {
  dataDirRef = null
  state.ready = false
  state.auditPath = null
  state.recorded = 0
}

export function ready_rb_l1_host_audit_01(): boolean {
  return isAuditReady()
}
