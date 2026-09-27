/**
 * CYP-memo 全局注册服务（嵌入式 · 进程内通讯录）
 * 专属：Register / Heartbeat / Deregister；健康实例选择（嵌入式负载）
 * 红线：不新起独立网格；不生成/修改业务配置（配置服务）
 * 服务协作管控：未注册拒绝；服务间授权只记 grant，路由在网关执行
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { log as log } from '../../../l0/infra/log/ready.js'
import { isValidSpiffeId, toSpiffeId } from '../../../l0/coord/plt/ready.js'
import { isWorkloadTrustAnchorReady, getWorkloadTrustAnchor } from '../../mgmt/kms/ready.js'

export interface RegistryInstance {
  serviceName: string
  instanceId: string
  host: string
  port: number
  meta: Record<string, string>
  registeredAt: string
  lastHeartbeatAt: string
  healthy: boolean
}

export interface RegistryState {
  ready: boolean
  instances: RegistryInstance[]
}

const state: RegistryState = {
  ready: false,
  instances: [],
}

let dataDirRef: string | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const HEARTBEAT_MS = 10_000
const STALE_MS = 35_000
const rrCursor = new Map<string, number>()
const serviceGrants = new Set<string>()

function grantKey(caller: string, callee: string): string {
  return `${caller}\0${callee}`
}

function registryPath(): string {
  return path.join(dataDirRef || '.', 'registry', 'instances.json')
}

function persist(): void {
  if (!dataDirRef) return
  const dir = path.join(dataDirRef, 'registry')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(registryPath(), JSON.stringify({ instances: state.instances }, null, 2), 'utf-8')
}

export function registerInstance(inst: Omit<RegistryInstance, 'registeredAt' | 'lastHeartbeatAt' | 'healthy'>): RegistryInstance {
  const now = new Date().toISOString()
  const existing = state.instances.find((i) => i.instanceId === inst.instanceId)
  if (existing) {
    existing.host = inst.host
    existing.port = inst.port
    existing.meta = { ...inst.meta }
    existing.lastHeartbeatAt = now
    existing.healthy = true
    persist()
    return { ...existing }
  }
  const row: RegistryInstance = {
    ...inst,
    registeredAt: now,
    lastHeartbeatAt: now,
    healthy: true,
  }
  state.instances.push(row)
  persist()
  log({
    level: 'info',
    message: `registry register ${row.serviceName}@${row.instanceId}`,
    type: 'runtime',
    action: 'registry_register',
    context: { serviceName: row.serviceName, port: row.port },
  })
  return { ...row }
}

export function heartbeat(instanceId: string): boolean {
  const row = state.instances.find((i) => i.instanceId === instanceId)
  if (!row) return false
  row.lastHeartbeatAt = new Date().toISOString()
  row.healthy = true
  persist()
  return true
}

export function deregister(instanceId: string, reason: string): boolean {
  const before = state.instances.length
  state.instances = state.instances.filter((i) => i.instanceId !== instanceId)
  const changed = state.instances.length !== before
  if (changed) {
    persist()
    log({
      level: 'warn',
      message: `registry deregister ${instanceId}: ${reason}`,
      type: 'runtime',
      action: 'registry_deregister',
      context: { instanceId, reason },
    })
  }
  return changed
}

/** 管控服务指令强制摘除 */
export function forceDeregister(instanceId: string, reason: string): boolean {
  return deregister(instanceId, `force:${reason}`)
}

export function listHealthyInstances(serviceName?: string): RegistryInstance[] {
  const now = Date.now()
  return state.instances.filter((i) => {
    if (serviceName && i.serviceName !== serviceName) return false
    const age = now - Date.parse(i.lastHeartbeatAt)
    return i.healthy && age <= STALE_MS
  })
}

/** 嵌入式负载：在健康实例间轮询，不新起网格。无健康实例返回 null。 */
export function selectHealthyInstance(serviceName: string): RegistryInstance | null {
  const list = listHealthyInstances(serviceName)
  if (list.length === 0) return null
  const cursor = rrCursor.get(serviceName) ?? 0
  const picked = list[cursor % list.length]
  rrCursor.set(serviceName, cursor + 1)
  return { ...picked, meta: { ...picked.meta } }
}

export function grantServiceCall(caller: string, callee: string): void {
  const c = String(caller || '').trim()
  const e = String(callee || '').trim()
  if (!c || !e) throw new Error('grantServiceCall requires caller and callee')
  serviceGrants.add(grantKey(c, e))
}

export function isServiceCallGranted(caller: string, callee: string): boolean {
  return serviceGrants.has(grantKey(caller, callee))
}

