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
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import {
  issueEastWestToken,
  assertEastWestToken,
  tryAcquire as rateLimitTryAcquire,
  isRateLimiterEnabled,
  registerPolicy,
} from '../../host/biz/ready.js'
import { isMtlsEnabledFlag, spiffeAuthMiddleware, verifySpiffeCert } from '../../../../_kms-internal/mtls.js'
import { getCircuitState, egressFetch } from '../../host/resil/egress.js'
import { getRequestTraceId } from '../../mgmt/trace/ready.js'
import { fail, Err } from '../../mgmt/code/ready.js'
import { publishDomainEvent } from '../evt/ready.js'

// ============================================================
// Consul 服务注册与发现适配器（原 consul-adapter.ts，合并入锚点文件）
// ============================================================

export interface ConsulServiceMeta {
  /** 服务名称：cyp-memo-gateway / cyp-memo-api / cyp-memo-mcp / cyp-memo-kms */
  serviceName: string
  /** 实例唯一标识 */
  instanceId: string
  /** 服务监听地址 */
  host: string
  /** 服务监听端口 */
  port: number
  /** 服务标签（env=prod, role=api 等） */
  tags: string[]
  /** 版本号 */
  version: string
  /** 健康检查 HTTP 路径（相对路径，Consul 用 host:port + path 探活） */
  healthCheckPath?: string
  /** 健康检查 TTL 秒数（0 表示使用 HTTP 检查而非 TTL） */
  healthCheckTtlSec?: number
  /** 附加元数据 */
  meta?: Record<string, string>
}

export interface ConsulDiscoveredInstance {
  serviceName: string
  instanceId: string
  host: string
  port: number
  tags: string[]
  meta: Record<string, string>
  healthy: boolean
}

export interface ConsulAdapterState {
  ready: boolean
  mode: 'consul'
  consulAddr: string
  registeredServices: string[]
}

const consulAdapterState = {
  ready: false,
  consulAddr: 'http://127.0.0.1:8500',
  registeredServices: new Set<string>(),
  heartbeatTimers: new Map<string, ReturnType<typeof setInterval>>(),
  deregisterOnExit: true,
}

let consulToken: string | null = null

function consulApiUrl(p: string): string {
  const base = consulAdapterState.consulAddr.replace(/\/$/, '')
  return `${base}/v1${p}`
}

async function consulFetch(
  p: string,
  opts: {
    method?: string
    body?: unknown
    expectStatus?: number
  } = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = consulApiUrl(p)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (consulToken) {
    headers['X-Consul-Token'] = consulToken
  }
  try {
    const resp = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    let data: unknown = null
    const text = await resp.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    const ok = opts.expectStatus
      ? resp.status === opts.expectStatus
      : resp.status >= 200 && resp.status < 300
    return { ok, status: resp.status, data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: err instanceof Error ? err.message : String(err) },
    }
  }
}

export async function consulRegisterService(
  meta: ConsulServiceMeta
): Promise<{ ok: boolean; error?: string }> {
  if (!consulAdapterState.ready) {
    return { ok: false, error: 'consul adapter not ready' }
  }

  const check: Record<string, unknown> = {}

  if (meta.healthCheckTtlSec && meta.healthCheckTtlSec > 0) {
    check['TTL'] = `${meta.healthCheckTtlSec}s`
    check['DeregisterCriticalServiceAfter'] = `${Math.max(meta.healthCheckTtlSec * 3, 30)}s`
  }
  else if (meta.healthCheckPath) {
    check['HTTP'] = `http://${meta.host}:${meta.port}${meta.healthCheckPath}`
    check['Method'] = 'GET'
    check['Interval'] = '10s'
    check['Timeout'] = '5s'
    check['DeregisterCriticalServiceAfter'] = '1m'
  }
  else {
    check['TTL'] = '30s'
    check['DeregisterCriticalServiceAfter'] = '1m'
  }

  const registration = {
    ID: meta.instanceId,
    Name: meta.serviceName,
    Address: meta.host,
    Port: meta.port,
    Tags: meta.tags,
    Meta: {
      version: meta.version,
      ...meta.meta,
    },
    Check: check,
  }

  const result = await consulFetch('/agent/service/register', {
    method: 'PUT',
    body: registration,
    expectStatus: 200,
  })

  if (!result.ok) {
    const errMsg = typeof result.data === 'object' && result.data && 'error' in result.data
      ? String((result.data as Record<string, unknown>).error)
      : `HTTP ${result.status}`
    log({
      level: 'warn',
      message: `consul register failed: ${meta.serviceName}@${meta.instanceId}`,
      type: 'runtime',
      action: 'consul_register_fail',
      context: { serviceName: meta.serviceName, error: errMsg },
    })
    return { ok: false, error: errMsg }
  }

  consulAdapterState.registeredServices.add(meta.instanceId)

  if (meta.healthCheckTtlSec && meta.healthCheckTtlSec > 0) {
    startConsulHeartbeat(meta.instanceId, meta.healthCheckTtlSec)
  }

  log({
    level: 'info',
    message: `consul registered ${meta.serviceName}@${meta.instanceId}`,
    type: 'runtime',
    action: 'consul_register',
    context: {
      serviceName: meta.serviceName,
      instanceId: meta.instanceId,
      port: meta.port,
      tags: meta.tags,
    },
  })

  return { ok: true }
}

