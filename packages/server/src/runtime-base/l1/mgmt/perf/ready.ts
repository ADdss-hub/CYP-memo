/**
 * CYP-memo · 性能运行管控（嵌入式 · 非减配）
 * 基线 · SLA · 频率 · 路由分位 · 越界处置钩子。弹性状态只作调度推迟信号，不冒充本服务就绪。
 * SLA 对齐军械库性能专项 1.6.3：交互/标准/重写三分型；默认窗阈=标准路由；运维可热改，不得宽于高标准。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { getConfig, getMachineCapacity } from '../../../l0/infra/cfg/ready.js'
import { getElasticityState, decideElasticity, revertElasticity, promoteElasticityBaseline, machineMaxConcurrency, machineFloorConcurrency, getIngressInflight, getUserInflight } from '../../host/resil/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'
import { publishDomainEvent } from '../../col/evt/ready.js'
import { gradeAndEmitAlertCandidate, closeOpenAlertsBySource } from '../../host/alert/ready.js'

export interface PerfSample {
  at: string
  route: string
  durationMs: number
  statusCode: number
}

export interface PerfRouteStat {
  route: string
  count: number
  errorCount: number
  maxMs: number
  avgMs: number
  p95Ms: number | null
}

export interface PerfBaseline {
  /** 健康窗口下的基线 P95（ms） */
  p95Ms: number
  sampleCount: number
  capturedAt: string
}

export interface PerfSlaConfig {
  /** 单请求越阈（ms） */
  requestMs: number
  /** 窗口 P95 越阈（ms） */
  p95Ms: number
  /** 窗口错误率越阈 0–1 */
  errorRate: number
  /** 连续越阈多少次后发告警候选 */
  alertAfterBreaches: number
}

export interface PerfState {
  ready: boolean
  sampleCount: number
  lastSample: PerfSample | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  breachCount: number
  /** 近 60s 估算 QPS */
  qps: number
  /** 滑动窗口错误率 */
  errorRate: number
  windowSize: number
  sla: PerfSlaConfig
  baseline: PerfBaseline | null
  /** SLA 是否当前越界（相对基线或绝对阈） */
  slaOk: boolean
  /** 实际用于越阈判定的窗口 P95（可能被健康基线收紧） */
  effectiveP95Ms: number
  topSlowRoutes: PerfRouteStat[]
  appliedConcurrency: number | null
  lastBreachAt: string | null
  /** 闭环相位：steady 稳态 / breach 越阈处置中 / recovered 已自动恢复 */
  loopPhase: 'steady' | 'breach' | 'recovered'
  consecutiveHealthy: number
  lastRecoveredAt: string | null
  /** 自动调压压力面（防瓶颈/卡死） */
  pressure: PerfPressure
  /** 完整自动闭环：感知→判定→调压→落地→回升→提高→固化→收尾（运维面不区分组件） */
  automation: PerfAutomation
}

/** 本轮判定意图（编排用；运维只观测） */
export type PerfDecideIntent =
  | 'hold'
  | 'tighten'
  | 'recover'
  | 'raise'
  | 'promote'
  | 'settle'

export interface PerfAutomation {
  sense: { active: true; at: string; level: PerfPressure['level']; reasons: string[] }
  /** 本机能力：并发地板/上限与内存压力的唯一前提 */
  machine: {
    platform: string
    arch: string
    logicalCpus: number
    totalMemMb: number
    freeMemMb: number
    floorConcurrency: number
    maxConcurrency: number
    apiRpm: number
    mqDrainBatch: number
  }
  /** 自动判定：本轮该收紧 / 回升 / 提高 / 固化 / 收尾 / 待命 */
  decide: { active: true; at: string; intent: PerfDecideIntent; reason: string }
  /** 自动调压：仅收紧方向 */
  regulate: { active: boolean; at: string | null; action: string | null }
  /** 自动落地：当前已应用的并发与限流（观测） */
  execute: {
    active: boolean
    at: string | null
    concurrency: number | null
    rateLimitFactor: number | null
    action: string | null
    reversible: boolean
  }
  /** 自动回升：健康后渐进回到基线（替代一次打满 revert） */
  recover: { active: boolean; at: string | null; action: string | null; held: boolean }
  /** @deprecated 兼容旧探针，同 recover */
  release: { active: boolean; at: string | null; reason: string | null; held: boolean }
  /** 自动提高：有需求才抬升并发 */
  raise: {
    active: boolean
    at: string | null
    action: string | null
    demand: boolean
    concurrency: number | null
  }
  /** 自动固化：把更高并发与更优 P95 写成新基线 */
  promote: {
    active: boolean
    at: string | null
    action: string | null
    concurrency: number | null
    baselineConcurrency: number | null
  }
  /** 自动收尾：关告警、清 episode、稳态 */
  settle: { active: boolean; at: string | null; reason: string | null }
  /** @deprecated 兼容旧探针：raise+promote 摘要 */
  optimize: {
    active: boolean
    at: string | null
    action: string | null
    concurrency: number | null
    baselineConcurrency: number | null
  }
}

export interface PerfPressure {
  level: 'ok' | 'warn' | 'critical'
  /**
   * 管控触发：idle 不介入业务。
   * bottleneck = 业务并发见顶且窗口 P95 已越过配置目标。
   * crisis = 内存或事件循环已到危急。逼近 SLA 不算。
   */
  control: 'idle' | 'bottleneck' | 'crisis'
  reasons: string[]
  heapRatio: number
  rssMb: number
  eventLoopLagMs: number
  qps: number
  p95Ms: number | null
  approachingSla: boolean
  checkedAt: string
}

/** 军械库 1.6.3 路由分型（交互 / 标准 / 重写） */
export type PerfRouteClass = 'interactive' | 'standard' | 'heavy'

/** 交互路由高标准（列表/详情/轻写） */
export const INTERACTIVE_HIGH_STANDARD_SLA: PerfSlaConfig = {
  requestMs: 500,
  p95Ms: 300,
  errorRate: 0.01,
  alertAfterBreaches: 2,
}

/** 标准路由高标准（产品默认窗阈；运维可收紧，不可放宽） */
export const HIGH_STANDARD_SLA: PerfSlaConfig = {
  requestMs: 1000,
  p95Ms: 500,
  errorRate: 0.01,
  alertAfterBreaches: 2,
}

/** 重写路由高标准（大附件/导入导出/批量） */
export const HEAVY_HIGH_STANDARD_SLA: PerfSlaConfig = {
  requestMs: 3000,
  p95Ms: 2000,
  errorRate: 0.01,
  alertAfterBreaches: 2,
}

const DEFAULT_SLA: PerfSlaConfig = { ...HIGH_STANDARD_SLA }

/**
 * 路由分型：交互=列表/详情/轻写；重写=上传/导入导出；其余标准。
 * 观测豁免路由仍由 isDurationSlaExempt 先行过滤。
 */
