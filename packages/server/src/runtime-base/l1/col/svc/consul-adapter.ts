/**
 * CYP-memo Consul 服务注册与发现适配器
 * 模式：SERVICE_REGISTRY_MODE=consul 时启用
 * 实现：通过 Consul HTTP API 进行服务注册、健康检查 TTL 上报、服务发现
 * 依赖：无第三方 consul 库，使用原生 fetch 调用 Agent HTTP API
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { log as log } from '../../../l0/infra/log/ready.js'

// ============== 类型定义 ==============

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

// ============== 内部状态 ==============

const state = {
  ready: false,
  consulAddr: 'http://127.0.0.1:8500',
  registeredServices: new Set<string>(),
  heartbeatTimers: new Map<string, ReturnType<typeof setInterval>>(),
  deregisterOnExit: true,
}

let consulToken: string | null = null

// ============== 工具函数 ==============

function apiUrl(path: string): string {
  const base = state.consulAddr.replace(/\/$/, '')
  return `${base}/v1${path}`
}

async function consulFetch(
  path: string,
  opts: {
    method?: string
    body?: unknown
    expectStatus?: number
  } = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = apiUrl(path)
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

// ============== 服务注册 ==============

/**
 * 向 Consul Agent 注册服务
 * 使用 TTL 健康检查模式，由服务主动上报心跳
 */
