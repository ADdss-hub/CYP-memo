/**
 * CYP-memo 令牌桶限流器（服务网格能力 · 多维度限流）
 *
 * 特性：
 * - 令牌桶算法（Token Bucket）
 * - 多维度限流：按服务 / 按接口 / 按租户 / 按 IP
 * - 可配置限流策略（速率、容量、维度）
 * - 支持动态调整策略
 * - 与现有 API Budget 机制兼容
 *
 * 统一运行模式：默认启用，默认宽松策略（1000 req/s）
 * 显式设置 CYP_RATE_LIMIT_ENABLED=0 可关闭（不推荐）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { log } from '../../../l0/infra/log/ready.js'
import { publishDomainEvent } from '../../col/evt/ready.js'

// ============================================================
// 类型定义
// ============================================================

export type RateLimitDimension = 'service' | 'endpoint' | 'tenant' | 'ip' | 'user' | 'spiffe'

export interface RateLimitPolicy {
  /** 策略唯一标识 */
  id: string
  /** 限流维度组合 */
  dimensions: RateLimitDimension[]
  /** 每秒填充令牌数（速率） */
  ratePerSecond: number
  /** 桶容量（最大突发） */
  burstCapacity: number
  /** 策略描述 */
  description?: string
  /** 是否启用 */
  enabled: boolean
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  retryAfterMs?: number
  policyId: string
  key: string
}

export interface RateLimiterState {
  ready: boolean
  enabled: boolean
  policyCount: number
  activeKeys: number
}

// ============================================================
// 桶状态
// ============================================================

interface TokenBucket {
  tokens: number
  lastRefill: number
  policyId: string
}

const buckets = new Map<string, TokenBucket>()
const policies = new Map<string, RateLimitPolicy>()

const state: RateLimiterState = {
  ready: false,
  enabled: false,
  policyCount: 0,
  activeKeys: 0,
}

/** 限流事件去重：同 key 冷却内不重复发 */
const rateLimitEventAt = new Map<string, number>()
const RATE_LIMIT_EVENT_DEDUP_MS = 10_000

// ============================================================
// 配置读取
// ============================================================

function isRateLimitEnabled(): boolean {
  const val = process.env.CYP_RATE_LIMIT_ENABLED
  // 统一运行模式：默认启用，显式设置 0/false/off 才关闭
  if (val === '0' || val === 'false' || val === 'off') return false
  return true
}

function getDefaultRate(): number {
  const n = Number(process.env.CYP_RATE_LIMIT_DEFAULT_RATE)
  return Number.isFinite(n) && n > 0 ? n : 1000
}

function getDefaultBurst(): number {
  const n = Number(process.env.CYP_RATE_LIMIT_DEFAULT_BURST)
  return Number.isFinite(n) && n > 0 ? n : 2000
}

// ============================================================
// 默认策略
// ============================================================

const DEFAULT_POLICIES: RateLimitPolicy[] = [
  {
    id: 'global-ip',
    dimensions: ['ip'],
    ratePerSecond: 50,
    burstCapacity: 100,
    description: '全局 IP 级限流',
    enabled: true,
  },
  {
    id: 'tenant-api',
    dimensions: ['tenant', 'endpoint'],
    ratePerSecond: 100,
    burstCapacity: 200,
    description: '租户 + 接口级限流',
    enabled: true,
  },
  {
    id: 'service-to-service',
    dimensions: ['spiffe', 'service'],
    ratePerSecond: 500,
    burstCapacity: 1000,
    description: '服务间调用限流（按 SPIFFE ID + 目标服务）',
    enabled: true,
  },
  {
    id: 'user-write',
    dimensions: ['user', 'endpoint'],
    ratePerSecond: 20,
    burstCapacity: 50,
    description: '用户写操作限流',
    enabled: true,
  },
]

// ============================================================
// 初始化
// ============================================================

export function initRateLimiter(): void {
  state.enabled = isRateLimitEnabled()

  if (!state.enabled) {
    log({
      level: 'warn',
      message: 'Rate limiter explicitly disabled (CYP_RATE_LIMIT_ENABLED=0)',
      type: 'runtime',
      action: 'rate_limit_init_skip',
    })
    return
  }

  // 注册默认策略
  const defaultRate = getDefaultRate()
  const defaultBurst = getDefaultBurst()

  for (const p of DEFAULT_POLICIES) {
    policies.set(p.id, {
      ...p,
      ratePerSecond: p.id === 'global-ip' ? defaultRate : p.ratePerSecond,
      burstCapacity: p.id === 'global-ip' ? defaultBurst : p.burstCapacity,
    })
  }

  state.policyCount = policies.size
  state.activeKeys = 0
  state.ready = true

  log({
    level: 'info',
    message: `Rate limiter ready: ${state.policyCount} policies`,
    type: 'runtime',
    action: 'rate_limit_ready',
    context: { policyCount: state.policyCount },
  })
}

export function shutdownRateLimiter(): void {
  buckets.clear()
  policies.clear()
  state.ready = false
  state.activeKeys = 0
}

// ============================================================
// 策略管理
// ============================================================

export function registerPolicy(policy: RateLimitPolicy): void {
  policies.set(policy.id, { ...policy })
  state.policyCount = policies.size
}

export function removePolicy(policyId: string): boolean {
  const removed = policies.delete(policyId)
  state.policyCount = policies.size
  // 清理相关桶
  for (const [key, bucket] of buckets) {
    if (bucket.policyId === policyId) {
      buckets.delete(key)
    }
  }
  state.activeKeys = buckets.size
  return removed
}