export function classifyPerfRoute(route: string): PerfRouteClass {
  const raw = String(route || '').trim()
  const space = raw.indexOf(' ')
  const method = (space > 0 ? raw.slice(0, space) : 'GET').toUpperCase()
  const pathOnly = (space > 0 ? raw.slice(space + 1) : raw).split('?')[0] || ''
  const lower = pathOnly.toLowerCase()
  const p = lower.startsWith('/api/')
    ? lower
    : lower.startsWith('/')
      ? `/api${lower}`
      : `/${lower}`

  if (
    ((method === 'POST' || method === 'PUT') &&
      (p.includes('/files') || p.includes('/upload'))) ||
    p.includes('/import') ||
    p.includes('/export') ||
    p.includes('/backup') ||
    p.includes('/migrate')
  ) {
    return 'heavy'
  }

  if (
    (method === 'GET' &&
      (p === '/api/memos' ||
        /^\/api\/memos\/[^/]+$/.test(p) ||
        /^\/api\/users\/[^/]+\/memos$/.test(p) ||
        /^\/api\/users\/[^/]+\/memos\/search$/.test(p))) ||
    (method === 'PATCH' && /^\/api\/memos\/[^/]+$/.test(p)) ||
    (method === 'POST' && p === '/api/memos')
  ) {
    return 'interactive'
  }

  return 'standard'
}

const WINDOW = 200
/** 分位窗只保留近 60s。监控轮询留下的慢样本必须过期，禁止一直占着 P95 弹预警。 */
const SLA_RING_TTL_MS = 60_000
const ROUTE_CAP = 40
const ROUTE_RING = 40
const QPS_WINDOW_MS = 60_000
const REGULATE_INTERVAL_MS = 2000
const PRESSURE_DECIDE_COOLDOWN_MS = 10_000
/** 释放冷却短于收紧：防止收紧后长时间卡在限流系数 < 1 */
const RELEASE_COOLDOWN_MS = 2_000
/** 连续感知为正常后才允许自动回升，避免抖动 */
const RELEASE_CLEAR_CYCLES = 3
/** 样本健康达到此数且仍持有收紧 → 强制回升（不依赖 loopPhase=breach） */
const RELEASE_HEALTHY_SAMPLES = 12
/** 回升完成后连续正常轮次才允许按需提高 */
const RAISE_CLEAR_CYCLES = 5
/** 自动提高/固化冷却，避免一步打满 */
const OPTIMIZE_COOLDOWN_MS = 8_000
/** 提高后连续正常冷却次数 → 固化为新基线 */
const OPTIMIZE_PROMOTE_CYCLES = 5

let dataDirRef: string | null = null
let eventLoopLagMs = 0
let lagProbeScheduled = false
let regulateTimer: ReturnType<typeof setInterval> | null = null
let lastPressureDecideAt = 0
let lastPressureLevel: PerfPressure['level'] = 'ok'
let clearSenseCycles = 0
let lastSenseAt = ''
let lastDecideAt = ''
let lastDecideIntent: PerfDecideIntent = 'hold'
let lastDecideReason = 'steady'
let lastRegulateAt: string | null = null
let lastRegulateAction: string | null = null
let lastRecoverAt: string | null = null
let lastRecoverAction: string | null = null
let lastReleaseAt: string | null = null
let lastReleaseReason: string | null = null
let lastRaiseAt: string | null = null
let lastRaiseAction: string | null = null
let lastRaiseDemand = false
let lastPromoteAt: string | null = null
let lastPromoteAction: string | null = null
let lastSettleAt: string | null = null
let lastSettleReason: string | null = null
let lastOptimizeAt: string | null = null
let lastOptimizeAction: string | null = null
let lastOptimizeDecideAt = 0
let optimizeRaiseStreak = 0
/** 同一越阈事件只提示一次；恢复后才允许下一次。禁止连续越阈把通知刷屏。 */
let slaEpisodeAlerted = false
/** 压力危急告警同一 episode 只发一次（与 SLA 越阈同口径）。 */
let pressureEpisodeAlerted = false
/** 回升完成后待收尾一次 */
let settlePending = false

function emptyPressure(): PerfPressure {
  return {
    level: 'ok',
    control: 'idle',
    reasons: [],
    heapRatio: 0,
    rssMb: 0,
    eventLoopLagMs: 0,
    qps: 0,
    p95Ms: null,
    approachingSla: false,
    checkedAt: new Date().toISOString(),
  }
}

const state: {
  ready: boolean
  sampleCount: number
  lastSample: PerfSample | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  breachCount: number
  consecutiveBreaches: number
  lastBreachAt: string | null
  loopPhase: 'steady' | 'breach' | 'recovered'
  consecutiveHealthy: number
  lastRecoveredAt: string | null
  sla: PerfSlaConfig
  baseline: PerfBaseline | null
} = {
  ready: false,
  sampleCount: 0,
  lastSample: null,
  p50Ms: null,
  p95Ms: null,
  p99Ms: null,
  breachCount: 0,
  consecutiveBreaches: 0,
  lastBreachAt: null,
  loopPhase: 'steady',
  consecutiveHealthy: 0,
  lastRecoveredAt: null,
  sla: { ...DEFAULT_SLA },
  baseline: null,
}

const ring: { at: number; ms: number; status: number }[] = []
/** 交互路由独立分位窗（1.6.3 p95=300） */
const interactiveRing: { at: number; ms: number; status: number }[] = []
let interactiveP95Ms: number | null = null
const recentAts: number[] = []

/** 按分型取硬阈；标准档用当前配置（已钳制不得宽于 HIGH_STANDARD） */
export function resolveRouteSla(route: string): PerfSlaConfig {
  const cls = classifyPerfRoute(route)
  if (cls === 'interactive') return { ...INTERACTIVE_HIGH_STANDARD_SLA }
  if (cls === 'heavy') return { ...HEAVY_HIGH_STANDARD_SLA }
  return { ...state.sla }
}
const routeMap = new Map<
  string,
  { count: number; errorCount: number; maxMs: number; sumMs: number; ring: number[] }
>()

function resolvePerfRoot(): string {
  if (dataDirRef) return path.join(dataDirRef, 'perf')
  try {
    return path.join(getConfig().dataDir, 'perf')
  } catch {
    return path.join('.', 'perf')
  }
}

function baselinePath(): string {
  return path.join(resolvePerfRoot(), 'baseline.json')
}

function slaPath(): string {
  return path.join(resolvePerfRoot(), 'sla.json')
}

/** 钳制：可收紧不可放宽（相对 1.6.3 标准路由高标准） */
export function clampPerfSla(partial: Partial<PerfSlaConfig>): PerfSlaConfig {
  const base = { ...HIGH_STANDARD_SLA, ...partial }
  const requestMs = Math.min(
    HIGH_STANDARD_SLA.requestMs,
    Math.max(100, Math.round(Number(base.requestMs) || HIGH_STANDARD_SLA.requestMs))
  )
  const p95Ms = Math.min(
    HIGH_STANDARD_SLA.p95Ms,
    Math.max(50, Math.round(Number(base.p95Ms) || HIGH_STANDARD_SLA.p95Ms))
  )
  let errorRate = Number(base.errorRate)
  if (!Number.isFinite(errorRate)) errorRate = HIGH_STANDARD_SLA.errorRate
  errorRate = Math.min(HIGH_STANDARD_SLA.errorRate, Math.max(0.001, errorRate))
  const alertAfterBreaches = Math.min(
    10,
    Math.max(1, Math.round(Number(base.alertAfterBreaches) || HIGH_STANDARD_SLA.alertAfterBreaches))
  )
  return { requestMs, p95Ms, errorRate, alertAfterBreaches }
}

export function getDefaultPerfSla(): PerfSlaConfig {
  return { ...HIGH_STANDARD_SLA }
}