export async function consulRegisterService(
  meta: ConsulServiceMeta
): Promise<{ ok: boolean; error?: string }> {
  if (!state.ready) {
    return { ok: false, error: 'consul adapter not ready' }
  }

  const check: Record<string, unknown> = {}

  // TTL 检查：服务主动上报心跳（默认）
  if (meta.healthCheckTtlSec && meta.healthCheckTtlSec > 0) {
    check['TTL'] = `${meta.healthCheckTtlSec}s`
    check['DeregisterCriticalServiceAfter'] = `${Math.max(meta.healthCheckTtlSec * 3, 30)}s`
  }
  // HTTP 检查：Consul 主动探活
  else if (meta.healthCheckPath) {
    check['HTTP'] = `http://${meta.host}:${meta.port}${meta.healthCheckPath}`
    check['Method'] = 'GET'
    check['Interval'] = '10s'
    check['Timeout'] = '5s'
    check['DeregisterCriticalServiceAfter'] = '1m'
  }
  // 默认使用 TTL
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

  state.registeredServices.add(meta.instanceId)

  // TTL 模式下启动心跳定时器
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

/**
 * 从 Consul Agent 注销服务
 */
export async function consulDeregisterService(instanceId: string): Promise<boolean> {
  if (!state.ready) return false

  stopConsulHeartbeat(instanceId)

  const result = await consulFetch(`/agent/service/deregister/${encodeURIComponent(instanceId)}`, {
    method: 'PUT',
    expectStatus: 200,
  })

  if (result.ok) {
    state.registeredServices.delete(instanceId)
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

// ============== 健康检查（TTL 上报） ==============

/**
 * 上报 TTL 心跳（pass）
 */
export async function consulPassCheck(instanceId: string): Promise<boolean> {
  if (!state.ready) return false

  const checkId = `service:${instanceId}`
  const result = await consulFetch(`/agent/check/pass/${encodeURIComponent(checkId)}`, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

/**
 * 上报 TTL 心跳（warn）
 */
export async function consulWarnCheck(instanceId: string, note?: string): Promise<boolean> {
  if (!state.ready) return false

  const checkId = `service:${instanceId}`
  const path = note
    ? `/agent/check/warn/${encodeURIComponent(checkId)}?note=${encodeURIComponent(note)}`
    : `/agent/check/warn/${encodeURIComponent(checkId)}`
  const result = await consulFetch(path, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

/**
 * 上报 TTL 心跳（fail）
 */
export async function consulFailCheck(instanceId: string, note?: string): Promise<boolean> {
  if (!state.ready) return false

  const checkId = `service:${instanceId}`
  const path = note
    ? `/agent/check/fail/${encodeURIComponent(checkId)}?note=${encodeURIComponent(note)}`
    : `/agent/check/fail/${encodeURIComponent(checkId)}`
  const result = await consulFetch(path, {
    method: 'PUT',
    expectStatus: 200,
  })

  return result.ok
}

function startConsulHeartbeat(instanceId: string, ttlSec: number): void {
  stopConsulHeartbeat(instanceId)
  // 心跳间隔 = TTL / 3，确保在 TTL 内至少上报 2 次
  const intervalMs = Math.floor((ttlSec * 1000) / 3)
  const timer = setInterval(() => {
    consulPassCheck(instanceId).catch(() => {
      // 心跳失败静默处理，由 Consul 侧 TTL 超时判定
    })
  }, intervalMs)
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    ;(timer as NodeJS.Timeout).unref()
  }
  state.heartbeatTimers.set(instanceId, timer)
}

function stopConsulHeartbeat(instanceId: string): void {
  const timer = state.heartbeatTimers.get(instanceId)
  if (timer) {
    clearInterval(timer)
    state.heartbeatTimers.delete(instanceId)
  }
}

// ============== 服务发现 ==============

/**
 * 从 Consul Catalog 查询健康服务实例
 * 支持按服务名查找、按标签过滤
 */
export async function consulDiscoverService(
  serviceName: string,
  opts?: {
    tags?: string[]
    onlyHealthy?: boolean
  }
): Promise<ConsulDiscoveredInstance[]> {
  if (!state.ready) return []

  const onlyHealthy = opts?.onlyHealthy !== false
  const tags = opts?.tags || []

  // 构造查询参数
  const params = new URLSearchParams()
  if (onlyHealthy) {
    params.set('passing', '1')
  }
  for (const tag of tags) {
    params.append('tag', tag)
  }
  const qs = params.toString()
  const path = `/health/service/${encodeURIComponent(serviceName)}${qs ? `?${qs}` : ''}`

  const result = await consulFetch(path, {
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

/**
 * 查询所有注册的服务名称
 */
export async function consulListServices(): Promise<string[]> {
  if (!state.ready) return []

  const result = await consulFetch('/catalog/services', {
    method: 'GET',
  })

  if (!result.ok || typeof result.data !== 'object' || !result.data) {
    return []
  }

  return Object.keys(result.data as Record<string, string[]>)
}

/**
 * 按标签过滤的服务发现（多服务）
 */
export async function consulDiscoverByTags(
  tags: string[],
  onlyHealthy = true
): Promise<ConsulDiscoveredInstance[]> {
  if (!state.ready || tags.length === 0) return []

  const services = await consulListServices()
  const allInstances: ConsulDiscoveredInstance[] = []

  for (const svc of services) {
    const instances = await consulDiscoverService(svc, { tags, onlyHealthy })
    allInstances.push(...instances)
  }

  return allInstances
}

// ============== 初始化与状态 ==============

export interface ConsulAdapterOptions {
  /** Consul Agent HTTP 地址 */
  consulAddr?: string
  /** Consul ACL Token（可选） */
  consulToken?: string
  /** 退出时是否自动注销（默认 true） */
  deregisterOnExit?: boolean
}

export function initConsulAdapter(opts: ConsulAdapterOptions = {}): ConsulAdapterState {
  state.consulAddr = opts.consulAddr || process.env.CONSUL_HTTP_ADDR || 'http://127.0.0.1:8500'
  consulToken = opts.consulToken || process.env.CONSUL_HTTP_TOKEN || null
  state.deregisterOnExit = opts.deregisterOnExit !== false
  state.ready = true

  log({
    level: 'info',
    message: 'consul adapter ready',
    type: 'runtime',
    action: 'consul_adapter_ready',
    context: {
      consulAddr: state.consulAddr,
      hasToken: Boolean(consulToken),
    },
  })

  // 进程退出时自动注销
  if (state.deregisterOnExit) {
    const gracefulShutdown = (): void => {
      if (!state.ready) return
      const ids = Array.from(state.registeredServices)
      // 触发异步注销（不等待，因为退出信号要求快速返回）
      for (const id of ids) {
        consulDeregisterService(id).catch(() => {
          // 静默
        })
      }
    }

    process.on('SIGTERM', gracefulShutdown)
    process.on('SIGINT', gracefulShutdown)
    process.on('beforeExit', gracefulShutdown)
  }

  return getConsulAdapterState()
}

export function resetConsulAdapter(): void {
  // 停止所有心跳
  for (const id of Array.from(state.heartbeatTimers.keys())) {
    stopConsulHeartbeat(id)
  }
  state.registeredServices.clear()
  state.ready = false
  consulToken = null
}

export function getConsulAdapterState(): ConsulAdapterState {
  return {
    ready: state.ready,
    mode: 'consul',
    consulAddr: state.consulAddr,
    registeredServices: Array.from(state.registeredServices),
  }
}

export function isConsulAdapterReady(): boolean {
  return state.ready
}

/**
 * 探测 Consul Agent 是否可达
 */
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
