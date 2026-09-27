/**
 * 出站治理网关子中心 · 三态熔断（CLOSED / OPEN / HALF_OPEN）
 * - 冷却指数退避（基线→翻倍→上限）
 * - HALF 限流探测 + 连续成功才回 CLOSED
 * - 仅状态转换发 CircuitBreakerOpened / CircuitBreakerClosed
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { assertEgressAllowed } from '../../mgmt/iam/ready.js'
import { publishDomainEvent } from '../../col/evt/ready.js'

function safePublish(
  ...args: Parameters<typeof publishDomainEvent>
): void {
  try {
    publishDomainEvent(...args)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/not initialized|EmbeddedMq/i.test(msg)) return
    throw err
  }
}

/** half ≡ HALF_OPEN */
export type CircuitState = 'closed' | 'open' | 'half'

export interface CircuitSnapshot {
  state: CircuitState
  openedAt: number
  cooldownMs: number
  openStreak: number
  halfSuccesses: number
  halfProbing: boolean
  closedFailures: number
}

interface CircuitEntry {
  state: CircuitState
  openedAt: number
  /** 当前 OPEN 冷却时长（已按指数退避算好） */
  cooldownMs: number
  /** 连续打开次数（成功 CLOSED 后清零） */
  openStreak: number
  halfProbing: boolean
  /** HALF 内连续探测成功次数 */
  halfSuccesses: number
  /** CLOSED 窗内失败计数 */
  closedFailures: number
  closedFailWindowStart: number
}

const circuits = new Map<string, CircuitEntry>()

/** 冷却基线 ms（首次熔断）；CYP_EGRESS_COOLDOWN_MS 可覆盖，下限 100 */
export const EGRESS_COOLDOWN_BASE_MS = (() => {
  const n = Number(process.env.CYP_EGRESS_COOLDOWN_MS)
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 2_000
})()

/** @deprecated 兼容旧名 = 基线冷却 */
export const EGRESS_COOLDOWN_MS = EGRESS_COOLDOWN_BASE_MS

/** 冷却上限 ms */
export const EGRESS_COOLDOWN_MAX_MS = (() => {
  const n = Number(process.env.CYP_EGRESS_COOLDOWN_MAX_MS)
  return Number.isFinite(n) && n >= EGRESS_COOLDOWN_BASE_MS
    ? Math.floor(n)
    : 300_000
})()

/** HALF 连续成功次数才回 CLOSED（1~3，默认 2） */
export const EGRESS_HALF_SUCCESS_NEEDED = (() => {
  const n = Number(process.env.CYP_EGRESS_HALF_SUCCESS)
  if (Number.isFinite(n) && n >= 1 && n <= 3) return Math.floor(n)
  return 2
})()

/** CLOSED 滑动窗内失败次数阈值（达到则 OPEN）；默认 1=首次失败即开（出站依赖宜敏） */
export const EGRESS_CLOSED_FAIL_THRESHOLD = (() => {
  const n = Number(process.env.CYP_EGRESS_CLOSED_FAIL_THRESHOLD)
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.floor(n)
  return 1
})()

/** CLOSED 失败计数窗 ms */
const CLOSED_FAIL_WINDOW_MS = 60_000

function entry(dep: string): CircuitEntry {
  let e = circuits.get(dep)
  if (!e) {
    e = {
      state: 'closed',
      openedAt: 0,
      cooldownMs: EGRESS_COOLDOWN_BASE_MS,
      openStreak: 0,
      halfProbing: false,
      halfSuccesses: 0,
      closedFailures: 0,
      closedFailWindowStart: 0,
    }
    circuits.set(dep, e)
  }
  return e
}

function nextCooldownMs(streak: number): number {
  const exp = Math.min(16, Math.max(0, streak - 1))
  const raw = EGRESS_COOLDOWN_BASE_MS * Math.pow(2, exp)
  return Math.min(EGRESS_COOLDOWN_MAX_MS, Math.floor(raw))
}

function transitionTo(dep: string, next: CircuitState, e: CircuitEntry): void {
  const prev = e.state
  if (prev === next) return
  e.state = next
  if (next === 'open') {
    e.openStreak = Math.max(1, e.openStreak + (prev === 'closed' ? 1 : 0))
    if (prev === 'half') e.openStreak += 1
    e.cooldownMs = nextCooldownMs(e.openStreak)
    e.openedAt = Date.now()
    e.halfProbing = false
    e.halfSuccesses = 0
    safePublish(
      'CircuitBreakerOpened',
      2,
      {
        target: dep,
        egress: 'egress',
        from: prev,
        to: next,
        cooldownMs: e.cooldownMs,
        openStreak: e.openStreak,
      },
      'warn'
    )
  } else if (next === 'closed') {
    e.openStreak = 0
    e.cooldownMs = EGRESS_COOLDOWN_BASE_MS
    e.halfProbing = false
    e.halfSuccesses = 0
    e.closedFailures = 0
    e.closedFailWindowStart = 0
    safePublish(
      'CircuitBreakerClosed',
      2,
      { target: dep, from: prev, to: next },
      'info'
    )
  } else if (next === 'half') {
    e.halfProbing = false
    e.halfSuccesses = 0
  }
}