function loadBaseline(): void {
  try {
    const p = baselinePath()
    if (!fs.existsSync(p)) return
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as PerfBaseline
    if (raw && typeof raw.p95Ms === 'number' && raw.p95Ms > 0) {
      state.baseline = {
        p95Ms: raw.p95Ms,
        sampleCount: Number(raw.sampleCount) || 0,
        capturedAt: String(raw.capturedAt || new Date().toISOString()),
      }
    }
  } catch {
    /* ignore corrupt */
  }
}

function loadSlaFromDisk(): void {
  try {
    const p = slaPath()
    if (!fs.existsSync(p)) return
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<PerfSlaConfig>
    state.sla = clampPerfSla(raw)
  } catch {
    /* ignore corrupt */
  }
}

function saveBaseline(b: PerfBaseline): void {
  const dir = resolvePerfRoot()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(baselinePath(), JSON.stringify(b, null, 2), 'utf-8')
}

function saveSla(s: PerfSlaConfig): void {
  const dir = resolvePerfRoot()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(slaPath(), JSON.stringify(s, null, 2), 'utf-8')
}

/**
 * 运维/配置管控热改 SLA。persist 默认 true；钳制后写入内存与 `{dataDir}/perf/sla.json`。
 */
export function setPerfSla(
  partial: Partial<PerfSlaConfig>,
  opts?: { persist?: boolean; actor?: string }
): PerfSlaConfig {
  const next = clampPerfSla({ ...state.sla, ...partial })
  state.sla = next
  if (opts?.persist !== false) {
    try {
      saveSla(next)
    } catch {
      /* disk optional until dataDir ready */
    }
  }
  log({
    level: 'info',
    type: 'perf',
    message: `perf_sla_updated requestMs=${next.requestMs} p95Ms=${next.p95Ms}`,
    action: 'perf_sla_update',
    context: { ...next, actor: opts?.actor || null },
  })
  return { ...next }
}

/** 恢复三维高标准默认并落盘 */
export function resetPerfSlaToHighStandard(opts?: { actor?: string }): PerfSlaConfig {
  return setPerfSla({ ...HIGH_STANDARD_SLA }, { persist: true, actor: opts?.actor || 'reset' })
}

function scheduleEventLoopProbe(): void {
  if (lagProbeScheduled) return
  lagProbeScheduled = true
  const t0 = Date.now()
  setImmediate(() => {
    eventLoopLagMs = Date.now() - t0
    lagProbeScheduled = false
  })
}

/**
 * 自动调压压力面：观测可预警，管控只在业务瓶颈或性能危机后触发。
 * 逼近 SLA、单次慢请求、观测轮询都不构成介入条件。
 */
export function evaluatePerfPressure(): PerfPressure {
  recomputeWindows()
  scheduleEventLoopProbe()
  const mem = process.memoryUsage()
  const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0
  const machine = getMachineCapacity()
  const totalMb = machine.totalMemBytes / (1024 * 1024)
  const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10
  const rssRatio = machine.totalMemBytes > 0 ? mem.rss / machine.totalMemBytes : 0
  const freeRatio = machine.totalMemBytes > 0 ? machine.freeMemBytes / machine.totalMemBytes : 1
  const qps = currentQps()
  const p95 = state.p95Ms
  const approachingSla =
    p95 != null && p95 > state.sla.p95Ms * 0.8 && state.sampleCount >= 10
  const reasons: string[] = []
  let level: PerfPressure['level'] = 'ok'

  const crisis =
    rssRatio >= 0.45 || freeRatio <= 0.08 || eventLoopLagMs >= machine.eventLoopCriticalMs
  const userBusy = getUserInflight() >= Math.max(1, Math.floor(machine.floorConcurrency * 0.8))
  const businessSlow = p95 != null && p95 > state.sla.p95Ms && state.sampleCount >= 20
  const bottleneck = userBusy && businessSlow
  const control: PerfPressure['control'] = crisis ? 'crisis' : bottleneck ? 'bottleneck' : 'idle'

  if (crisis) {
    if (rssRatio >= 0.45 || freeRatio <= 0.08) {
      reasons.push(`rss=${rssMb}MB/${Math.round(totalMb)}MB`)
      if (freeRatio <= 0.08) reasons.push(`free=${Math.round(freeRatio * 100)}%`)
    }
    if (eventLoopLagMs >= machine.eventLoopCriticalMs) reasons.push(`eventLoopLag=${eventLoopLagMs}ms`)
    reasons.push('perf_crisis')
    level = 'critical'
  } else if (bottleneck) {
    reasons.push(`business_bottleneck inflight=${getUserInflight()} p95=${p95}`)
    level = 'warn'
  } else {
    if (rssRatio >= 0.25 || freeRatio <= 0.15) {
      reasons.push(`rss=${rssMb}MB/${Math.round(totalMb)}MB`)
      if (freeRatio <= 0.15) reasons.push(`free=${Math.round(freeRatio * 100)}%`)
    }
    if (eventLoopLagMs >= machine.eventLoopWarnMs) reasons.push(`eventLoopLag=${eventLoopLagMs}ms`)
    if (approachingSla) reasons.push(`p95_approaching=${p95}`)
    if (!computeSlaOk() && state.sampleCount >= 10) reasons.push('sla_observed')
    if (reasons.length > 0) level = 'warn'
  }

  return {
    level,
    control,
    reasons,
    heapRatio: Math.round(heapRatio * 1000) / 1000,
    rssMb,
    eventLoopLagMs,
    qps: Math.round(qps * 100) / 100,
    p95Ms: p95,
    approachingSla,
    checkedAt: new Date().toISOString(),
  }
}

export function getPerfPressure(): PerfPressure {
  return autoSense()
}

function elasticityHeld(): boolean {
  const applied = getElasticityState().applied
  if (!applied) return false
  const factor = typeof applied.rateLimitFactor === 'number' ? applied.rateLimitFactor : 1
  return (
    factor < 0.999 ||
    applied.concurrency < (applied.baselineConcurrency || applied.concurrency)
  )
}

function hasRaiseDemand(sense: PerfPressure, concurrency: number): boolean {
  if (concurrency <= 0) return false
  const inflight = getIngressInflight()
  if (inflight >= Math.max(1, concurrency * 0.8)) return true
  if (sense.qps >= concurrency * 0.25) return true
  if (sense.approachingSla && sense.qps >= 0.5) return true
  return false
}

