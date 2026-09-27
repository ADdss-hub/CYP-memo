/**
 * 启动依赖管控 · RB-L1-MGMT-BOOT-01
 * 专属：启动顺序与依赖探活；失败拒绝进入就绪。
 * 红线：不替代初始化组件的模块加载；探活门禁由本服务持有。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import {
  getBootstrapReadyFlag,
  getBootstrapConfigReadyFlag,
  getBootstrapFinishedFlag,
} from '../../../l0/infra/init/ready.js'

export type BootProbeStatus = 'pending' | 'ok' | 'fail'

export interface BootProbeRow {
  id: string
  label: string
  status: BootProbeStatus
  detail?: string
  at?: string
}

const probes = new Map<string, BootProbeRow>()
let bootGateReady = false

export function initBootDependencyGate(): { ready: boolean } {
  bootGateReady = true
  return { ready: true }
}

export function resetBootDependencyGate(): void {
  bootGateReady = false
  probes.clear()
}

export function registerBootProbe(id: string, label: string): void {
  const key = String(id || '').trim()
  if (!key) return
  probes.set(key, {
    id: key,
    label: String(label || key).slice(0, 120),
    status: 'pending',
  })
}

export function markBootProbe(id: string, status: BootProbeStatus, detail?: string): void {
  const key = String(id || '').trim()
  if (!key) return
  const prev = probes.get(key)
  probes.set(key, {
    id: key,
    label: prev?.label || key,
    status,
    detail: detail ? String(detail).slice(0, 240) : undefined,
    at: new Date().toISOString(),
  })
}

export function listBootProbes(): BootProbeRow[] {
  return [...probes.values()].map((r) => ({ ...r }))
}

export function isBootDependencyGateOpen(): boolean {
  if (!bootGateReady) return false
  if (!getBootstrapConfigReadyFlag()) return false
  if (!getBootstrapReadyFlag()) return false
  if (!getBootstrapFinishedFlag()) return false
  const rows = [...probes.values()]
  if (rows.length === 0) return false
  if (rows.some((r) => r.status === 'fail' || r.status === 'pending')) return false
  return rows.every((r) => r.status === 'ok')
}

/** 实现锚点 · RB-L1-MGMT-BOOT-01 */
export function ready_rb_l1_mgmt_boot_01(): boolean {
  return isBootDependencyGateOpen()
}
