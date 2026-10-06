/**
 * CYP-memo 指数退避重试与超时工具（服务网格预埋）
 *
 * 特性：
 * - 指数退避重试（Exponential Backoff）
 * - 可配置最大重试次数、初始延迟、最大延迟
 * - 抖动（Jitter）防止惊群效应
 * - 可配置超时时间
 * - 幂等性保证（与现有幂等键机制对齐）
 * - 可重试错误码配置
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { log } from '../../../l0/infra/log/ready.js'
import { publishDomainEvent } from '../../col/evt/ready.js'

// ============================================================
// 类型定义
// ============================================================

export interface RetryOptions {
  /** 最大重试次数（不含首次请求），默认 3 */
  maxRetries?: number
  /** 初始延迟 ms，默认 100 */
  initialDelayMs?: number
  /** 最大延迟 ms，默认 10000 */
  maxDelayMs?: number
  /** 退避乘数，默认 2（指数底数） */
  backoffMultiplier?: number
  /** 是否添加抖动，默认 true */
  jitter?: boolean
  /** 单次请求超时 ms，默认 5000 */
  timeoutMs?: number
  /** 可重试的错误码/状态码列表 */
  retryableStatusCodes?: number[]
  /** 可重试的错误类型列表 */
  retryableErrors?: string[]
  /** 是否重试网络错误，默认 true */
  retryNetworkErrors?: boolean
  /** 幂等键（用于保证重试幂等性） */
  idempotencyKey?: string
  /** 操作名称（用于日志/监控） */
  operationName?: string
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempt: number
  totalDurationMs: number
  retriesUsed: number
}

export interface RetryStats {
  totalOperations: number
  totalRetries: number
  successOnFirstTry: number
  successAfterRetry: number
  failedAfterRetry: number
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]
const DEFAULT_RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'ERR_NETWORK',
  'ABORT_ERR',
]

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'idempotencyKey' | 'operationName'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  backoffMultiplier: 2,
  jitter: true,
  timeoutMs: 5000,
  retryableStatusCodes: DEFAULT_RETRYABLE_STATUS_CODES,
  retryableErrors: DEFAULT_RETRYABLE_ERRORS,
  retryNetworkErrors: true,
}

// ============================================================
// 统计
// ============================================================

const stats: RetryStats = {
  totalOperations: 0,
  totalRetries: 0,
  successOnFirstTry: 0,
  successAfterRetry: 0,
  failedAfterRetry: 0,
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 计算指数退避延迟
 */
function calculateDelay(attempt: number, opts: RetryOptions): number {
  const initial = opts.initialDelayMs ?? DEFAULT_OPTIONS.initialDelayMs
  const multiplier = opts.backoffMultiplier ?? DEFAULT_OPTIONS.backoffMultiplier
  const maxDelay = opts.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs

  let delay = initial * Math.pow(multiplier, Math.max(0, attempt - 1))
  delay = Math.min(delay, maxDelay)

  if (opts.jitter !== false) {
    // 添加 ±25% 的随机抖动
    const jitterFactor = 0.75 + Math.random() * 0.5
    delay = delay * jitterFactor
  }

  return Math.floor(delay)
}

/**
 * 判断错误是否可重试
 */
function isRetryable(err: unknown, opts: RetryOptions): boolean {
  // 网络错误
  if (opts.retryNetworkErrors !== false && err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    if (code && opts.retryableErrors?.includes(code)) return true
    if (code && DEFAULT_RETRYABLE_ERRORS.includes(code)) return true
    // 通用网络错误
    if (/network|fetch|timeout|abort/i.test(err.message)) return true
  }

  // 带状态码的 HTTP 错误
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    const retryableCodes = opts.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES
    if (retryableCodes.includes(status)) return true
  }

  return false
}

// ============================================================
// 核心重试函数
// ============================================================