function automationView(sense: PerfPressure): PerfAutomation {
  const exec = autoExecute()
  const elast = getElasticityState().applied
  const held = elasticityHeld()
  const machine = getMachineCapacity()
  const raiseActive = Boolean(lastRaiseAction === 'raise' && sense.level === 'ok' && !held)
  const promoteActive = Boolean(
    (lastPromoteAction === 'promote' || lastPromoteAction === 'baseline') &&
      sense.level === 'ok' &&
      !held
  )
  return {
    sense: {
      active: true,
      at: lastSenseAt || sense.checkedAt,
      level: sense.level,
      reasons: sense.reasons,
    },
    machine: {
      platform: machine.platform,
      arch: machine.arch,
      logicalCpus: machine.logicalCpus,
      totalMemMb: Math.round(machine.totalMemBytes / (1024 * 1024)),
      freeMemMb: Math.round(machine.freeMemBytes / (1024 * 1024)),
      floorConcurrency: machine.floorConcurrency,
      maxConcurrency: machine.maxConcurrency,
      apiRpm: machine.apiRpm,
      mqDrainBatch: machine.mqDrainBatch,
    },
    decide: {
      active: true,
      at: lastDecideAt || sense.checkedAt,
      intent: lastDecideIntent,
      reason: lastDecideReason,
    },
    regulate: {
      active: lastPressureLevel !== 'ok' || lastDecideIntent === 'tighten',
      at: lastRegulateAt,
      action: lastRegulateAction,
    },
    execute: exec,
    recover: {
      active: held || lastDecideIntent === 'recover',
      at: lastRecoverAt || lastReleaseAt,
      action: lastRecoverAction || lastReleaseReason,
      held,
    },
    release: {
      active: Boolean(lastReleaseAt || lastRecoverAt),
      at: lastReleaseAt || lastRecoverAt,
      reason: lastReleaseReason || lastRecoverAction,
      held,
    },
    raise: {
      active: raiseActive,
      at: lastRaiseAt,
      action: lastRaiseAction,
      demand: lastRaiseDemand,
      concurrency: elast?.concurrency ?? null,
    },
    promote: {
      active: promoteActive,
      at: lastPromoteAt,
      action: lastPromoteAction,
      concurrency: elast?.concurrency ?? null,
      baselineConcurrency: elast?.baselineConcurrency ?? null,
    },
    settle: {
      active: lastDecideIntent === 'settle' || Boolean(lastSettleAt && settlePending === false),
      at: lastSettleAt,
      reason: lastSettleReason,
    },
    optimize: {
      active: raiseActive || promoteActive,
      at: lastOptimizeAt || lastRaiseAt || lastPromoteAt,
      action: lastOptimizeAction || lastRaiseAction || lastPromoteAction,
      concurrency: elast?.concurrency ?? null,
      baselineConcurrency: elast?.baselineConcurrency ?? null,
    },
  }
}

/**
 * 4. 自动落地：观测已应用的并发上限与限流系数（decideElasticity 已写入执行面）。
 */
export function autoExecute(): PerfAutomation['execute'] {
  const elast = getElasticityState()
  const applied = elast.applied
  const decision = elast.lastDecision
  return {
    active: Boolean(applied),
    at: applied?.lastAppliedAt || decision?.at || null,
    concurrency: applied?.concurrency ?? null,
    rateLimitFactor: typeof applied?.rateLimitFactor === 'number' ? applied.rateLimitFactor : null,
    action: applied?.lastAction || decision?.action || null,
    reversible: Boolean(applied?.reversible),
  }
}

/** 1. 自动感知：每轮必执行。采样延迟、内存、QPS、SLA 逼近。 */
export function autoSense(): PerfPressure {
  const sense = evaluatePerfPressure()
  lastSenseAt = sense.checkedAt
  return sense
}

/**
 * 2. 自动判定：本轮唯一意图（收紧 / 回升 / 提高 / 固化 / 收尾 / 待命）。
 * 每 tick 只走一个意图，避免释放打满又盲目抬高。
 */
export function autoDecide(sense: PerfPressure): {
  intent: PerfDecideIntent
  reason: string
} {
  const applied = getElasticityState().applied
  const concurrency = applied?.concurrency ?? machineFloorConcurrency()
  const baseline = applied?.baselineConcurrency ?? concurrency
  const held = elasticityHeld()
  const healthy = sense.level === 'ok' && computeSlaOk()

  let intent: PerfDecideIntent = 'hold'
  let reason = 'steady'

  if (sense.control === 'bottleneck' || sense.control === 'crisis') {
    intent = held ? 'hold' : 'tighten'
    reason = held ? 'held_waiting_clear' : `control_${sense.control}`
  } else if (held) {
    intent = 'recover'
    reason = 'elasticity_held'
  } else if (healthy && concurrency > baseline && clearSenseCycles >= OPTIMIZE_PROMOTE_CYCLES) {
    intent = 'promote'
    reason = 'elevate_stable'
  } else if (healthy && clearSenseCycles >= RAISE_CLEAR_CYCLES) {
    const undershoot = concurrency < machineFloorConcurrency()
    const demand = hasRaiseDemand(sense, concurrency)
    lastRaiseDemand = demand || undershoot
    if (undershoot || (demand && concurrency < machineMaxConcurrency())) {
      intent = 'raise'
      reason = undershoot ? 'undershoot_floor' : 'demand_raise'
    } else if (settlePending || slaEpisodeAlerted || pressureEpisodeAlerted) {
      intent = 'settle'
      reason = 'episode_clear'
    } else {
      intent = 'hold'
      reason = demand ? 'at_ceiling' : 'no_demand'
    }
  } else if (healthy && (settlePending || slaEpisodeAlerted || pressureEpisodeAlerted)) {
    if (clearSenseCycles >= RELEASE_CLEAR_CYCLES) {
      intent = 'settle'
      reason = 'episode_clear'
    }
  }

  lastDecideAt = new Date().toISOString()
  lastDecideIntent = intent
  lastDecideReason = reason
  return { intent, reason }
}

/**
 * 3. 自动调压：仅业务瓶颈或性能危机。禁止因逼近 SLA 收紧，禁止在此函数里回升或提高。
 */
export function autoRegulate(sense: PerfPressure): { acted: boolean; action: string | null } {
  if (!state.ready) return { acted: false, action: null }
  if (sense.control !== 'bottleneck' && sense.control !== 'crisis') {
    return { acted: false, action: null }
  }
  lastPressureLevel = sense.level
  clearSenseCycles = 0
  optimizeRaiseStreak = 0
  state.loopPhase = 'breach'
  // 本轮已收紧：只保持落地态，禁止每隔冷却再 decide / 再派单（反复提示）。
  if (elasticityHeld()) {
    return { acted: false, action: lastRegulateAction }
  }
  const now = Date.now()
  if (now - lastPressureDecideAt < PRESSURE_DECIDE_COOLDOWN_MS) {
    return { acted: false, action: lastRegulateAction }
  }
  lastPressureDecideAt = now
  const event = sense.control === 'crisis' ? 'PerfPressureCritical' : 'PerfPressureWarn'
  const d = decideElasticity({
    event,
    p95Ms: sense.p95Ms ?? undefined,
    qps: sense.qps,
    errorRate: currentErrorRate(),
  })
  lastRegulateAt = new Date().toISOString()
  lastRegulateAction = d.action
  settlePending = true
  if (sense.control === 'crisis' && !pressureEpisodeAlerted) {
    publishDomainEvent(
      'PerfPressureCritical',
      8,
      { ...sense, action: d.action, concurrency: d.targetConcurrency },
      'critical'
    )
    gradeAndEmitAlertCandidate({
      signal: 'perf_pressure_critical',
      source: 'perf-service',
      title: '性能危机：已暂停观测并推迟调度，业务请求仍放行',
      detail: sense.reasons.join('; ') || 'critical',
      metricValue: sense.eventLoopLagMs || sense.rssMb,
      threshold: getMachineCapacity().eventLoopCriticalMs,
      grade: 'critical',
    })
    pressureEpisodeAlerted = true
  }
  log({
    level: sense.level === 'critical' ? 'error' : 'warn',
    type: 'perf',
    message: `auto_regulate ${sense.level} ${d.action}`,
    action: 'perf_auto_regulate',
    context: { reasons: sense.reasons, action: d.action },
  })
  return { acted: true, action: d.action }
}