export function getPolicy(policyId: string): RateLimitPolicy | undefined {
  const p = policies.get(policyId)
  return p ? { ...p } : undefined
}

export function listPolicies(): RateLimitPolicy[] {
  return Array.from(policies.values()).map((p) => ({ ...p }))
}

export function updatePolicy(policyId: string, updates: Partial<RateLimitPolicy>): boolean {
  const existing = policies.get(policyId)
  if (!existing) return false
  policies.set(policyId, { ...existing, ...updates })
  return true
}

// ============================================================
// 核心算法：令牌桶
// ============================================================

function refillBucket(bucket: TokenBucket, policy: RateLimitPolicy): void {
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 1000
  const tokensToAdd = elapsed * policy.ratePerSecond

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(policy.burstCapacity, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }
}

function getBucketKey(policyId: string, dimensions: Record<string, string>): string {
  const policy = policies.get(policyId)
  if (!policy) return policyId

  const parts: string[] = [policyId]
  for (const dim of policy.dimensions) {
    parts.push(dimensions[dim] || 'unknown')
  }
  return parts.join(':')
}

/**
 * 尝试获取令牌（核心限流判定）
 * @param policyId 策略 ID
 * @param dimensions 维度值映射
 * @param tokens 需要的令牌数（默认 1）
 */
export function tryAcquire(
  policyId: string,
  dimensions: Record<string, string>,
  tokens = 1
): RateLimitResult {
  if (!state.enabled) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      policyId,
      key: getBucketKey(policyId, dimensions),
    }
  }

  const policy = policies.get(policyId)
  if (!policy || !policy.enabled) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      policyId,
      key: getBucketKey(policyId, dimensions),
    }
  }

  const key = getBucketKey(policyId, dimensions)
  let bucket = buckets.get(key)

  if (!bucket) {
    bucket = {
      tokens: policy.burstCapacity,
      lastRefill: Date.now(),
      policyId,
    }
    buckets.set(key, bucket)
    state.activeKeys = buckets.size
  }

  // 补充令牌
  refillBucket(bucket, policy)

  if (bucket.tokens >= tokens) {
    bucket.tokens -= tokens
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      limit: policy.burstCapacity,
      policyId,
      key,
    }
  } else {
    // 计算需要等待多久才能有足够令牌
    const deficit = tokens - bucket.tokens
    const retryAfterMs = Math.ceil((deficit / policy.ratePerSecond) * 1000)

    // 去重发布限流事件
    const now = Date.now()
    const prevEvent = rateLimitEventAt.get(key) || 0
    if (now - prevEvent >= RATE_LIMIT_EVENT_DEDUP_MS) {
      rateLimitEventAt.set(key, now)
      publishDomainEvent(
        'RateLimitTriggered',
        2,
        { key, policyId, limit: policy.ratePerSecond, burst: policy.burstCapacity },
        'warn'
      )
    }

    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      limit: policy.burstCapacity,
      retryAfterMs,
      policyId,
      key,
    }
  }
}

/**
 * 查询剩余令牌数（不消耗）
 */
export function peekRemaining(policyId: string, dimensions: Record<string, string>): number {
  if (!state.enabled) return Infinity

  const policy = policies.get(policyId)
  if (!policy || !policy.enabled) return Infinity

  const key = getBucketKey(policyId, dimensions)
  const bucket = buckets.get(key)
  if (!bucket) return policy.burstCapacity

  refillBucket(bucket, policy)
  return Math.floor(bucket.tokens)
}

/**
 * 重置指定键的令牌桶（用于测试或异常恢复）
 */
export function resetBucket(policyId: string, dimensions: Record<string, string>): boolean {
  const key = getBucketKey(policyId, dimensions)
  const removed = buckets.delete(key)
  state.activeKeys = buckets.size
  return removed
}

// ============================================================
// 过期清理
// ============================================================

let cleanupTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动定期清理（清理超过 5 分钟未访问的桶）
 */
export function startBucketCleanup(intervalMs = 60_000): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    const maxIdleMs = 5 * 60 * 1000 // 5 分钟
    let cleaned = 0
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > maxIdleMs) {
        buckets.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      state.activeKeys = buckets.size
      log({
        level: 'debug',
        message: `Rate limiter cleanup: removed ${cleaned} idle buckets`,
        type: 'runtime',
        action: 'rate_limit_cleanup',
        context: { cleaned, remaining: state.activeKeys },
      })
    }
  }, intervalMs)
}

export function stopBucketCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}

// ============================================================
// 状态查询
// ============================================================

export function isRateLimiterReady(): boolean {
  return state.ready
}

export function isRateLimiterEnabled(): boolean {
  return state.enabled
}

export function getRateLimiterState(): RateLimiterState {
  return { ...state, activeKeys: buckets.size }
}

/**
 * 获取所有桶的快照（用于监控）
 */
export function getBucketSnapshot(limit = 100): Array<{
  key: string
  tokens: number
  policyId: string
  lastRefill: string
}> {
  const result: Array<{ key: string; tokens: number; policyId: string; lastRefill: string }> = []
  let count = 0
  for (const [key, bucket] of buckets) {
    if (count >= limit) break
    const policy = policies.get(bucket.policyId)
    if (policy) {
      // 计算当前令牌数（含补充）
      const now = Date.now()
      const elapsed = (now - bucket.lastRefill) / 1000
      const tokens = Math.min(policy.burstCapacity, bucket.tokens + elapsed * policy.ratePerSecond)
      result.push({
        key,
        tokens: Math.floor(tokens),
        policyId: bucket.policyId,
        lastRefill: new Date(bucket.lastRefill).toISOString(),
      })
    }
    count++
  }
  return result
}