function noteClosedFailure(dep: string, e: CircuitEntry): void {
  const now = Date.now()
  if (!e.closedFailWindowStart || now - e.closedFailWindowStart > CLOSED_FAIL_WINDOW_MS) {
    e.closedFailWindowStart = now
    e.closedFailures = 1
  } else {
    e.closedFailures += 1
  }
  if (e.closedFailures >= EGRESS_CLOSED_FAIL_THRESHOLD) {
    transitionTo(dep, 'open', e)
  }
}

/** 解析当前应对外暴露的电路状态（含冷却后升 half） */
export function getCircuitState(dependency: string): CircuitState {
  const e = entry(dependency)
  if (e.state === 'open' && Date.now() - e.openedAt >= e.cooldownMs) {
    transitionTo(dependency, 'half', e)
  }
  return e.state
}

export function getCircuitDetail(dependency: string): CircuitSnapshot {
  const st = getCircuitState(dependency)
  const e = entry(dependency)
  return {
    state: st,
    openedAt: e.openedAt,
    cooldownMs: e.cooldownMs,
    openStreak: e.openStreak,
    halfSuccesses: e.halfSuccesses,
    halfProbing: e.halfProbing,
    closedFailures: e.closedFailures,
  }
}

export function resetCircuit(dependency: string): void {
  const e = entry(dependency)
  const prev = e.state
  e.state = 'closed'
  e.openedAt = 0
  e.cooldownMs = EGRESS_COOLDOWN_BASE_MS
  e.openStreak = 0
  e.halfProbing = false
  e.halfSuccesses = 0
  e.closedFailures = 0
  e.closedFailWindowStart = 0
  if (prev !== 'closed') {
    safePublish(
      'CircuitBreakerClosed',
      2,
      { target: dependency, from: prev, to: 'closed', force: true },
      'info'
    )
  }
}

export function forceOpen(dependency: string): void {
  transitionTo(dependency, 'open', entry(dependency))
}

export function forceClose(dependency: string): void {
  resetCircuit(dependency)
}

export function resetAllCircuits(): void {
  for (const dep of [...circuits.keys()]) resetCircuit(dep)
  circuits.clear()
}

export function listCircuitSnapshot(): Record<string, CircuitState> {
  const out: Record<string, CircuitState> = {}
  for (const [k] of circuits) out[k] = getCircuitState(k)
  return out
}

export function listCircuitSnapshotDetail(): Record<string, CircuitSnapshot> {
  const out: Record<string, CircuitSnapshot> = {}
  for (const [k] of circuits) out[k] = getCircuitDetail(k)
  return out
}

export async function egressFetch(req: {
  dependency: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  timeoutMs?: number
  retries?: number
}): Promise<{ ok: boolean; status?: number; body?: unknown; circuit?: CircuitState }> {
  const dep = req.dependency || 'unknown'
  const allow = assertEgressAllowed(req.url || req.dependency)
  if (!allow.ok) {
    safePublish(
      'EgressCallFailed',
      2,
      { dependency: dep, errorCode: 'E_EGRESS' },
      'error'
    )
    return { ok: false, circuit: 'open' }
  }

  const st = getCircuitState(dep)
  const e = entry(dep)
  if (st === 'open') {
    return { ok: false, circuit: 'open' }
  }
  if (st === 'half') {
    if (e.halfProbing) {
      return { ok: false, circuit: 'half' }
    }
    e.halfProbing = true
  }

  const started = Date.now()
  const retries = st === 'half' ? 0 : req.retries ?? 1
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 8000)
      const res = await fetch(req.url, {
        method: req.method || 'GET',
        headers: req.headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const text = await res.text()
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        /* raw */
      }
      safePublish('EgressCallCompleted', 2, {
        target: dep,
        durationMs: Date.now() - started,
        status: res.status,
        egressAllowlisted: true,
      })
      if (!res.ok) {
        e.halfProbing = false
        if (st === 'half' || e.state === 'half') {
          transitionTo(dep, 'open', e)
        } else {
          noteClosedFailure(dep, e)
        }
        return { ok: false, status: res.status, body, circuit: getCircuitState(dep) }
      }
      e.halfProbing = false
      if (st === 'half' || e.state === 'half') {
        e.halfSuccesses += 1
        if (e.halfSuccesses >= EGRESS_HALF_SUCCESS_NEEDED) {
          transitionTo(dep, 'closed', e)
        }
        return {
          ok: true,
          status: res.status,
          body,
          circuit: getCircuitState(dep),
        }
      }
      e.closedFailures = 0
      e.closedFailWindowStart = 0
      return { ok: true, status: res.status, body, circuit: 'closed' }
    } catch (err) {
      lastErr = err
    }
  }
  e.halfProbing = false
  safePublish(
    'EgressCallFailed',
    2,
    {
      dependency: dep,
      errorCode: lastErr instanceof Error ? lastErr.message : 'fetch_failed',
    },
    'error'
  )
  if (st === 'half' || e.state === 'half') {
    transitionTo(dep, 'open', e)
  } else {
    noteClosedFailure(dep, e)
  }
  return { ok: false, circuit: getCircuitState(dep) }
}