/**
 * 5. 自动回升：感知连续正常且仍持有收紧时，渐进回到基线（PerfPressureCleared），禁止一次打满。
 */
export function autoRecover(sense: PerfPressure): { acted: boolean; action: string | null } {
  if (!state.ready) return { acted: false, action: null }
  if (sense.control === 'bottleneck' || sense.control === 'crisis') {
    clearSenseCycles = 0
    return { acted: false, action: null }
  }
  clearSenseCycles += 1
  if (!elasticityHeld()) {
    if (state.loopPhase === 'recovered' && clearSenseCycles >= RELEASE_CLEAR_CYCLES) {
      state.loopPhase = 'steady'
    }
    return { acted: false, action: 'not_held' }
  }
  if (clearSenseCycles < RELEASE_CLEAR_CYCLES) {
    return { acted: false, action: 'waiting_clear' }
  }
  const now = Date.now()
  if (now - lastPressureDecideAt < RELEASE_COOLDOWN_MS) {
    return { acted: false, action: 'cooldown' }
  }
  lastPressureDecideAt = now
  lastPressureLevel = 'ok'
  const d = decideElasticity({
    event: 'PerfPressureCleared',
    p95Ms: sense.p95Ms ?? undefined,
    qps: sense.qps,
    currentConcurrency: getElasticityState().applied?.concurrency,
  })
  lastRecoverAt = new Date().toISOString()
  lastRecoverAction = d.action
  lastReleaseAt = lastRecoverAt
  lastReleaseReason = 'auto_recover'
  state.loopPhase = 'recovered'
  state.lastRecoveredAt = lastRecoverAt
  settlePending = true
  log({
    level: 'info',
    type: 'perf',
    message: `auto_recover ${d.action} concurrency=${d.targetConcurrency} factor=${d.rateLimitFactor}`,
    action: 'perf_auto_recover',
    context: {
      action: d.action,
      concurrency: d.targetConcurrency,
      rateLimitFactor: d.rateLimitFactor,
      held: elasticityHeld(),
    },
  })
  if (!elasticityHeld()) {
    autoSettle(sense, 'recovered_to_baseline')
  }
  return { acted: true, action: d.action }
}

/** @deprecated 兼容旧名：回升 */
export function autoRelease(sense: PerfPressure): { acted: boolean; reason: string | null } {
  const r = autoRecover(sense)
  return { acted: r.acted, reason: r.action }
}

/**
 * 6. 自动提高：仅在有需求（或低于默认地板）时步进抬升；无流量禁止盲目冲顶。
 */
export function autoRaise(sense: PerfPressure): { acted: boolean; action: string | null } {
  if (!state.ready) return { acted: false, action: null }
  if (sense.level !== 'ok' || !computeSlaOk() || elasticityHeld()) {
    optimizeRaiseStreak = 0
    return { acted: false, action: null }
  }
  if (clearSenseCycles < RAISE_CLEAR_CYCLES) {
    return { acted: false, action: 'waiting_clear' }
  }
  const now = Date.now()
  if (now - lastOptimizeDecideAt < OPTIMIZE_COOLDOWN_MS) {
    return { acted: false, action: lastRaiseAction }
  }
  const applied = getElasticityState().applied
  const concurrency = applied?.concurrency ?? 0
  const undershoot = concurrency < machineFloorConcurrency()
  const demand = hasRaiseDemand(sense, concurrency)
  lastRaiseDemand = demand || undershoot
  if (!undershoot && !demand) {
    return { acted: false, action: 'no_demand' }
  }
  if (concurrency >= machineMaxConcurrency()) {
    return { acted: false, action: 'at_ceiling' }
  }
  const cap = undershoot && !demand ? machineFloorConcurrency() : machineMaxConcurrency()
  if (concurrency >= cap) {
    return { acted: false, action: 'at_soft_ceiling' }
  }
  lastOptimizeDecideAt = now
  const d = decideElasticity({
    event: 'PerfOptimizeRaise',
    p95Ms: sense.p95Ms ?? undefined,
    qps: sense.qps,
    currentConcurrency: concurrency,
    budget: { maxConcurrency: cap },
  })
  lastRaiseAt = new Date().toISOString()
  lastRaiseAction = d.action
  lastOptimizeAt = lastRaiseAt
  lastOptimizeAction = d.action
  optimizeRaiseStreak += 1
  log({
    level: 'info',
    type: 'perf',
    message: `auto_raise concurrency=${d.targetConcurrency} demand=${lastRaiseDemand}`,
    action: 'perf_auto_raise',
    context: {
      from: concurrency,
      to: d.targetConcurrency,
      demand: lastRaiseDemand,
      undershoot,
      cap,
    },
  })
  return { acted: true, action: d.action }
}

/**
 * 7. 自动固化：提高后的并发写入基线；P95 更优则刷新对照。
 */
export function autoPromote(sense: PerfPressure): { acted: boolean; action: string | null } {
  if (!state.ready) return { acted: false, action: null }
  if (sense.level !== 'ok' || !computeSlaOk() || elasticityHeld()) {
    return { acted: false, action: null }
  }
  const applied = getElasticityState().applied
  const concurrency = applied?.concurrency ?? 0
  const baseline = applied?.baselineConcurrency ?? concurrency
  if (concurrency <= baseline) {
    if (
      state.p95Ms != null &&
      state.sampleCount >= 50 &&
      state.baseline &&
      state.p95Ms < state.baseline.p95Ms * 0.9
    ) {
      const now = Date.now()
      if (now - lastOptimizeDecideAt < OPTIMIZE_COOLDOWN_MS) {
        return { acted: false, action: 'cooldown' }
      }
      lastOptimizeDecideAt = now
      capturePerfBaseline(true)
      lastPromoteAt = new Date().toISOString()
      lastPromoteAction = 'baseline'
      lastOptimizeAt = lastPromoteAt
      lastOptimizeAction = 'baseline'
      return { acted: true, action: 'baseline' }
    }
    return { acted: false, action: 'nothing_to_promote' }
  }
  if (optimizeRaiseStreak < OPTIMIZE_PROMOTE_CYCLES && clearSenseCycles < OPTIMIZE_PROMOTE_CYCLES) {
    return { acted: false, action: 'waiting_stable' }
  }
  const now = Date.now()
  if (now - lastOptimizeDecideAt < OPTIMIZE_COOLDOWN_MS) {
    return { acted: false, action: 'cooldown' }
  }
  lastOptimizeDecideAt = now
  promoteElasticityBaseline('auto_promote')
  lastPromoteAt = new Date().toISOString()
  lastPromoteAction = 'promote'
  lastOptimizeAt = lastPromoteAt
  lastOptimizeAction = 'promote'
  optimizeRaiseStreak = 0
  if (state.p95Ms != null && (!state.baseline || state.p95Ms < state.baseline.p95Ms)) {
    capturePerfBaseline(true)
    lastPromoteAction = 'promote+baseline'
    lastOptimizeAction = 'promote+baseline'
  }
  log({
    level: 'info',
    type: 'perf',
    message: `auto_promote concurrency=${concurrency} baseline→${concurrency}`,
    action: 'perf_auto_promote',
    context: { concurrency, fromBaseline: baseline },
  })
  return { acted: true, action: 'promote' }
}

/** @deprecated 兼容：提高+固化 */
export function autoOptimize(sense: PerfPressure): { acted: boolean; action: string | null } {
  const p = autoPromote(sense)
  if (p.acted) return p
  return autoRaise(sense)
}