export async function consulDeregisterService(instanceId: string): Promise<boolean> {
  if (!consulAdapterState.ready) return false

  stopConsulHeartbeat(instanceId)

  const result = await consulFetch(`/agent/service/deregister/${encodeURIComponent(instanceId)}`, {
    method: 'PUT',
    expectStatus: 200,
  })

  if (result.ok) {
    consulAdapterState.registeredServices.delete(instanceId)
    log({
      level: 'info',
      message: `consul deregistered ${instanceId}`,
      type: 'runtime',
      action: 'consul_deregister',
      context: { instanceId },
    })
    return true
  }

  log({
    level: 'warn',
    message: `consul deregister failed: ${instanceId}`,
    type: 'runtime',
    action: 'consul_deregister_fail',
    context: { instanceId, status: result.status },
  })
  return false
}

export async function consulPassCheck(instanceId: string): Promise<boolean> {
  if (!consulAdapterState.ready) return false

  const checkId = `service:${instanceId}`
  const result = await consulFetch(`/agent/check/pass/${encodeURIComponent(checkId)}`, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

export async function consulWarnCheck(instanceId: string, note?: string): Promise<boolean> {
  if (!consulAdapterState.ready) return false

  const checkId = `service:${instanceId}`
  const pathv = note
    ? `/agent/check/warn/${encodeURIComponent(checkId)}?note=${encodeURIComponent(note)}`
    : `/agent/check/warn/${encodeURIComponent(checkId)}`
  const result = await consulFetch(pathv, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

export async function consulFailCheck(instanceId: string, note?: string): Promise<boolean> {
  if (!consulAdapterState.ready) return false

  const checkId = `service:${instanceId}`
  const pathv = note
    ? `/agent/check/fail/${encodeURIComponent(checkId)}?note=${encodeURIComponent(note)}`
    : `/agent/check/fail/${encodeURIComponent(checkId)}`
  const result = await consulFetch(pathv, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

function startConsulHeartbeat(instanceId: string, ttlSec: number): void {
  stopConsulHeartbeat(instanceId)
  const intervalMs = Math.floor((ttlSec * 1000) / 3)
  const timer = setInterval(() => {
    consulPassCheck(instanceId).catch(() => {})
  }, intervalMs)
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    ;(timer as NodeJS.Timeout).unref()
  }
  consulAdapterState.heartbeatTimers.set(instanceId, timer)
}

function stopConsulHeartbeat(instanceId: string): void {
  const timer = consulAdapterState.heartbeatTimers.get(instanceId)
  if (timer) {
    clearInterval(timer)
    consulAdapterState.heartbeatTimers.delete(instanceId)
  }
}

export async function consulDiscoverService(
  serviceName: string,
  opts?: {
    tags?: string[]
    onlyHealthy?: boolean
  }
): Promise<ConsulDiscoveredInstance[]> {
  if (!consulAdapterState.ready) return []

  const onlyHealthy = opts?.onlyHealthy !== false
  const tags = opts?.tags || []

  const params = new URLSearchParams()
  if (onlyHealthy) {
    params.set('passing', '1')
  }
  for (const tag of tags) {
    params.append('tag', tag)
  }
  const qs = params.toString()
  const pathv = `/health/service/${encodeURIComponent(serviceName)}${qs ? `?${qs}` : ''}`

  const result = await consulFetch(pathv, {
    method: 'GET',
  })

  if (!result.ok || !Array.isArray(result.data)) {
    return []
  }

  const entries = result.data as Array<{
    Service: {
      ID: string
      Service: string
      Address: string
      Port: number
      Tags: string[]
      Meta?: Record<string, string>
    }
    Checks: Array<{
      Status: string
    }>
  }>

  return entries.map((entry) => ({
    serviceName: entry.Service.Service,
    instanceId: entry.Service.ID,
    host: entry.Service.Address,
    port: entry.Service.Port,
    tags: entry.Service.Tags || [],
    meta: entry.Service.Meta || {},
    healthy: entry.Checks.every((c) => c.Status === 'passing'),
  }))
}

export async function consulListServices(): Promise<string[]> {
  if (!consulAdapterState.ready) return []

  const result = await consulFetch('/catalog/services', {
    method: 'GET',
  })

  if (!result.ok || typeof result.data !== 'object' || !result.data) {
    return []
  }

  return Object.keys(result.data as Record<string, string[]>)
}

export async function consulDiscoverByTags(
  tags: string[],
  onlyHealthy = true
): Promise<ConsulDiscoveredInstance[]> {
  if (!consulAdapterState.ready || tags.length === 0) return []

  const services = await consulListServices()
  const allInstances: ConsulDiscoveredInstance[] = []

  for (const svc of services) {
    const instances = await consulDiscoverService(svc, { tags, onlyHealthy })
    allInstances.push(...instances)
  }

  return allInstances
}

export interface ConsulAdapterOptions {
  /** Consul Agent HTTP 地址 */
  consulAddr?: string
  /** Consul ACL Token（可选） */
  consulToken?: string
  /** 退出时是否自动注销（默认 true） */
  deregisterOnExit?: boolean
}

export function initConsulAdapter(opts: ConsulAdapterOptions = {}): ConsulAdapterState {
  consulAdapterState.consulAddr = opts.consulAddr || process.env.CONSUL_HTTP_ADDR || 'http://127.0.0.1:8500'
  consulToken = opts.consulToken || process.env.CONSUL_HTTP_TOKEN || null
  consulAdapterState.deregisterOnExit = opts.deregisterOnExit !== false
  consulAdapterState.ready = true

  log({
    level: 'info',
    message: 'consul adapter ready',
    type: 'runtime',
    action: 'consul_adapter_ready',
    context: {
      consulAddr: consulAdapterState.consulAddr,
      hasToken: Boolean(consulToken),
    },
  })

  if (consulAdapterState.deregisterOnExit) {
    const gracefulShutdown = (): void => {
      if (!consulAdapterState.ready) return
      const ids = Array.from(consulAdapterState.registeredServices)
      for (const id of ids) {
        consulDeregisterService(id).catch(() => {})
      }
    }

    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)
    process.on('beforeExit', gracefulShutdown)
  }

  return getConsulAdapterState()
}

export function resetConsulAdapter(): void {
  for (const id of Array.from(consulAdapterState.heartbeatTimers.keys())) {
    stopConsulHeartbeat(id)
  }
  consulAdapterState.registeredServices.clear()
  consulAdapterState.ready = false
  consulToken = null
}

export function getConsulAdapterState(): ConsulAdapterState {
  return {
    ready: consulAdapterState.ready,
    mode: 'consul',
    consulAddr: consulAdapterState.consulAddr,
    registeredServices: Array.from(consulAdapterState.registeredServices),
  }
}

export function isConsulAdapterReady(): boolean {
  return consulAdapterState.ready
}

export async function probeConsulAgent(): Promise<{
  reachable: boolean
  leader?: string
  version?: string
}> {
  const result = await consulFetch('/status/leader', { method: 'GET' })
  if (!result.ok) {
    return { reachable: false }
  }
  const leader = typeof result.data === 'string' ? result.data : undefined
  return { reachable: true, leader }
}

// ============================================================
// 全局注册服务（嵌入式 · 进程内通讯录）
// ============================================================

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

/** 服务注册模式：local = 本地内存/文件（单机默认）；consul = Consul Agent（集群） */
export type ServiceRegistryMode = 'local' | 'consul'

/** 统一注册选项 */
export interface ServiceRegisterOptions {
  serviceName: string
  instanceId: string
  host: string
  port: number
  /** 服务标签（env=prod, role=api 等） */
  tags?: string[]
  /** 版本号 */
  version?: string
  /** 健康检查 HTTP 路径（Consul HTTP 检查用） */
  healthCheckPath?: string
  /** 健康检查 TTL 秒数（Consul TTL 检查用；0 = 使用 HTTP 检查） */
  healthCheckTtlSec?: number
  /** 附加元数据 */
  meta?: Record<string, string>
}

/** 统一服务发现选项 */
export interface ServiceDiscoverOptions {
  serviceName: string
  /** 按标签过滤 */
  tags?: string[]
  /** 仅返回健康实例 */
  onlyHealthy?: boolean
}

const state: RegistryState = {
  ready: false,
  instances: [],
}

/** 当前注册模式（默认 local，对单机零侵入） */
let registryMode: ServiceRegistryMode = 'local'

/** 获取当前注册模式 */
export function getRegistryMode(): ServiceRegistryMode {
  return registryMode
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

/** 嵌入式发现：进程内通讯录，不是独立服务网格。 */
export function discoverEmbeddedMesh(): {
  form: 'embedded'
  independentMesh: false
  services: Array<{ serviceName: string; instanceId: string; healthy: boolean; host: string; port: number }>
  grantCount: number
} {
  const now = Date.now()
  return {
    form: 'embedded',
    independentMesh: false,
    services: state.instances.map((i) => ({
      serviceName: i.serviceName,
      instanceId: i.instanceId,
      healthy: i.healthy && now - Date.parse(i.lastHeartbeatAt) <= STALE_MS,
      host: i.host,
      port: i.port,
    })),
    grantCount: serviceGrants.size,
  }
}

/**
 * 嵌入式路由：注册 + 健康选择 + grant。不是独立网格数据面。
 */
export function routeEmbeddedCall(opts: { caller: string; callee: string }):
  | { ok: true; instanceId: string }
  | { ok: false; reason: 'unregistered' | 'unauthorized' } {
  const caller = String(opts.caller || '').trim()
  const callee = String(opts.callee || '').trim()
  if (listHealthyInstances(caller).length === 0 || listHealthyInstances(callee).length === 0) {
    return { ok: false, reason: 'unregistered' }
  }
  if (!isServiceCallGranted(caller, callee)) return { ok: false, reason: 'unauthorized' }
  const picked = selectHealthyInstance(callee)
  if (!picked) return { ok: false, reason: 'unregistered' }
  return { ok: true, instanceId: picked.instanceId }
}

export function runMeshDiscoverProbe(): {
  formEmbedded: boolean
  noIndependentMesh: boolean
  gatewayFound: boolean
  serverFound: boolean
  routeGranted: boolean
  routeDenied: boolean
} {
  const d = discoverEmbeddedMesh()
  const allow = routeEmbeddedCall({ caller: 'gateway', callee: 'cyp-memo-server' })
  const deny = routeEmbeddedCall({ caller: 'probe-denied', callee: 'cyp-memo-server' })
  return {
    formEmbedded: d.form === 'embedded',
    noIndependentMesh: d.independentMesh === false,
    gatewayFound: d.services.some((s) => s.serviceName === 'gateway' && s.healthy),
    serverFound: d.services.some((s) => s.serviceName === 'cyp-memo-server' && s.healthy),
    routeGranted: allow.ok === true,
    routeDenied: deny.ok === false && deny.reason === 'unauthorized',
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
  // 同步重置 Consul 适配器
  if (isConsulAdapterReady()) {
    resetConsulAdapter()
  }
}

// ============== 双模式统一接口 ==============

/**
 * 统一服务注册入口
 * - local 模式：注册到本地内存 + JSON 文件持久化
 * - consul 模式：注册到 Consul Agent（TTL 健康检查）
 */
export async function registerService(opts: ServiceRegisterOptions): Promise<{
  ok: boolean
  instance?: RegistryInstance
  error?: string
}> {
  const tags = opts.tags || []
  const version = opts.version || '0.0.0'
  const meta: Record<string, string> = {
    version,
    ...opts.meta,
  }

  // local 模式：沿用原有嵌入式实现
  if (registryMode === 'local') {
    const inst = registerInstance({
      serviceName: opts.serviceName,
      instanceId: opts.instanceId,
      host: opts.host,
      port: opts.port,
      meta: {
        ...meta,
        tags: tags.join(','),
      },
    })
    return { ok: true, instance: inst }
  }

  // consul 模式
  if (registryMode === 'consul') {
    const consulMeta: ConsulServiceMeta = {
      serviceName: opts.serviceName,
      instanceId: opts.instanceId,
      host: opts.host,
      port: opts.port,
      tags,
      version,
      healthCheckPath: opts.healthCheckPath,
      healthCheckTtlSec: opts.healthCheckTtlSec ?? 30,
      meta,
    }
    const result = await consulRegisterService(consulMeta)
    if (result.ok) {
      // 同时在本地注册表也存一份（用于进程内快速查询）
      registerInstance({
        serviceName: opts.serviceName,
        instanceId: opts.instanceId,
        host: opts.host,
        port: opts.port,
        meta: { ...meta, mode: 'consul', tags: tags.join(',') },
      })
      return { ok: true }
    }
    // 降级保护：Consul 注册失败时，自动回退到本地注册（不阻塞启动）
    log({
      level: 'warn',
      message: `consul register failed, falling back to local registry: ${opts.serviceName}`,
      type: 'runtime',
      action: 'consul_register_degraded_fallback',
      context: {
        serviceName: opts.serviceName,
        error: result.error,
        degraded: true,
      },
    })
    const inst = registerInstance({
      serviceName: opts.serviceName,
      instanceId: opts.instanceId,
      host: opts.host,
      port: opts.port,
      meta: {
        ...meta,
        tags: tags.join(','),
        degraded: 'true',
        degradedReason: result.error || 'consul_unreachable',
      },
    })
    return { ok: true, instance: inst }
  }

  return { ok: false, error: `unknown registry mode: ${registryMode}` }
}

/**
 * 统一服务注销入口
 */
export async function deregisterService(instanceId: string, reason: string): Promise<boolean> {
  // local 模式
  if (registryMode === 'local') {
    return deregister(instanceId, reason)
  }

  // consul 模式
  if (registryMode === 'consul') {
    const consulOk = await consulDeregisterService(instanceId)
    // 同步清理本地缓存
    deregister(instanceId, reason)
    return consulOk
  }

  return false
}

/**
 * 统一服务发现入口
 * - local 模式：从本地注册表查询
 * - consul 模式：从 Consul Catalog 查询
 */
export async function discoverService(opts: ServiceDiscoverOptions): Promise<RegistryInstance[]> {
  const serviceName = opts.serviceName
  const onlyHealthy = opts.onlyHealthy !== false
  const tags = opts.tags || []

  // local 模式：从本地内存查询（标签过滤在 meta.tags 中匹配）
  if (registryMode === 'local') {
    let list = onlyHealthy ? listHealthyInstances(serviceName) : state.instances.filter(i => i.serviceName === serviceName)
    if (tags.length > 0) {
      list = list.filter((i) => {
        const instanceTags = (i.meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
        return tags.every((t) => instanceTags.includes(t))
      })
    }
    return list
  }

  // consul 模式
  if (registryMode === 'consul') {
    const instances = await consulDiscoverService(serviceName, { tags, onlyHealthy })
    return instances.map((ci: ConsulDiscoveredInstance) => ({
      serviceName: ci.serviceName,
      instanceId: ci.instanceId,
      host: ci.host,
      port: ci.port,
      meta: ci.meta,
      registeredAt: '',
      lastHeartbeatAt: new Date().toISOString(),
      healthy: ci.healthy,
    }))
  }

  return []
}

/**
 * 按标签发现服务（跨服务名）
 */
export async function discoverServicesByTags(
  tags: string[],
  onlyHealthy = true
): Promise<RegistryInstance[]> {
  if (registryMode === 'local') {
    const now = Date.now()
    return state.instances.filter((i) => {
      if (onlyHealthy) {
        const age = now - Date.parse(i.lastHeartbeatAt)
        if (!i.healthy || age > STALE_MS) return false
      }
      const instanceTags = (i.meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
      return tags.every((t) => instanceTags.includes(t))
    })
  }

  if (registryMode === 'consul') {
    const instances = await consulDiscoverByTags(tags, onlyHealthy)
    return instances.map((ci: ConsulDiscoveredInstance) => ({
      serviceName: ci.serviceName,
      instanceId: ci.instanceId,
      host: ci.host,
      port: ci.port,
      meta: ci.meta,
      registeredAt: '',
      lastHeartbeatAt: new Date().toISOString(),
      healthy: ci.healthy,
    }))
  }

  return []
}

/**
 * 手动上报健康状态（TTL 模式下使用）
 * - local 模式：更新本地心跳时间
 * - consul 模式：上报 TTL pass
 */
export async function reportHealth(instanceId: string): Promise<boolean> {
  if (registryMode === 'local') {
    return heartbeat(instanceId)
  }
  if (registryMode === 'consul') {
    // 同步更新本地缓存的心跳
    heartbeat(instanceId)
    return consulPassCheck(instanceId)
  }
  return false
}

/**
 * 初始化服务注册模块（统一运行模式 · 默认 consul，不可达自动降级保护）
 * @param mode 注册模式，默认从 SERVICE_REGISTRY_MODE 环境变量读取，缺省 consul
 */
export function initServiceRegistry(opts: {
  dataDir: string
  mode?: ServiceRegistryMode
  consulAddr?: string
  consulToken?: string
}): {
  ready: boolean
  mode: ServiceRegistryMode
  degraded: boolean
  consulAddr?: string
} {
  const mode = opts.mode ||
    (process.env.SERVICE_REGISTRY_MODE as ServiceRegistryMode | undefined) ||
    'consul'

  registryMode = mode === 'local' ? 'local' : 'consul'

  // 先初始化 local 模式（作为基础能力 + 降级缓存层）
  initRegistry({ dataDir: opts.dataDir })

  let degraded = false

  // consul 模式初始化适配器 + 探测可达性（不可达则进入降级保护状态）
  if (registryMode === 'consul') {
    initConsulAdapter({
      consulAddr: opts.consulAddr || process.env.CONSUL_HTTP_ADDR,
      consulToken: opts.consulToken || process.env.CONSUL_HTTP_TOKEN,
    })
    // 异步探测 Consul Agent 可达性，不可达则标记降级保护
    probeConsulAgent().then((probe) => {
      degraded = !probe.reachable
      log({
        level: probe.reachable ? 'info' : 'warn',
        message: probe.reachable
          ? 'consul agent reachable (full cluster mode)'
          : 'consul agent unreachable - degraded protection mode active',
        type: 'runtime',
        action: 'consul_probe',
        context: {
          consulAddr: getConsulAdapterState().consulAddr,
          reachable: probe.reachable,
          degraded: !probe.reachable,
        },
      })
    }).catch(() => {
      degraded = true
      log({
        level: 'warn',
        message: 'consul agent probe failed - degraded protection mode active',
        type: 'runtime',
        action: 'consul_probe_fail',
        context: {
          consulAddr: getConsulAdapterState().consulAddr,
          degraded: true,
        },
      })
    })
  }

  log({
    level: 'info',
    message: `service registry ready (mode=${registryMode}, degraded=${degraded})`,
    type: 'runtime',
    action: 'service_registry_ready',
    context: {
      mode: registryMode,
      degraded,
      consulAddr: registryMode === 'consul' ? getConsulAdapterState().consulAddr : undefined,
    },
  })

  return {
    ready: true,
    mode: registryMode,
    degraded,
    consulAddr: registryMode === 'consul' ? getConsulAdapterState().consulAddr : undefined,
  }
}

/**
 * 获取服务注册完整状态（双模式统一视图）
 */
export function getServiceRegistryState(): {
  ready: boolean
  mode: ServiceRegistryMode
  localInstanceCount: number
  consul?: {
    addr: string
    registeredCount: number
  }
} {
  const base = {
    ready: state.ready,
    mode: registryMode,
    localInstanceCount: state.instances.length,
  }
  if (registryMode === 'consul' && isConsulAdapterReady()) {
    const cs = getConsulAdapterState()
    return {
      ...base,
      consul: {
        addr: cs.consulAddr,
        registeredCount: cs.registeredServices.length,
      },
    }
  }
  return base
}

/**
 * 解析 CONSUL_SERVICE_TAGS 环境变量（逗号分隔的 key=value 格式）
 */
export function parseConsulServiceTags(envVal?: string): string[] {
  const raw = envVal ?? process.env.CONSUL_SERVICE_TAGS ?? ''
  if (!raw) return ['env=prod', 'app=cyp-memo']
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ============================================================
// East-West 流量管控中间件（原 ew-traffic-middleware.ts，合并入锚点文件）
// ============================================================

export type EwAuthMode = 'mtls' | 'token' | 'both'

export interface EwTrafficMiddlewareOptions {
  /** 认证模式：mtls / token / both（任一通过即可） */
  authMode?: EwAuthMode
  /** 调用方服务名（稳定 ID） */
  callerService?: string
  /** 被调用方服务名（稳定 ID） */
  calleeService?: string
  /** 是否启用限流，默认跟随全局开关 */
  enableRateLimit?: boolean
  /** 限流策略 ID（使用 rate-limiter 中注册的策略） */
  rateLimitPolicyId?: string
  /** 是否启用熔断，默认跟随全局开关 */
  enableCircuitBreaker?: boolean
  /** 熔断依赖名（使用 egress 中的电路名） */
  circuitBreakerName?: string
  /** 是否启用追踪，默认 true */
  enableTracing?: boolean
  /** 允许的 SPIFFE ID 列表 */
  allowedSpiffeIds?: string[]
  /** East-West Token 白名单调用方 */
  allowedTokenCallers?: string[]
  /** 路径前缀（仅匹配此前缀的路径才启用管控） */
  pathPrefix?: string
}

export interface EwTrafficState {
  ready: boolean
  enabled: boolean
  authMode: EwAuthMode
  requestsTotal: number
  requestsAllowed: number
  requestsDenied: number
  rateLimitHits: number
  circuitBreakerRejects: number
  authFailures: number
}

const ewTrafficState: EwTrafficState = {
  ready: false,
  enabled: false,
  authMode: 'token',
  requestsTotal: 0,
  requestsAllowed: 0,
  requestsDenied: 0,
  rateLimitHits: 0,
  circuitBreakerRejects: 0,
  authFailures: 0,
}

function isEwTrafficEnabled(): boolean {
  const val = process.env.CYP_EW_TRAFFIC_ENABLED
  if (val === '0' || val === 'false' || val === 'off') return false
  return true
}

function getConfigAuthMode(): EwAuthMode {
  const mode = process.env.CYP_EW_AUTH_MODE
  if (mode === 'token') return 'token'
  if (mode === 'mtls') return 'mtls'
  return 'both'
}

export function initEwTraffic(): void {
  ewTrafficState.enabled = isEwTrafficEnabled()

  if (!ewTrafficState.enabled) {
    log({
      level: 'warn',
      message: 'East-West traffic middleware explicitly disabled (CYP_EW_TRAFFIC_ENABLED=0)',
      type: 'runtime',
      action: 'ew_traffic_init_skip',
    })
    return
  }

  ewTrafficState.authMode = getConfigAuthMode()

  registerPolicy({
    id: 'ew-service-to-service',
    dimensions: ['spiffe', 'service'],
    ratePerSecond: 500,
    burstCapacity: 1000,
    description: 'East-West 服务间调用限流',
    enabled: true,
  })

  ewTrafficState.ready = true
  log({
    level: 'info',
    message: `East-West traffic middleware ready (auth: ${ewTrafficState.authMode})`,
    type: 'runtime',
    action: 'ew_traffic_ready',
    context: { authMode: ewTrafficState.authMode },
  })
}

export function shutdownEwTraffic(): void {
  ewTrafficState.ready = false
}

export function ewTrafficMiddleware(opts: EwTrafficMiddlewareOptions = {}): RequestHandler {
  const authMode = opts.authMode || getConfigAuthMode()
  const enableRateLimit = opts.enableRateLimit ?? isRateLimiterEnabled()
  const enableCircuitBreaker = opts.enableCircuitBreaker ?? true
  const enableTracing = opts.enableTracing ?? true
  const rateLimitPolicyId = opts.rateLimitPolicyId || 'ew-service-to-service'

  return (req: Request, res: Response, next: NextFunction): void => {
    if (opts.pathPrefix && !req.path.startsWith(opts.pathPrefix)) {
      next()
      return
    }

    ewTrafficState.requestsTotal++

    if (enableTracing) {
      handleTracing(req, res)
    }

    const authResult = handleAuth(req, res, authMode, opts)
    if (!authResult.ok) {
      ewTrafficState.requestsDenied++
      ewTrafficState.authFailures++
      return
    }

    if (enableRateLimit) {
      const limitResult = handleRateLimit(req, rateLimitPolicyId, authResult)
      if (!limitResult.allowed) {
        ewTrafficState.requestsDenied++
        ewTrafficState.rateLimitHits++
        res.setHeader('X-RateLimit-Limit', String(limitResult.limit))
        res.setHeader('X-RateLimit-Remaining', String(limitResult.remaining))
        if (limitResult.retryAfterMs) {
          res.setHeader('Retry-After', String(Math.ceil(limitResult.retryAfterMs / 1000)))
        }
        fail(res, 429, Err.RATE_LIMITED, '服务间调用限流', req)
        return
      }
      res.setHeader('X-RateLimit-Limit', String(limitResult.limit))
      res.setHeader('X-RateLimit-Remaining', String(limitResult.remaining))
    }

    if (enableCircuitBreaker) {
      const circuitName = opts.circuitBreakerName || opts.calleeService || 'ew-default'
      const circuitState = getCircuitState(circuitName)
      if (circuitState === 'open') {
        ewTrafficState.requestsDenied++
        ewTrafficState.circuitBreakerRejects++
        res.setHeader('X-Circuit-Breaker', 'open')
        fail(res, 503, Err.SERVICE_UNAVAILABLE, '服务熔断中，请稍后重试', req)
        return
      }
      res.setHeader('X-Circuit-Breaker', circuitState)
    }

    ewTrafficState.requestsAllowed++
    next()
  }
}

interface AuthResult {
  ok: boolean
  callerSpiffe?: string
  callerService?: string
  authMethod?: 'mtls' | 'token'
}

function handleAuth(
  req: Request,
  res: Response,
  mode: EwAuthMode,
  opts: EwTrafficMiddlewareOptions
): AuthResult {
  if (mode === 'mtls') {
    return handleMtlsAuth(req, res, opts)
  }

  if (mode === 'token') {
    return handleTokenAuth(req, res, opts)
  }

  const mtlsResult = handleMtlsAuth(req, res, { ...opts, silent: true })
  if (mtlsResult.ok) return mtlsResult

  const tokenResult = handleTokenAuth(req, res, opts)
  if (tokenResult.ok) return tokenResult

  fail(res, 401, Err.UNAUTHORIZED, 'East-West 认证失败（mTLS 和 Token 均未通过）', req)
  return { ok: false }
}

function handleMtlsAuth(
  req: Request,
  res: Response,
  opts: EwTrafficMiddlewareOptions & { silent?: boolean }
): AuthResult {
  if (!isMtlsEnabledFlag()) {
    if (!opts.silent) {
      fail(res, 401, Err.UNAUTHORIZED, 'mTLS 未启用', req)
    }
    return { ok: false }
  }

  const socket = (req as any).socket
  if (!socket || !socket.getPeerCertificate) {
    if (!opts.silent) {
      fail(res, 401, Err.UNAUTHORIZED, '无客户端证书', req)
    }
    return { ok: false }
  }

  const peerCert = socket.getPeerCertificate()
  if (!peerCert || !peerCert.raw) {
    if (!opts.silent) {
      fail(res, 401, Err.UNAUTHORIZED, '客户端证书为空', req)
    }
    return { ok: false }
  }

  let spiffeId = (req as any).spiffeId
  if (!spiffeId) {
    try {
      if (peerCert.subjectaltname) {
        const match = /URI:(spiffe:\/\/\S+)/.exec(peerCert.subjectaltname)
        if (match) spiffeId = match[1]
      }
    } catch {
      /* ignore */
    }
  }

  if (!spiffeId || !isValidSpiffeId(spiffeId)) {
    if (!opts.silent) {
      fail(res, 401, Err.UNAUTHORIZED, '证书 SPIFFE ID 无效', req)
    }
    return { ok: false }
  }

  if (opts.allowedSpiffeIds && opts.allowedSpiffeIds.length > 0) {
    if (!opts.allowedSpiffeIds.includes(spiffeId)) {
      if (!opts.silent) {
        fail(res, 403, Err.FORBIDDEN, 'SPIFFE ID 未授权', req)
      }
      return { ok: false }
    }
  }

  if (opts.callerService && opts.calleeService) {
    const spiffePath = spiffeId.replace(/^spiffe:\/\/[^/]+\//, '')
    const callerFromSpiffe = spiffePath.split('/').pop() || ''
    if (!isServiceCallGranted(callerFromSpiffe, opts.calleeService)) {
      if (!opts.silent) {
        fail(res, 403, Err.FORBIDDEN, '服务间调用未授权', req)
      }
      return { ok: false }
    }
  }

  ;(req as any).ewAuthMethod = 'mtls'
  ;(req as any).ewCallerSpiffe = spiffeId
  return { ok: true, callerSpiffe: spiffeId, authMethod: 'mtls' }
}

function handleTokenAuth(
  req: Request,
  res: Response,
  opts: EwTrafficMiddlewareOptions
): AuthResult {
  const authHeader = req.headers['authorization'] || ''
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(String(authHeader))
  const token = tokenMatch ? tokenMatch[1] : ''

  if (!token) {
    fail(res, 401, Err.UNAUTHORIZED, '缺少 East-West Token', req)
    return { ok: false }
  }

  const caller = String(req.headers['x-ew-caller'] || '').trim()
  const callee = String(req.headers['x-ew-callee'] || '').trim()

  if (!caller || !callee) {
    fail(res, 400, Err.BAD_REQUEST, '缺少 X-EW-Caller 或 X-EW-Callee', req)
    return { ok: false }
  }

  if (opts.allowedTokenCallers && opts.allowedTokenCallers.length > 0) {
    if (!opts.allowedTokenCallers.includes(caller)) {
      fail(res, 403, Err.FORBIDDEN, '调用方未在白名单中', req)
      return { ok: false }
    }
  }

  const result = assertEastWestToken({ caller, callee, token })
  if (!result.ok) {
    publishDomainEvent(
      'EastWestAuthFailed',
      2,
      { caller, callee, reason: result.reason },
      'warn'
    )
    fail(res, 401, Err.UNAUTHORIZED, `East-West Token 验证失败: ${result.reason}`, req)
    return { ok: false }
  }

  if (!isServiceCallGranted(caller, callee)) {
    fail(res, 403, Err.FORBIDDEN, '服务间调用未授权', req)
    return { ok: false }
  }

  ;(req as any).ewAuthMethod = 'token'
  ;(req as any).ewCaller = caller
  ;(req as any).ewCallee = callee
  return { ok: true, callerService: caller, authMethod: 'token' }
}

function handleRateLimit(
  req: Request,
  policyId: string,
  authResult: AuthResult
): { allowed: boolean; remaining: number; limit: number; retryAfterMs?: number } {
  const dimensions: Record<string, string> = {
    endpoint: req.path,
    service: (req as any).ewCallee || 'unknown',
  }

  if (authResult.callerSpiffe) {
    dimensions.spiffe = authResult.callerSpiffe
  } else if (authResult.callerService) {
    dimensions.spiffe = toSpiffeId(authResult.callerService)
  }

  const result = rateLimitTryAcquire(policyId, dimensions, 1)
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    limit: result.limit,
    retryAfterMs: result.retryAfterMs,
  }
}

function handleTracing(req: Request, res: Response): void {
  const traceId = (req as any).traceId || getRequestTraceId()
  if (traceId) {
    ;(req as any).traceId = traceId
    res.setHeader('X-Trace-Id', traceId)
  }
  res.setHeader('X-EW-Handled', '1')
}

export interface EwCallOptions {
  /** 调用方稳定 ID */
  caller: string
  /** 被调用方稳定 ID */
  callee: string
  /** 目标 URL */
  url: string
  /** HTTP 方法 */
  method?: string
  /** 请求头 */
  headers?: Record<string, string>
  /** 请求体 */
  body?: unknown
  /** 超时 ms */
  timeoutMs?: number
  /** 是否使用 mTLS（默认跟随配置） */
  useMtls?: boolean
  /** 最大重试次数 */
  maxRetries?: number
  /** 幂等键 */
  idempotencyKey?: string
}

export async function ewCall(opts: EwCallOptions): Promise<{
  ok: boolean
  status?: number
  body?: unknown
  error?: string
}> {
  const authMode = getConfigAuthMode()
  const useMtls = opts.useMtls ?? (authMode === 'mtls' || authMode === 'both')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EW-Caller': opts.caller,
    'X-EW-Callee': opts.callee,
    ...opts.headers,
  }

  if (!useMtls || authMode === 'both' || authMode === 'token') {
    const { token } = issueEastWestToken({
      caller: opts.caller,
      callee: opts.callee,
      ttlMs: 60_000,
    })
    headers['Authorization'] = `Bearer ${token}`
  }

  const traceId = getRequestTraceId()
  if (traceId) {
    headers['X-Trace-Id'] = traceId
  }

  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey
  }

  const result = await egressFetch({
    dependency: `ew:${opts.callee}`,
    url: opts.url,
    method: opts.method || 'POST',
    headers,
    body: opts.body,
    timeoutMs: opts.timeoutMs || 5000,
    retries: opts.maxRetries ?? 2,
  })

  return {
    ok: result.ok,
    status: result.status,
    body: result.body,
    error: result.ok ? undefined : `circuit_${result.circuit}`,
  }
}

export function getEwTrafficState(): EwTrafficState {
  return { ...ewTrafficState }
}

export function isEwTrafficReady(): boolean {
  return ewTrafficState.ready
}

export function isEwTrafficEnabledFlag(): boolean {
  return ewTrafficState.enabled
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
