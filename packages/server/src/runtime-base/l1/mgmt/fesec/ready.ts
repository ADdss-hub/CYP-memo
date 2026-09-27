import { buildAppCsp } from '@cyp-memo/shared'

/**
 * CYP-memo 前端托管服务（嵌入式）
 * 专属：静态资源根目录、版本、injectRuntimeConfig → window.__CYP_RUNTIME__ 脚本片段；金丝雀百分比位
 * 红线：不碰业务上传 Blob（文件服务）；不处理后端业务逻辑（网关/业务层）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 导出 API：init / reset / getState / isReady / setDistRoot / buildRuntimeInjectScript / getCanaryPercent
 */

export interface CypRuntimeConfig {
  apiBase: string
  featureFlags: Record<string, boolean | string | number>
  version: string
}

export interface FrontendHostState {
  ready: boolean
  distRoot: string | null
  version: string | null
  canaryPercent: number
  lastInjectAt: string | null
}

const state: FrontendHostState = {
  ready: false,
  distRoot: null,
  version: null,
  canaryPercent: 0,
  lastInjectAt: null,
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * 设定静态资源根目录（仅登记路径，不读 Blob、不扫上传区）
 */
export function setDistRoot(root: string): FrontendHostState {
  if (!state.ready) throw new Error('frontend-host not ready')
  const trimmed = String(root || '').trim()
  if (!trimmed) throw new Error('setDistRoot requires non-empty root')
  state.distRoot = trimmed
  return getState()
}

/**
 * 由 injectRuntimeConfig 生成可嵌入 HTML 的脚本片段：
 * window.__CYP_RUNTIME__ = { apiBase, featureFlags, version }
 */
export function buildRuntimeInjectScript(cfg: CypRuntimeConfig): string {
  if (!state.ready) throw new Error('frontend-host not ready')
  const apiBase = String(cfg?.apiBase ?? '')
  const version = String(cfg?.version ?? state.version ?? '')
  const featureFlags =
    cfg?.featureFlags && typeof cfg.featureFlags === 'object' && !Array.isArray(cfg.featureFlags)
      ? { ...cfg.featureFlags }
      : {}

  if (version) state.version = version
  state.lastInjectAt = new Date().toISOString()

  const payload: CypRuntimeConfig = {
    apiBase,
    featureFlags,
    version,
  }
  // JSON 再包进 JS 赋值；不执行业务、不读密钥
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  return `<script>window.__CYP_RUNTIME__=${json};</script>`
}

export function getCanaryPercent(): number {
  return state.canaryPercent
}

export function getState(): FrontendHostState {
  return { ...state }
}

export function isReady(): boolean {
  return state.ready
}

export function init(opts?: {
  distRoot?: string
  version?: string
  canaryPercent?: number
}): FrontendHostState {
  state.ready = true
  state.distRoot = opts?.distRoot != null ? String(opts.distRoot).trim() || null : null
  state.version = opts?.version != null ? String(opts.version).trim() || null : null
  state.canaryPercent = clampPercent(opts?.canaryPercent ?? 0)
  state.lastInjectAt = null
  return getState()
}

export function reset(): void {
  state.ready = false
  state.distRoot = null
  state.version = null
  state.canaryPercent = 0
  state.lastInjectAt = null
}

/** bootstrap / ready 探针兼容别名 */
export const initFrontendHost = init
export const resetFrontendHost = reset
export const getFrontendHostState = getState
export const isFrontendHostReady = isReady

export function setCanaryPercent(percent: number): number {
  if (!state.ready) throw new Error('frontend-host not ready')
  state.canaryPercent = clampPercent(percent)
  return state.canaryPercent
}

/**
 * CYP-memo · 请求防重（前端安全防护）
 * 写方法要求 Idempotency-Key；同键在 TTL 内复用首次响应；禁止平行自建防重表。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { createHash } from 'crypto'
import { fail, Err } from '../code/ready.js'
import { getSystemCache } from '../../../l0/infra/cache/ready.js'

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const TTL_MS = 10 * 60 * 1000
const KEY_PREFIX = 'idemp:'

interface CachedResponse {
  statusCode: number
  body: unknown
  expiresAt: number
}

interface Inflight {
  waiters: Array<(cached: CachedResponse | null) => void>
}

/** 仅并发合流锁，不是第二套响应缓存。响应体只进系统缓存。 */
const inflight = new Map<string, Inflight>()

let ready = false

export function initIdempotency(): { ready: boolean } {
  ready = true
  return { ready }
}

export function resetIdempotency(): void {
  ready = false
  getSystemCache().invalidatePrefix(KEY_PREFIX)
  inflight.clear()
}

export function isIdempotencyReady(): boolean {
  return ready
}

function readReplay(key: string): CachedResponse | undefined {
  const hit = getSystemCache().get<CachedResponse>(KEY_PREFIX + key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    getSystemCache().delete(KEY_PREFIX + key)
    return undefined
  }
  return hit
}

function writeReplay(key: string, entry: CachedResponse): void {
  const ttl = Math.max(1, entry.expiresAt - Date.now())
  getSystemCache().set(KEY_PREFIX + key, entry, ttl)
}

function scopeKey(req: Request, rawKey: string): string {
  const subject =
    req.authUser?.id ||
    (req.headers['authorization'] as string | undefined)?.slice(0, 48) ||
    'anon'
  const path = req.path
  return createHash('sha256')
    .update(`${subject}|${req.method}|${path}|${rawKey}`)
    .digest('hex')
}

/**
 * 写请求防重中间件（跳过 health/config）。
 * - 受保护 /api 写必须带 Idempotency-Key（登录/注册可用 body 派生）
 * - 同键命中缓存则重放首次响应
 */
export function idempotencyMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!WRITE.has(req.method)) return next()
    if (
      req.path === '/healthz/ready' ||
      req.path === '/api/health' ||
      req.path === '/api/config'
    ) {
      return next()
    }

    const headerKey = String(req.headers['idempotency-key'] || '').trim()
    const isAuthWrite =
      req.path === '/api/auth/login' ||
      req.path === '/api/auth/register' ||
      req.path.endsWith('/auth/login') ||
      req.path.endsWith('/auth/register')

    let rawKey = headerKey
    if (!rawKey && isAuthWrite && req.body && typeof req.body === 'object') {
      rawKey = createHash('sha256')
        .update(JSON.stringify(req.body))
        .digest('hex')
        .slice(0, 32)
    }
    if (!rawKey) {
      if (req.path.startsWith('/api')) {
        fail(res, 400, Err.BAD_REQUEST, '缺少 Idempotency-Key（前端安全防护）', req)
        return
      }
      return next()
    }

    const key = scopeKey(req, rawKey)
    const hit = readReplay(key)
    if (hit) {
      res.setHeader('Idempotency-Replayed', '1')
      res.status(hit.statusCode).json(hit.body)
      return
    }

    const pending = inflight.get(key)
    if (pending) {
      pending.waiters.push((cached) => {
        if (cached) {
          res.setHeader('Idempotency-Replayed', '1')
          res.status(cached.statusCode).json(cached.body)
        } else {
          fail(res, 409, Err.BAD_REQUEST, '请求处理中，请勿重复提交', req)
        }
      })
      return
    }

    inflight.set(key, { waiters: [] })

    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => {
      const entry: CachedResponse = {
        statusCode: res.statusCode || 200,
        body,
        expiresAt: Date.now() + TTL_MS,
      }
      writeReplay(key, entry)
      const wait = inflight.get(key)
      inflight.delete(key)
      if (wait) {
        for (const w of wait.waiters) w(entry)
      }
      return originalJson(body)
    }) as Response['json']

    const onClose = () => {
      if (inflight.has(key)) {
        const wait = inflight.get(key)
        inflight.delete(key)
        if (wait) {
          for (const w of wait.waiters) w(null)
        }
      }
    }
    res.on('close', onClose)
    res.on('finish', () => res.off('close', onClose))

    next()
  }
}

/** 实现锚点 · RB-L1-MGMT-FESEC-01 · 前端托管 + 请求防重同文件 */
export function ready_rb_l1_mgmt_fesec_01(): boolean {
  return Boolean(isFrontendHostReady() && isIdempotencyReady())
}

/**
 * Express：全响应附加 CSP（HTML 壳 + API 一并声明，防嵌入）
 * CI02：服务端一律生产 CSP；联调 HMR 的放宽仅由 Vite 本机工具链注入
 */
export function contentSecurityPolicy(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', buildAppCsp(false))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}

export { buildAppCsp }
