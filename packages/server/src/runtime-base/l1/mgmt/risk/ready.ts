/**
 * 风险运行管控 · RB-L1-MGMT-RISK-01
 * 专属：告警收敛与处置记录落盘，回链全链路日志。
 * 红线：不持有态势采集窗口；不持有规则阈值权威（归规则校验研判）。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { log as log } from '../../../l0/infra/log/ready.js'

let riskDataDir: string | null = null
let riskReady = false

export function initRiskControl(opts?: { dataDir?: string }): { ready: boolean } {
  riskDataDir = opts?.dataDir?.trim() || null
  if (riskDataDir) {
    const dir = path.join(riskDataDir, 'risk')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  riskReady = true
  return { ready: true }
}

export function resetRiskControl(): void {
  riskReady = false
  riskDataDir = null
}

/** 5.7 风险运行管控：告警收敛与处置记录可落盘 */
export function isRiskDispositionReady(): boolean {
  return riskReady && Boolean(riskDataDir)
}

function riskDispositionPath(): string {
  return path.join(riskDataDir || '.', 'risk', 'dispositions.jsonl')
}

export interface RiskDispositionRecord {
  at: string
  alertId: string
  action: 'converge' | 'assign' | 'close' | 'suppress'
  actor: string
  detail?: string
}

export function recordRiskDisposition(input: {
  alertId: string
  action: RiskDispositionRecord['action']
  actor: string
  detail?: string
}): RiskDispositionRecord | null {
  if (!isRiskDispositionReady()) return null
  const row: RiskDispositionRecord = {
    at: new Date().toISOString(),
    alertId: String(input.alertId || '').slice(0, 80),
    action: input.action,
    actor: String(input.actor || 'ops').slice(0, 120),
    detail: input.detail ? String(input.detail).slice(0, 240) : undefined,
  }
  if (!row.alertId) return null
  fs.appendFileSync(riskDispositionPath(), `${JSON.stringify(row)}\n`, 'utf-8')
  log({
    level: 'info',
    type: 'security',
    message: `risk_disposition_${row.action}`,
    action: 'risk_disposition',
    context: row as unknown as Record<string, unknown>,
  })
  return row
}

export function listRecentRiskDispositions(limit = 50): RiskDispositionRecord[] {
  const file = riskDispositionPath()
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean)
  const out: RiskDispositionRecord[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < Math.min(Math.max(limit, 1), 200); i--) {
    try {
      out.push(JSON.parse(lines[i]) as RiskDispositionRecord)
    } catch {
      /* skip */
    }
  }
  return out
}

/** 实现锚点 · RB-L1-MGMT-RISK-01 */
export function ready_rb_l1_mgmt_risk_01(): boolean {
  return Boolean(riskReady && isRiskDispositionReady())
}