/**
 * 8. 自动收尾：关性能告警、清 episode 闩、清空尖刺窗，进入稳态。
 */
export function autoSettle(
  sense: PerfPressure,
  reason = 'auto_settle'
): { acted: boolean; reason: string } {
  if (!state.ready) return { acted: false, reason: 'not_ready' }
  closeOpenAlertsBySource('perf-service', 'perf-auto-settle', reason)
  ring.length = 0
  recomputeWindows()
  slaEpisodeAlerted = false
  pressureEpisodeAlerted = false
  settlePending = false
  lastPressureLevel = 'ok'
  lastSettleAt = new Date().toISOString()
  lastSettleReason = reason
  state.loopPhase = 'steady'
  state.consecutiveHealthy = 0
  log({
    level: 'info',
    type: 'perf',
    message: `auto_settle reason=${reason}`,
    action: 'perf_auto_settle',
    context: { reason, p95Ms: sense.p95Ms, qps: sense.qps },
  })
  return { acted: true, reason }
}

/** 样本路径与启动自愈：SLA 已正常仍持有收紧 → 回升一步（不要求 loopPhase=breach） */
function releaseHeldIfHealthy(reason: string): boolean {
  if (!state.ready || !elasticityHeld() || !computeSlaOk()) return false
  const sense = evaluatePerfPressure()
  if (sense.level !== 'ok') return false
  // 卡住过久时允许一次 revert 自愈，随后走判定链
  if (reason.startsWith('auto_release') || reason.includes('startup')) {
    lastPressureDecideAt = Date.now()
    lastPressureLevel = 'ok'
    clearSenseCycles = 0
    revertElasticity(reason)
    lastRecoverAt = new Date().toISOString()
    lastRecoverAction = 'revert'
    lastReleaseAt = lastRecoverAt
    lastReleaseReason = reason
    state.loopPhase = 'recovered'
    state.lastRecoveredAt = lastRecoverAt
    settlePending = true
    autoSettle(sense, reason)
    return true
  }
  autoRecover(sense)
  return true
}

function commitAutoRelease(
  sense: PerfPressure,
  reason: string
): { acted: true; reason: string } {
  // 兼容旧调用：等价于一次自愈 revert + 收尾
  lastPressureDecideAt = Date.now()
  lastPressureLevel = 'ok'
  clearSenseCycles = 0
  revertElasticity(reason)
  lastRecoverAt = new Date().toISOString()
  lastRecoverAction = 'revert'
  lastReleaseAt = lastRecoverAt
  lastReleaseReason = reason
  state.loopPhase = 'recovered'
  state.lastRecoveredAt = lastReleaseAt
  state.consecutiveHealthy = 0
  settlePending = true
  autoSettle(sense, reason)
  log({
    level: 'info',
    type: 'perf',
    message: `auto_release elasticity_reverted reason=${reason}`,
    action: 'perf_auto_release',
    context: { p95Ms: sense.p95Ms, qps: sense.qps, reason },
  })
  return { acted: true, reason }
}

/**
 * 强制顺序：感知 → 判定 → 单意图执行（调压|回升|提高|固化|收尾）。
 * 落地为观测段；派单在告警子环。
 */
export function runPerfAutomation(): PerfAutomation {
  const sense = autoSense()
  if (!state.ready) return automationView(sense)

  if (sense.control !== 'idle') {
    clearSenseCycles = 0
    optimizeRaiseStreak = 0
  } else if (sense.level === 'ok' && computeSlaOk() && !elasticityHeld()) {
    clearSenseCycles += 1
  }

  const decision = autoDecide(sense)
  switch (decision.intent) {
    case 'tighten':
      autoRegulate(sense)
      break
    case 'recover':
      autoRecover(sense)
      break
    case 'raise':
      autoRaise(sense)
      break
    case 'promote':
      autoPromote(sense)
      break
    case 'settle':
      autoSettle(sense, decision.reason)
      break
    default:
      break
  }
  return automationView(sense)
}

/**
 * 兼容入口：定时环与突发尖刺都走完整自动闭环（感知→调节→执行→释放）。
 */
export function autoRegulateFromPressure(force = false): {
  acted: boolean
  pressure: PerfPressure
  decisionAction: string | null
} {
  if (force) lastPressureDecideAt = 0
  const view = runPerfAutomation()
  const pressure = evaluatePerfPressure()
  return {
    acted: view.regulate.active || view.release.active,
    pressure,
    decisionAction: view.regulate.action || view.release.reason,
  }
}

function startRegulateLoop(): void {
  if (regulateTimer) return
  regulateTimer = setInterval(() => {
    try {
      runPerfAutomation()
    } catch {
      /* never crash automation loop */
    }
  }, REGULATE_INTERVAL_MS)
  if (typeof regulateTimer === 'object' && regulateTimer && 'unref' in regulateTimer) {
    ;(regulateTimer as NodeJS.Timeout).unref?.()
  }
}

function stopRegulateLoop(): void {
  if (regulateTimer) {
    clearInterval(regulateTimer)
    regulateTimer = null
  }
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))
  return sorted[idx] ?? null
}

function pruneSlaRing(now = Date.now()): void {
  const cut = now - SLA_RING_TTL_MS
  while (ring.length > 0 && ring[0].at < cut) ring.shift()
  if (ring.length > WINDOW) ring.splice(0, ring.length - WINDOW)
  while (interactiveRing.length > 0 && interactiveRing[0].at < cut) interactiveRing.shift()
  if (interactiveRing.length > WINDOW) {
    interactiveRing.splice(0, interactiveRing.length - WINDOW)
  }
}

function recomputeWindows(): void {
  pruneSlaRing()
  if (ring.length === 0) {
    state.p50Ms = null
    state.p95Ms = null
    state.p99Ms = null
  } else {
    const sorted = ring.map((s) => s.ms).sort((a, b) => a - b)
    state.p50Ms = percentile(sorted, 0.5)
    state.p95Ms = percentile(sorted, 0.95)
    state.p99Ms = percentile(sorted, 0.99)
  }
  if (interactiveRing.length === 0) {
    interactiveP95Ms = null
  } else {
    const isorted = interactiveRing.map((s) => s.ms).sort((a, b) => a - b)
    interactiveP95Ms = percentile(isorted, 0.95)
  }
}

function interactiveWindowBreached(): boolean {
  if (interactiveRing.length < 10) return false
  if (interactiveP95Ms == null) return false
  return interactiveP95Ms > INTERACTIVE_HIGH_STANDARD_SLA.p95Ms
}

function currentErrorRate(): number {
  pruneSlaRing()
  if (ring.length === 0) return 0
  let err = 0
  for (const s of ring) if (s.status >= 500) err += 1
  return err / ring.length
}

function currentQps(): number {
  const now = Date.now()
  while (recentAts.length && now - recentAts[0]! > QPS_WINDOW_MS) recentAts.shift()
  if (recentAts.length < 2) return recentAts.length / (QPS_WINDOW_MS / 1000)
  const span = Math.max(1, now - recentAts[0]!)
  return (recentAts.length * 1000) / span
}

function effectiveP95Sla(): number {
  const cap = state.sla.p95Ms
  if (!state.baseline?.p95Ms) return cap
  const adaptive = Math.ceil(state.baseline.p95Ms * 1.35)
  return Math.min(cap, Math.max(50, adaptive))
}

