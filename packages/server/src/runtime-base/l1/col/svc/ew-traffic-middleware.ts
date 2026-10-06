/**
 * CYP-memo East-West 流量管控中间件（服务网格能力）
 *
 * 功能：
 * - 认证：mTLS (SPIFFE) / East-West Token 双模式
 * - 限流：按服务/接口/SPIFFE ID 多维度令牌桶限流
 * - 熔断：三态熔断器（CLOSED / OPEN / HALF_OPEN）
 * - 追踪：Trace ID 传递 + 调用链标记
 *
 * 集成位置：服务间调用链路（内部 API / 服务协作）
 * 统一运行模式：默认启用，认证模式默认 both（mTLS 优先，Token 降级）
 * 显式设置 CYP_EW_TRAFFIC_ENABLED=0 可关闭（不推荐）
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import {
  issueEastWestToken,
  assertEastWestToken,
} from '../../host/biz/ready.js'
import {
  isMtlsEnabledFlag,
  spiffeAuthMiddleware,
  verifySpiffeCert,
} from '../../mgmt/kms/mtls.js'
import {
  tryAcquire as rateLimitTryAcquire,
  isRateLimiterEnabled,
  registerPolicy,
} from '../../host/biz/rate-limiter.js'
import {
  getCircuitState,
  egressFetch,
} from '../../host/resil/egress.js'
import {
  getTraceId,
  setTraceId,
} from '../../mgmt/trace/ready.js'
import { fail, Err } from '../../mgmt/code/ready.js'
import { log } from '../../../l0/infra/log/ready.js'
import { publishDomainEvent } from '../../evt/ready.js'
import { toSpiffeId, isValidSpiffeId } from '../../../l0/coord/plt/ready.js'
import { isServiceCallGranted } from './ready.js'

// ============================================================
// 类型定义
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

// ============================================================
// 状态
// ============================================================

const state: EwTrafficState = {
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

// ============================================================
// 配置读取
// ============================================================

function isEwTrafficEnabled(): boolean {
  const val = process.env.CYP_EW_TRAFFIC_ENABLED
  // 统一运行模式：默认启用，显式设置 0/false/off 才关闭
  if (val === '0' || val === 'false' || val === 'off') return false
  return true
}

function getConfigAuthMode(): EwAuthMode {
  const mode = process.env.CYP_EW_AUTH_MODE
  if (mode === 'token') return 'token'
  if (mode === 'mtls') return 'mtls'
  return 'both' // 统一运行模式：默认双模式（mTLS 优先，Token 降级）
}

// ============================================================
// 初始化
// ============================================================

export function initEwTraffic(): void {
  state.enabled = isEwTrafficEnabled()

  if (!state.enabled) {
    log({
      level: 'warn',
      message: 'East-West traffic middleware explicitly disabled (CYP_EW_TRAFFIC_ENABLED=0)',
      type: 'runtime',
      action: 'ew_traffic_init_skip',
    })
    return
  }

  state.authMode = getConfigAuthMode()

  // 注册 East-West 专用限流策略
  registerPolicy({
    id: 'ew-service-to-service',
    dimensions: ['spiffe', 'service'],
    ratePerSecond: 500,
    burstCapacity: 1000,
    description: 'East-West 服务间调用限流',
    enabled: true,
  })

  state.ready = true
  log({
    level: 'info',
    message: `East-West traffic middleware ready (auth: ${state.authMode})`,
    type: 'runtime',
    action: 'ew_traffic_ready',
    context: { authMode: state.authMode },
  })
}

export function shutdownEwTraffic(): void {
  state.ready = false
}

// ============================================================
// 核心中间件
// ============================================================

/**
 * East-West 流量管控中间件（Express 中间件）
 * 集成：认证 + 限流 + 熔断 + 追踪
 */