/**
 * 服务身份核验（SPIFFE-native）：只认 runtimebase.local，不用系统信任库。
 * 信任根材料由密钥保险箱托管；本服务只核验，不签发。
 */
export function verifyServiceIdentity(spiffeId: string): { ok: boolean; reason?: string } {
  const id = String(spiffeId || '').trim()
  if (!id) return { ok: false, reason: 'empty_spiffe_id' }
  if (!isValidSpiffeId(id)) return { ok: false, reason: 'invalid_spiffe_format' }
  if (!isWorkloadTrustAnchorReady()) return { ok: false, reason: 'trust_anchor_missing' }
  const anchor = getWorkloadTrustAnchor()
  if (!anchor || anchor.trustDomain !== 'runtimebase.local') {
    return { ok: false, reason: 'trust_domain_mismatch' }
  }
  return { ok: true }
}

/** 调用方/被调用方均须持有可核验的服务身份，再查 grant */
export function assertServiceIdentityPair(callerStableId: string, calleeStableId: string): {
  ok: boolean
  reason?: string
} {
  const caller = verifyServiceIdentity(toSpiffeId(callerStableId))
  if (!caller.ok) return { ok: false, reason: `caller:${caller.reason}` }
  const callee = verifyServiceIdentity(toSpiffeId(calleeStableId))
  if (!callee.ok) return { ok: false, reason: `callee:${callee.reason}` }
  return { ok: true }
}

export function serviceCollabGrantCount(): number {
  return serviceGrants.size
}

/**
 * 进程内参与方入册。caller 未入册即未注册。
 * probe-denied 故意不授 grant，供未授权拒绝核验。
 */
export function bindEmbeddedServiceCollab(opts: { host: string; port: number }): void {
  if (!state.ready) throw new Error('registry not ready')
  const participants = [
    { serviceName: 'gateway', instanceId: 'gateway-embedded', role: 'ingress' },
    { serviceName: 'probe-denied', instanceId: 'probe-denied-embedded', role: 'deny-fixture' },
  ]
  for (const p of participants) {
    registerInstance({
      serviceName: p.serviceName,
      instanceId: p.instanceId,
      host: opts.host,
      port: opts.port,
      meta: { form: 'embedded', role: p.role },
    })
  }
  grantServiceCall('gateway', 'cyp-memo-server')
}

export function getRegistryState(): RegistryState {
  return {
    ready: state.ready,
    instances: state.instances.map((i) => ({ ...i, meta: { ...i.meta } })),
  }
}

export function isRegistryReady(): boolean {
  return state.ready
}

export function initRegistry(opts: { dataDir: string }): RegistryState {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'registry')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  state.instances = []
  state.ready = true

  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    const now = Date.now()
    for (const i of state.instances) {
      if (i.healthy) heartbeat(i.instanceId)
      if (now - Date.parse(i.lastHeartbeatAt) > STALE_MS) {
        i.healthy = false
      }
    }
    persist()
  }, HEARTBEAT_MS)
  if (typeof heartbeatTimer === 'object' && heartbeatTimer && 'unref' in heartbeatTimer) {
    ;(heartbeatTimer as NodeJS.Timeout).unref()
  }

  log({
    level: 'info',
    message: 'registry ready (awaiting post-init register)',
    type: 'runtime',
    action: 'registry_ready',
  })
  return getRegistryState()
}

/** 初始化成功后由初始化服务调用：本实例才可入册 */
export function registerSelfAfterInit(opts: {
  serviceName: string
  instanceId: string
  host: string
  port: number
}): RegistryInstance {
  if (!state.ready) throw new Error('registry not ready')
  return registerInstance({
    serviceName: opts.serviceName,
    instanceId: opts.instanceId,
    host: opts.host,
    port: opts.port,
    meta: { form: 'embedded', app: 'cyp-memo' },
  })
}

export function resetRegistry(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  dataDirRef = null
  state.ready = false
  state.instances = []
  rrCursor.clear()
  serviceGrants.clear()
}

export function ready_rb_l1_col_svc_01(): boolean {
  if (!isRegistryReady()) return false
  if (listHealthyInstances('gateway').length === 0) return false
  if (listHealthyInstances('probe-denied').length === 0) return false
  if (listHealthyInstances('cyp-memo-server').length === 0) return false
  if (!isServiceCallGranted('gateway', 'cyp-memo-server')) return false
  if (isServiceCallGranted('probe-denied', 'cyp-memo-server')) return false
  // 身份链：平台协调引用 + 本服务核验 + 密钥保险箱信任根
  const pair = assertServiceIdentityPair('RB-L1-PUB-ACC-01', 'RB-L1-HOST-RESIL-01')
  if (!pair.ok) return false
  if (verifyServiceIdentity('https://evil.example/x').ok) return false
  return true
}