function computeSlaOk(): boolean {
  const p95 = state.p95Ms
  if (p95 != null && p95 > effectiveP95Sla()) return false
  if (currentErrorRate() > state.sla.errorRate) return false
  return true
}

function topSlowRoutes(limit = 8): PerfRouteStat[] {
  const rows: PerfRouteStat[] = []
  for (const [route, st] of routeMap) {
    const sorted = [...st.ring].sort((a, b) => a - b)
    rows.push({
      route,
      count: st.count,
      errorCount: st.errorCount,
      maxMs: st.maxMs,
      avgMs: st.count ? Math.round(st.sumMs / st.count) : 0,
      p95Ms: percentile(sorted, 0.95),
    })
  }
  rows.sort((a, b) => (b.p95Ms ?? b.maxMs) - (a.p95Ms ?? a.maxMs))
  return rows.slice(0, limit)
}

function touchRoute(route: string, durationMs: number, statusCode: number): void {
  let st = routeMap.get(route)
  if (!st) {
    if (routeMap.size >= ROUTE_CAP) {
      // 淘汰调用最少的一条
      let victim: string | null = null
      let minCount = Infinity
      for (const [k, v] of routeMap) {
        if (v.count < minCount) {
          minCount = v.count
          victim = k
        }
      }
      if (victim) routeMap.delete(victim)
    }
    st = { count: 0, errorCount: 0, maxMs: 0, sumMs: 0, ring: [] }
    routeMap.set(route, st)
  }
  st.count += 1
  st.sumMs += durationMs
  if (durationMs > st.maxMs) st.maxMs = durationMs
  if (statusCode >= 500) st.errorCount += 1
  st.ring.push(durationMs)
  if (st.ring.length > ROUTE_RING) st.ring.shift()
}

/**
 * 在样本充足且当前 SLA 健康时固化基线（可逆优化对照点）
 */
export function capturePerfBaseline(force = false): PerfBaseline | null {
  if (!state.ready) return null
  if (!force && state.sampleCount < 30) return null
  if (!force && !computeSlaOk()) return null
  const p95 = state.p95Ms
  if (p95 == null || p95 <= 0) return null
  const b: PerfBaseline = {
    p95Ms: p95,
    sampleCount: state.sampleCount,
    capturedAt: new Date().toISOString(),
  }
  state.baseline = b
  saveBaseline(b)
  log({
    level: 'info',
    type: 'perf',
    message: `perf_baseline_captured p95=${p95}ms`,
    action: 'perf_baseline_capture',
    context: { ...b },
  })
  return b
}

export function initPerf(opts?: { dataDir?: string; sla?: Partial<PerfSlaConfig> }): PerfState {
  dataDirRef = opts?.dataDir || dataDirRef
  if (dataDirRef) {
    const dir = resolvePerfRoot()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    loadBaseline()
    loadSlaFromDisk()
  }
  if (opts?.sla) {
    state.sla = clampPerfSla({ ...state.sla, ...opts.sla })
    try {
      saveSla(state.sla)
    } catch {
      /* ignore */
    }
  }
  state.ready = true
  startRegulateLoop()
  // 启动自愈：磁盘可能残留收紧态；立即感知一轮，短延迟后再确认释放
  try {
    runPerfAutomation()
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      if (elasticityHeld() && computeSlaOk()) {
        clearSenseCycles = RELEASE_CLEAR_CYCLES
        lastPressureDecideAt = 0
        runPerfAutomation()
      }
    } catch {
      /* ignore */
    }
  }, REGULATE_INTERVAL_MS * RELEASE_CLEAR_CYCLES + 50)
  return getPerfState()
}

export function resetPerf(): void {
  stopRegulateLoop()
  state.ready = false
  state.sampleCount = 0
  state.lastSample = null
  state.p50Ms = null
  state.p95Ms = null
  state.p99Ms = null
  state.breachCount = 0
  state.consecutiveBreaches = 0
  state.lastBreachAt = null
  state.loopPhase = 'steady'
  state.consecutiveHealthy = 0
  state.lastRecoveredAt = null
  state.baseline = null
  state.sla = { ...DEFAULT_SLA }
  ring.length = 0
  recentAts.length = 0
  routeMap.clear()
  dataDirRef = null
  lastPressureDecideAt = 0
  lastPressureLevel = 'ok'
  clearSenseCycles = 0
  lastSenseAt = ''
  lastRegulateAt = null
  lastRegulateAction = null
  lastReleaseAt = null
  lastReleaseReason = null
  eventLoopLagMs = 0
}

export function isPerfReady(): boolean {
  return state.ready
}

/**
 * 5.7 流程调度编排：自动调度受性能运行管控约束。
 * 弹性已收紧或 SLA 越阈（样本足够）时，非关键任务应推迟。
 */
export function shouldDeferScheduleForPerf(): { defer: boolean; reason: string } {
  if (!state.ready) return { defer: false, reason: 'perf_not_ready' }
  const control = evaluatePerfPressure().control
  if (control === 'idle') return { defer: false, reason: 'business_first' }
  return { defer: true, reason: control }
}

export function getPerfState(): PerfState & {
  routeClassSla: {
    interactive: PerfSlaConfig
    standard: PerfSlaConfig
    heavy: PerfSlaConfig
  }
  interactiveP95Ms: number | null
  interactiveSampleCount: number
} {
  const applied = getElasticityState().applied
  recomputeWindows()
  return {
    ready: state.ready,
    sampleCount: state.sampleCount,
    lastSample: state.lastSample ? { ...state.lastSample } : null,
    p50Ms: state.p50Ms,
    p95Ms: state.p95Ms,
    p99Ms: state.p99Ms,
    breachCount: state.breachCount,
    qps: Math.round(currentQps() * 100) / 100,
    errorRate: Math.round(currentErrorRate() * 10000) / 10000,
    windowSize: WINDOW,
    sla: { ...state.sla },
    baseline: state.baseline ? { ...state.baseline } : null,
    slaOk: computeSlaOk() && !interactiveWindowBreached(),
    effectiveP95Ms: effectiveP95Sla(),
    topSlowRoutes: topSlowRoutes(),
    appliedConcurrency: applied?.concurrency ?? null,
    lastBreachAt: state.lastBreachAt,
    loopPhase: state.loopPhase,
    consecutiveHealthy: state.consecutiveHealthy,
    lastRecoveredAt: state.lastRecoveredAt,
    pressure: evaluatePerfPressure(),
    automation: automationView(evaluatePerfPressure()),
    routeClassSla: {
      interactive: { ...INTERACTIVE_HIGH_STANDARD_SLA },
      standard: { ...state.sla },
      heavy: { ...HEAVY_HIGH_STANDARD_SLA },
    },
    interactiveP95Ms,
    interactiveSampleCount: interactiveRing.length,
  }
}

/**
 * 长轮询、运维观测轮询不进时长 SLA 窗。
 * 监控页自己的 health/status 轮询若计入分位，会把 P95 打穿并一直弹预警。
 */