/**
 * 带指数退避的重试执行器
 * @param fn 要执行的异步函数
 * @param opts 重试选项
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxRetries = opts.maxRetries ?? DEFAULT_OPTIONS.maxRetries
  const operationName = opts.operationName || 'unknown'
  const startTime = Date.now()

  let lastError: unknown
  let attempt = 0

  stats.totalOperations++

  while (attempt <= maxRetries) {
    attempt++

    try {
      // 创建超时控制器
      const timeoutMs = opts.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const result = await fn(attempt)
        clearTimeout(timeoutId)

        // 成功
        const duration = Date.now() - startTime
        if (attempt === 1) {
          stats.successOnFirstTry++
        } else {
          stats.successAfterRetry++
          stats.totalRetries += attempt - 1
        }

        log({
          level: attempt === 1 ? 'debug' : 'info',
          message: `Retry ${operationName} succeeded on attempt ${attempt}`,
          type: 'runtime',
          action: 'retry_success',
          context: {
            operation: operationName,
            attempt,
            durationMs: duration,
            retriesUsed: attempt - 1,
          },
        })

        return {
          success: true,
          data: result,
          attempt,
          totalDurationMs: duration,
          retriesUsed: attempt - 1,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      lastError = err

      // 检查是否可重试
      if (attempt > maxRetries || !isRetryable(err, opts)) {
        break
      }

      // 计算延迟
      const delay = calculateDelay(attempt, opts)

      log({
        level: 'warn',
        message: `Retry ${operationName} attempt ${attempt} failed, retrying in ${delay}ms`,
        type: 'runtime',
        action: 'retry_attempt',
        context: {
          operation: operationName,
          attempt,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        },
      })

      // 发布重试事件（首次重试时）
      if (attempt === 1) {
        publishDomainEvent(
          'RetryStarted',
          2,
          {
            operation: operationName,
            maxRetries,
            error: err instanceof Error ? err.message : String(err),
          },
          'warn'
        )
      }

      await sleep(delay)
    }
  }

  // 全部重试失败
  const duration = Date.now() - startTime
  stats.failedAfterRetry++
  stats.totalRetries += attempt - 1

  publishDomainEvent(
    'RetryExhausted',
    3,
    {
      operation: operationName,
      attempts: attempt,
      durationMs: duration,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    },
    'error'
  )

  log({
    level: 'error',
    message: `Retry ${operationName} exhausted after ${attempt} attempts`,
    type: 'runtime',
    action: 'retry_exhausted',
    context: {
      operation: operationName,
      attempts: attempt,
      durationMs: duration,
    },
  })

  return {
    success: false,
    error: lastError instanceof Error ? lastError : new Error(String(lastError)),
    attempt,
    totalDurationMs: duration,
    retriesUsed: attempt - 1,
  }
}

// ============================================================
// HTTP 请求封装
// ============================================================

export interface RetryFetchOptions extends RetryOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  /** 自动为写请求添加幂等键（使用 operationName + timestamp 生成） */
  autoIdempotencyKey?: boolean
}

/**
 * 带重试的 fetch 封装
 * @param url 请求 URL
 * @param options 选项
 */
export async function retryFetch(
  url: string,
  options: RetryFetchOptions = {}
): Promise<RetryResult<Response>> {
  const { method, headers, body, autoIdempotencyKey, ...retryOpts } = options

  // 生成幂等键
  let idempotencyKey = options.idempotencyKey
  if (autoIdempotencyKey && method && method !== 'GET' && method !== 'HEAD') {
    idempotencyKey = `retry-${options.operationName || 'fetch'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  return withRetry<Response>(
    async (attempt) => {
      const reqHeaders: Record<string, string> = { ...headers }
      if (idempotencyKey) {
        reqHeaders['Idempotency-Key'] = idempotencyKey
        reqHeaders['X-Retry-Attempt'] = String(attempt)
      }

      const res = await fetch(url, {
        method: method || 'GET',
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      // 对可重试的状态码抛出错误，触发重试
      const retryableCodes = options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES
      if (!res.ok && retryableCodes.includes(res.status)) {
        const err = new Error(`HTTP ${res.status}: ${res.statusText}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }

      return res
    },
    {
      ...retryOpts,
      operationName: options.operationName || url,
    }
  )
}

// ============================================================
// 超时工具
// ============================================================

/**
 * 带超时的 Promise 包装
 * @param promise 要包装的 Promise
 * @param timeoutMs 超时时间 ms
 * @param message 超时错误消息
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const err = new Error(message) as Error & { code?: string }
      err.code = 'ETIMEDOUT'
      reject(err)
    }, timeoutMs)

    promise.then(
      (result) => {
        clearTimeout(timeoutId)
        resolve(result)
      },
      (err) => {
        clearTimeout(timeoutId)
        reject(err)
      }
    )
  })
}

// ============================================================
// 幂等键工具
// ============================================================

/**
 * 生成幂等键（与现有 fesec 幂等中间件格式对齐）
 * @param scope 作用域（服务名/接口名）
 * @param identifier 唯一标识（用户ID/租户ID等）
 */
export function generateIdempotencyKey(scope: string, identifier?: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  const idPart = identifier ? `${identifier}-` : ''
  return `${scope}-${idPart}${ts}-${rand}`
}

/**
 * 验证幂等键格式（与现有格式兼容）
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  const trimmed = key.trim()
  if (trimmed.length < 8 || trimmed.length > 256) return false
  // 允许字母、数字、连字符、下划线
  return /^[a-zA-Z0-9_-]+$/.test(trimmed)
}

// ============================================================
// 统计查询
// ============================================================

export function getRetryStats(): RetryStats {
  return { ...stats }
}

export function resetRetryStats(): void {
  stats.totalOperations = 0
  stats.totalRetries = 0
  stats.successOnFirstTry = 0
  stats.successAfterRetry = 0
  stats.failedAfterRetry = 0
}