export function ewTrafficMiddleware(opts: EwTrafficMiddlewareOptions = {}): RequestHandler {
  const authMode = opts.authMode || getConfigAuthMode()
  const enableRateLimit = opts.enableRateLimit ?? isRateLimiterEnabled()
  const enableCircuitBreaker = opts.enableCircuitBreaker ?? true
  const enableTracing = opts.enableTracing ?? true
  const rateLimitPolicyId = opts.rateLimitPolicyId || 'ew-service-to-service'

  return (req: Request, res: Response, next: NextFunction): void => {
    // 检查路径前缀
    if (opts.pathPrefix && !req.path.startsWith(opts.pathPrefix)) {
      next()
      return
    }

    state.requestsTotal++

    // 1. 追踪：Trace ID 传递
    if (enableTracing) {
      handleTracing(req, res)
    }

    // 2. 认证
    const authResult = handleAuth(req, res, authMode, opts)
    if (!authResult.ok) {
      state.requestsDenied++
      state.authFailures++
      return
    }

    // 3. 限流
    if (enableRateLimit) {
      const limitResult = handleRateLimit(req, rateLimitPolicyId, authResult)
      if (!limitResult.allowed) {
        state.requestsDenied++
        state.rateLimitHits++
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

    // 4. 熔断（入站侧检查被调用方自身的熔断状态）
    if (enableCircuitBreaker) {
      const circuitName = opts.circuitBreakerName || opts.calleeService || 'ew-default'
      const circuitState = getCircuitState(circuitName)
      if (circuitState === 'open') {
        state.requestsDenied++
        state.circuitBreakerRejects++
        res.setHeader('X-Circuit-Breaker', 'open')
        fail(res, 503, Err.SERVICE_UNAVAILABLE, '服务熔断中，请稍后重试', req)
        return
      }
      res.setHeader('X-Circuit-Breaker', circuitState)
    }

    state.requestsAllowed++
    next()
  }
}

// ============================================================
// 认证处理
// ============================================================

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
  // 模式 1：仅 mTLS
  if (mode === 'mtls') {
    return handleMtlsAuth(req, res, opts)
  }

  // 模式 2：仅 Token（默认，兼容现有）
  if (mode === 'token') {
    return handleTokenAuth(req, res, opts)
  }

  // 模式 3：双模式（任一通过即可，优先 mTLS）
  const mtlsResult = handleMtlsAuth(req, res, { ...opts, silent: true })
  if (mtlsResult.ok) return mtlsResult

  const tokenResult = handleTokenAuth(req, res, opts)
  if (tokenResult.ok) return tokenResult

  // 都失败
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

  // 从 socket 获取客户端证书
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

  // SPIFFE ID 验证
  // 简化：从自定义证书格式解析或从 SAN 提取
  let spiffeId = (req as any).spiffeId
  if (!spiffeId) {
    try {
      // 尝试从证书 SAN 提取
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

  // 检查是否在允许列表
  if (opts.allowedSpiffeIds && opts.allowedSpiffeIds.length > 0) {
    if (!opts.allowedSpiffeIds.includes(spiffeId)) {
      if (!opts.silent) {
        fail(res, 403, Err.FORBIDDEN, 'SPIFFE ID 未授权', req)
      }
      return { ok: false }
    }
  }

  // 服务间授权检查
  if (opts.callerService && opts.calleeService) {
    // SPIFFE ID 对应的服务名检查
    // 从 SPIFFE path 提取服务名
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
  // 从 Header 提取 East-West Token
  const authHeader = req.headers['authorization'] || ''
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(String(authHeader))
  const token = tokenMatch ? tokenMatch[1] : ''

  if (!token) {
    fail(res, 401, Err.UNAUTHORIZED, '缺少 East-West Token', req)
    return { ok: false }
  }

  // 从 Header 提取 caller / callee
  const caller = String(req.headers['x-ew-caller'] || '').trim()
  const callee = String(req.headers['x-ew-callee'] || '').trim()

  if (!caller || !callee) {
    fail(res, 400, Err.BAD_REQUEST, '缺少 X-EW-Caller 或 X-EW-Callee', req)
    return { ok: false }
  }

  // 白名单检查
  if (opts.allowedTokenCallers && opts.allowedTokenCallers.length > 0) {
    if (!opts.allowedTokenCallers.includes(caller)) {
      fail(res, 403, Err.FORBIDDEN, '调用方未在白名单中', req)
      return { ok: false }
    }
  }

  // 验证 Token
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

  // 服务间授权检查
  if (!isServiceCallGranted(caller, callee)) {
    fail(res, 403, Err.FORBIDDEN, '服务间调用未授权', req)
    return { ok: false }
  }

  ;(req as any).ewAuthMethod = 'token'
  ;(req as any).ewCaller = caller
  ;(req as any).ewCallee = callee
  return { ok: true, callerService: caller, authMethod: 'token' }
}

// ============================================================
// 限流处理
// ============================================================

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

// ============================================================
// 追踪处理
// ============================================================

function handleTracing(req: Request, res: Response): void {
  // 从请求头获取 Trace ID（如果有）
  const incomingTraceId = req.headers['x-trace-id'] as string
  if (incomingTraceId && typeof incomingTraceId === 'string') {
    // 使用上游传递的 Trace ID
    setTraceId(incomingTraceId)
    ;(req as any).traceId = incomingTraceId
  } else {
    // 生成新的 Trace ID
    const traceId = getTraceId()
    res.setHeader('X-Trace-Id', traceId)
    ;(req as any).traceId = traceId
  }

  // 添加 East-West 调用标记
  res.setHeader('X-EW-Handled', '1')
}

// ============================================================
// 出站调用封装（服务间调用客户端）
// ============================================================

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

/**
 * East-West 服务间调用（出站）
 * 自动添加认证 Token/mTLS + 限流 + 熔断 + 追踪
 */
export async function ewCall(opts: EwCallOptions): Promise<{
  ok: boolean
  status?: number
  body?: unknown
  error?: string
}> {
  const authMode = getConfigAuthMode()
  const useMtls = opts.useMtls ?? (authMode === 'mtls' || authMode === 'both')

  // 构造请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EW-Caller': opts.caller,
    'X-EW-Callee': opts.callee,
    ...opts.headers,
  }

  // 添加 East-West Token
  if (!useMtls || authMode === 'both' || authMode === 'token') {
    const { token } = issueEastWestToken({
      caller: opts.caller,
      callee: opts.callee,
      ttlMs: 60_000,
    })
    headers['Authorization'] = `Bearer ${token}`
  }

  // 添加 Trace ID
  const traceId = getTraceId()
  if (traceId) {
    headers['X-Trace-Id'] = traceId
  }

  // 幂等键
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey
  }

  // 使用出站治理（含熔断）
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

// ============================================================
// 状态查询
// ============================================================

export function getEwTrafficState(): EwTrafficState {
  return { ...state }
}

export function isEwTrafficReady(): boolean {
  return state.ready
}

export function isEwTrafficEnabledFlag(): boolean {
  return state.enabled
}