export function isDurationSlaExempt(route: string): boolean {
  const r = route.toLowerCase()
  const pathOnly = r.replace(/^(get|post|put|patch|delete|head)\s+/, '').split('?')[0] || ''
  if (
    pathOnly.includes('/notifications/wait') ||
    pathOnly.includes('/events/wait') ||
    pathOnly.includes('/sse') ||
    pathOnly.includes('/stream')
  ) {
    return true
  }
  // 铃铛 / 已读 / 版本检查：观测轮询，禁止打穿业务时长 SLA（否则预警无法解除）
  if (pathOnly.includes('/notifications')) return true
  if (pathOnly.includes('/version/latest')) return true
  const withApi = pathOnly.startsWith('/api/')
    ? pathOnly
    : pathOnly.startsWith('/')
      ? `/api${pathOnly}`
      : pathOnly
  const opsExact = [
    '/api/health',
    '/healthz/ready',
    '/api/config',
    '/api/ops/snapshot',
    '/api/gateway/status',
    '/api/alerts',
    '/api/alerts/status',
    '/api/schedule/status',
    '/api/elasticity/status',
    '/api/perf/status',
    '/api/automation/status',
    '/api/release/status',
    '/api/files/storage/status',
    '/api/governance/status',
    '/api/tracing/status',
    '/api/kms/status',
    '/api/audit/status',
    '/api/notify/status',
    '/api/pipeline/status',
    '/api/migration/status',
    '/api/risk/dispositions',
  ]
  if (
    pathOnly.includes('/ops/snapshot') ||
    pathOnly.includes('/gateway/status') ||
    pathOnly.includes('/gateway/circuit')
  ) {
    return true
  }
  return opsExact.some(
    (p) =>
      pathOnly === p ||
      pathOnly.endsWith(p) ||
      withApi === p ||
      withApi.endsWith(p) ||
      (p.startsWith('/api/') && pathOnly === p.slice(4))
  )
}

/** 网关耗时抽样 → 分位 / 频率 / 越界处置 */
export function recordPerfSample(input: {
  route: string
  durationMs: number
  statusCode: number
}): void {
  if (!state.ready) return
  const sample: PerfSample = {
    at: new Date().toISOString(),
    route: input.route.slice(0, 120),
    durationMs: input.durationMs,
    statusCode: input.statusCode,
  }
  state.lastSample = sample
  state.sampleCount += 1
  recentAts.push(Date.now())
  while (recentAts.length > WINDOW * 2) recentAts.shift()
  touchRoute(sample.route, input.durationMs, input.statusCode)

  const slaExempt = isDurationSlaExempt(sample.route)
  const routeClass = classifyPerfRoute(sample.route)
  const routeSla = resolveRouteSla(sample.route)
  if (!slaExempt) {
    ring.push({ at: Date.now(), ms: input.durationMs, status: input.statusCode })
    if (routeClass === 'interactive') {
      interactiveRing.push({
        at: Date.now(),
        ms: input.durationMs,
        status: input.statusCode,
      })
    }
    pruneSlaRing()
    recomputeWindows()
  }

  // 自动基线：健康窗首次固化；持续更优则刷新（闭环固化，不放宽 SLA 上限）
  if (!slaExempt && computeSlaOk() && !interactiveWindowBreached() && state.sampleCount >= 50) {
    const p95 = state.p95Ms
    if (!state.baseline) {
      capturePerfBaseline(false)
    } else if (
      state.consecutiveHealthy >= 30 &&
      p95 != null &&
      p95 > 0 &&
      p95 < state.baseline.p95Ms * 0.9
    ) {
      capturePerfBaseline(true)
      state.consecutiveHealthy = 0
    }
  }

  if (slaExempt) return

  const requestBreach = input.durationMs >= routeSla.requestMs
  const windowBreach = !computeSlaOk() || (routeClass === 'interactive' && interactiveWindowBreached())
  if (requestBreach || windowBreach) {
    state.breachCount += 1
    state.consecutiveBreaches += 1
    state.consecutiveHealthy = 0
    state.loopPhase = 'breach'
    state.lastBreachAt = sample.at
    log({
      level: 'warn',
      type: 'perf',
      message: `sla_breach ${sample.route} ${input.durationMs}ms p95=${state.p95Ms}`,
      action: 'perf_sla_breach',
      context: {
        route: sample.route,
        durationMs: input.durationMs,
        p50Ms: state.p50Ms,
        p95Ms: state.p95Ms,
        p99Ms: state.p99Ms,
        qps: currentQps(),
        errorRate: currentErrorRate(),
        effectiveP95Sla: effectiveP95Sla(),
        elasticity: getElasticityState().lastDecision?.action ?? null,
        loopPhase: state.loopPhase,
      },
    })

    publishDomainEvent(
      'PerfSlaBreached',
      8,
      {
        route: sample.route,
        durationMs: input.durationMs,
        p95Ms: state.p95Ms,
        qps: currentQps(),
        errorRate: currentErrorRate(),
        breachCount: state.breachCount,
        consecutiveBreaches: state.consecutiveBreaches,
      },
      'warn'
    )

    if (!slaEpisodeAlerted && state.consecutiveBreaches >= state.sla.alertAfterBreaches) {
      gradeAndEmitAlertCandidate({
        signal: 'perf_sla_breach',
        source: 'perf-service',
        title: '性能 SLA 越阈',
        detail: `P95=${state.p95Ms ?? '—'}ms · ${sample.route} ${input.durationMs}ms · 连续越阈 ${state.consecutiveBreaches}`,
        metricValue: state.p95Ms ?? input.durationMs,
        threshold: effectiveP95Sla(),
        grade: state.p95Ms != null && state.p95Ms >= state.sla.p95Ms * 2 ? 'critical' : 'warn',
      })
      slaEpisodeAlerted = true
    }
    return
  }

  state.consecutiveBreaches = 0
  state.consecutiveHealthy += 1
  if (
    (slaEpisodeAlerted || pressureEpisodeAlerted) &&
    computeSlaOk() &&
    !elasticityHeld() &&
    state.consecutiveHealthy >= RELEASE_HEALTHY_SAMPLES
  ) {
    slaEpisodeAlerted = false
    pressureEpisodeAlerted = false
    closeOpenAlertsBySource('perf-service', 'perf-auto-release', 'pressure_cleared')
  }
  // 持有收紧 + SLA 正常 + 连续健康：必须释放（不要求此前 loopPhase 仍为 breach）
  if (
    elasticityHeld() &&
    computeSlaOk() &&
    state.consecutiveHealthy >= RELEASE_HEALTHY_SAMPLES
  ) {
    const released = releaseHeldIfHealthy('auto_release_sla_ok')
    publishDomainEvent(
      'PerfSlaRecovered',
      8,
      {
        p95Ms: state.p95Ms,
        qps: currentQps(),
        errorRate: currentErrorRate(),
        sampleCount: state.sampleCount,
        released,
      },
      'info'
    )
    if (!released) {
      state.loopPhase = 'recovered'
      state.lastRecoveredAt = sample.at
    }
  } else if (state.loopPhase === 'recovered' && state.consecutiveHealthy >= RELEASE_HEALTHY_SAMPLES) {
    state.loopPhase = 'steady'
  }
}

export const IA85 = {
  capabilityId: 'IA85' as const,
  hostStableId: 'RB-L1-MGMT-PERF-01' as const,
  explainableMetrics: ['rate', 'p95', 'error_ratio', 'qps', 'pressure', 'heap', 'event_loop_lag'],
  reversible: true,
  auditAnchor: 'RB-L1-MGMT-TRACE-01',
}

export function ready_rb_l1_mgmt_perf_01(): boolean {
  return isPerfReady() && IA85.capabilityId === 'IA85' && IA85.hostStableId === 'RB-L1-MGMT-PERF-01'
}
