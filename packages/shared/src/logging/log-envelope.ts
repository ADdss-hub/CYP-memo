/**
 * CYP-memo 日志信封 + 敏感字段脱敏（SIX-LOG / B15 轻量）
 * server log-service 与 shared LogManager 共用形状
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 注：类型名用 LogLevel（字符串联合），与 types.LogLevel 枚举并存；
 * 本模块不从 index 与 enum 撞名冲突时以本联合为准供信封使用。
 */

/** 日志级别（字符串联合；与 config / server 一致） */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** @deprecated 兼容旧名；请用 LogLevel */
export type LogLevelName = LogLevel

export type LogType =
  | 'runtime'
  | 'error'
  | 'access'
  | 'audit'
  | 'security'
  | 'business'
  | 'debug'
  | 'perf'
  | 'trace'
  | 'ci'

export interface LogInput {
  level: LogLevel
  message: string
  service?: string
  type?: LogType
  traceId?: string
  spanId?: string
  userId?: string | null
  action?: string | null
  context?: Record<string, unknown>
}

export interface LogEnvelope {
  ts: string
  level: LogLevel
  message: string
  service: string
  type: LogType
  traceId?: string
  spanId?: string
  userId?: string | null
  action?: string | null
  context?: Record<string, unknown>
}

/** 全量遮蔽：口令 / 密钥类 */
const FULL_MASK_KEYS = new Set([
  'password',
  'passwd',
  'passwordhash',
  'secret',
  'apikey',
  'privatekey',
])

/** token 类：保留前 4 位 + *** */
const TOKEN_LIKE_KEYS = new Set(['token', 'authorization', 'accesstoken', 'refreshtoken'])

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase()
}

function classifySensitive(key: string): 'full' | 'token' | null {
  const k = normalizeKey(key)
  if (FULL_MASK_KEYS.has(k)) return 'full'
  if (TOKEN_LIKE_KEYS.has(k)) return 'token'
  if (k.includes('password') || k.includes('passwd')) return 'full'
  if (k.includes('secret') || k.includes('apikey') || k.includes('privatekey')) return 'full'
  if (k.includes('token') && !k.includes('traceid')) return 'token'
  if (k.includes('authorization')) return 'token'
  return null
}

function maskFull(): string {
  return '***'
}

function maskTokenLike(value: unknown): string {
  if (value == null) return '***'
  const s = String(value)
  if (s.length <= 4) return '***'
  return `${s.slice(0, 4)}***`
}

/**
 * 递归脱敏。失败时返回 undefined（调用方不得落库明文）。
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  try {
    if (depth > 8) return '[MaxDepth]'
    if (value == null) return value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }
    if (Array.isArray(value)) {
      return value.map((v) => redactSensitive(v, depth + 1))
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const kind = classifySensitive(key)
        if (kind === 'full') {
          out[key] = maskFull()
        } else if (kind === 'token') {
          out[key] = maskTokenLike(raw)
        } else {
          out[key] = redactSensitive(raw, depth + 1)
        }
      }
      return out
    }
    return String(value)
  } catch {
    return undefined
  }
}

/**
 * 构建统一日志信封（context 已脱敏）
 */
export function buildLogEnvelope(input: LogInput, defaultService = 'cyp-memo'): LogEnvelope {
  const redactedCtx =
    input.context !== undefined
      ? (redactSensitive(input.context) as Record<string, unknown> | undefined)
      : undefined

  return {
    ts: new Date().toISOString(),
    level: input.level,
    message: input.message,
    service: input.service || defaultService,
    type: input.type || 'runtime',
    traceId: input.traceId,
    spanId: input.spanId,
    userId: input.userId ?? null,
    action: input.action ?? null,
    context: redactedCtx,
  }
}
