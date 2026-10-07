/**
 * CYP-memo 混沌工程服务（嵌入式）
 * 专属：注入 latencyMs / killSwitchArm / diskPressure 模拟；emergencyStop()
 * 红线：实验仅影响标记路径；不处置真实故障；不提供限流
 *
 * 落盘：{dataDir}/chaos/chaosState.json
 *
 * 导出 API：init / reset / getState / isReady / startExperiment / emergencyStop / getActiveFaults
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { getMachineCapacity } from '../../../l0/infra/cfg/ready.js'

export function machineFloorConcurrency(): number {
  return getMachineCapacity().floorConcurrency
}

export function machineMaxConcurrency(): number {
  return getMachineCapacity().maxConcurrency
}

export type ChaosFaultKind = 'latencyMs' | 'killSwitchArm' | 'diskPressure'

export interface ChaosFault {
  id: string
  kind: ChaosFaultKind
  /** 仅匹配带此标记的路径（实验作用域） */
  pathMark: string
  /** latencyMs：延迟毫秒；diskPressure：模拟占用百分比 0–100；killSwitchArm：1=武装 */
  value: number
  startedAt: string
  active: boolean
}

export interface ChaosState {
  ready: boolean
  dataDir: string | null
  emergencyStopped: boolean
  activeCount: number
  faults: ChaosFault[]
}

interface PersistedChaosState {
  emergencyStopped: boolean
  faults: ChaosFault[]
}

const chaosState: ChaosState = {
  ready: false,
  dataDir: null,
  emergencyStopped: false,
  activeCount: 0,
  faults: [],
}

const faults = new Map<string, ChaosFault>()

function statePath(): string {
  return path.join(chaosState.dataDir || '.', 'chaos', 'chaosState.json')
}

function ensureDir(): void {
  if (!chaosState.dataDir) return
  const dir = path.join(chaosState.dataDir, 'chaos')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function syncStateMirror(): void {
  chaosState.faults = Array.from(faults.values()).map((f) => ({ ...f }))
  chaosState.activeCount = chaosState.faults.filter((f) => f.active).length
}

function persist(): void {
  if (!chaosState.dataDir || !chaosState.ready) return
  ensureDir()
  const body: PersistedChaosState = {
    emergencyStopped: chaosState.emergencyStopped,
    faults: Array.from(faults.values()).map((f) => ({ ...f })),
  }
  fs.writeFileSync(statePath(), JSON.stringify(body, null, 2), 'utf-8')
}

function loadFromDisk(): void {
  const p = statePath()
  if (!fs.existsSync(p)) return
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<PersistedChaosState>
    chaosState.emergencyStopped = Boolean(raw.emergencyStopped)
    faults.clear()
    if (Array.isArray(raw.faults)) {
      for (const f of raw.faults) {
        if (!f?.id || !f?.kind || !f?.pathMark) continue
        faults.set(f.id, {
          id: f.id,
          kind: f.kind,
          pathMark: f.pathMark,
          value: Number(f.value) || 0,
          startedAt: f.startedAt || new Date().toISOString(),
          active: chaosState.emergencyStopped ? false : Boolean(f.active),
        })
      }
    }
  } catch {
    /* 损坏文件忽略 */
  }
  syncStateMirror()
}

function clampValue(kind: ChaosFaultKind, value: number): number {
  if (!Number.isFinite(value)) return 0
  if (kind === 'latencyMs') return Math.max(0, Math.min(60_000, Math.round(value)))
  if (kind === 'diskPressure') return Math.max(0, Math.min(100, Math.round(value)))
  if (kind === 'killSwitchArm') return value ? 1 : 0
  return 0
}

/**
 * 启动一项混沌实验（仅标记路径生效；不处置真实故障；不限流）。
 */
export function startExperiment(input: {
  kind: ChaosFaultKind
  pathMark: string
  value: number
  id?: string
}): ChaosFault {
  if (!chaosState.ready) throw new Error('chaos service not ready')
  if (chaosState.emergencyStopped) {
    throw new Error('chaos service emergencyStopped; clear via reset/init before new experiments')
  }
  const kind = input.kind
  if (kind !== 'latencyMs' && kind !== 'killSwitchArm' && kind !== 'diskPressure') {
    throw new Error(`unsupported fault kind: ${String(kind)}`)
  }
  const pathMark = String(input.pathMark || '').trim()
  if (!pathMark) throw new Error('pathMark required (experiments only affect marked paths)')
  const id =
    String(input.id || '').trim() ||
    `CX-${kind}-${Date.now().toString(36)}`
  const fault: ChaosFault = {
    id,
    kind,
    pathMark,
    value: clampValue(kind, input.value),
    startedAt: new Date().toISOString(),
    active: true,
  }
  faults.set(id, fault)
  syncStateMirror()
  persist()
  return { ...fault }
}

/**
 * 紧急停止：停用全部实验并落盘。不修复真实故障。
 */
export function emergencyStop(): ChaosState {
  if (!chaosState.ready) throw new Error('chaos service not ready')
  chaosState.emergencyStopped = true
  for (const f of Array.from(faults.values())) {
    f.active = false
  }
  syncStateMirror()
  persist()
  return getChaosState()
}

/** 当前仍 active 的故障注入（emergencyStop 后为空） */
export function getActiveFaults(pathMark?: string): ChaosFault[] {
  if (!chaosState.ready || chaosState.emergencyStopped) return []
  const mark = pathMark != null ? String(pathMark).trim() : ''
  const list = Array.from(faults.values()).filter((f) => f.active)
  if (!mark) return list.map((f) => ({ ...f }))
  return list.filter((f) => f.pathMark === mark).map((f) => ({ ...f }))
}

export function getChaosState(): ChaosState {
  syncStateMirror()
  return {
    ready: chaosState.ready,
    dataDir: chaosState.dataDir,
    emergencyStopped: chaosState.emergencyStopped,
    activeCount: chaosState.activeCount,
    faults: chaosState.faults.map((f) => ({ ...f })),
  }
}

export function isChaosReady(): boolean {
  return chaosState.ready
}

export function initChaos(opts: { dataDir: string }): ChaosState {
  chaosState.dataDir = opts.dataDir
  chaosState.emergencyStopped = false
  faults.clear()
  ensureDir()
  loadFromDisk()
  chaosState.ready = true
  syncStateMirror()
  return getChaosState()
}

export function resetChaos(): void {
  faults.clear()
  chaosState.ready = false
  chaosState.dataDir = null
  chaosState.emergencyStopped = false
  chaosState.activeCount = 0
  chaosState.faults = []
}

/** bootstrap / ready 探针兼容别名 */

/**
 * CYP-memo · ⑧ 全局弹性决策服务（嵌入式完整能力）
 * 只决策不拉 K8s；进程内执行：并发目标 + 限流系数（可逆）。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { publishDomainEvent, subscribeDomainEvent } from '../../col/evt/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export type ElasticityAction = 'hold' | 'raise' | 'lower' | 'quota_tighten' | 'revert' | 'promote'

export interface ElasticityDecision {
  at: string
  action: ElasticityAction
  targetConcurrency: number
  rateLimitFactor: number
  reason: string
  input: Record<string, unknown>
  reversible: boolean
}

/** 嵌入式执行面（进程内等价 HPA） */
export interface ElasticityApplied {
  concurrency: number
  baselineConcurrency: number
  rateLimitFactor: number
  lastAppliedAt: string | null
  lastAction: ElasticityAction | null
  reversible: boolean
}

export interface ElasticityState {
  ready: boolean
  lastDecision: ElasticityDecision | null
  decisionCount: number
  applied: ElasticityApplied
}

function alignAppliedToMachine(): void {
  const cap = getMachineCapacity()
  const max = cap.maxConcurrency
  const floor = cap.floorConcurrency
  const prevC = state.applied.concurrency
  const prevB = state.applied.baselineConcurrency
  const factor = typeof state.applied.rateLimitFactor === 'number' ? state.applied.rateLimitFactor : 1
  const wasTight = factor < 0.999 || prevC < prevB
  let c = Number.isFinite(prevC) && prevC >= 1 ? prevC : floor
  let b = Number.isFinite(prevB) && prevB >= 1 ? prevB : floor
  c = Math.min(max, Math.max(1, Math.floor(c)))
  b = Math.min(max, Math.max(floor, Math.floor(b)))
  if (!wasTight && c < floor) c = floor
  if (c > max) c = max
  state.applied.concurrency = c
  state.applied.baselineConcurrency = b
  if (c !== prevC || b !== prevB) saveApplied()
}

const state: ElasticityState = {
  ready: false,
  lastDecision: null,
  decisionCount: 0,
  applied: {
    concurrency: machineFloorConcurrency(),
    baselineConcurrency: machineFloorConcurrency(),
    rateLimitFactor: 1,
    lastAppliedAt: null,
    lastAction: null,
    reversible: false,
  },
}

let dataDirRef: string | null = null
let lastSlaDecideAt = 0
const SLA_DECIDE_COOLDOWN_MS = 15_000
/** 同一原因族 30s 内不重复收紧（滞回） */
const DECIDE_REASON_COOLDOWN_MS = 30_000
/** 单次收紧相对基线最大步长比例 */
const MAX_TIGHTEN_STEP_RATIO = 0.25
const lastDecideByFamily = new Map<string, number>()

function reasonFamily(event?: string, reason?: string): string {
  const e = String(event || reason || '')
  if (e.startsWith('PerfPressure') || e.startsWith('perf_pressure') || e === 'PerfSlaBreached') {
    return 'perf'
  }
  if (e.startsWith('CircuitBreaker') || e.startsWith('circuit_')) return 'circuit'
  if (e.startsWith('RateLimit') || e.startsWith('reject_')) return 'ratelimit'
  if (e.startsWith('ClientVersion') || e.startsWith('client_version')) return 'client_version'
  return e || 'other'
}

function clampTightenTarget(current: number, rawTarget: number, baseline: number): number {
  const maxDrop = Math.max(1, Math.floor(baseline * MAX_TIGHTEN_STEP_RATIO))
  return Math.max(rawTarget, current - maxDrop, 1)
}

function decisionsPath(): string {
  return path.join(dataDirRef || '.', 'elasticity', 'decisions.jsonl')
}

function appliedPath(): string {
  return path.join(dataDirRef || '.', 'elasticity', 'applied.json')
}

function loadApplied(): void {
  try {
    const p = appliedPath()
    if (!fs.existsSync(p)) return
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as ElasticityApplied
    if (raw && typeof raw.concurrency === 'number') {
      state.applied = {
        concurrency: raw.concurrency,
        baselineConcurrency: raw.baselineConcurrency || machineFloorConcurrency(),
        rateLimitFactor: typeof raw.rateLimitFactor === 'number' ? raw.rateLimitFactor : 1,
        lastAppliedAt: raw.lastAppliedAt || null,
        lastAction: raw.lastAction || null,
        reversible: Boolean(raw.reversible),
      }
    }
  } catch {
    /* ignore */
  }
}

function saveApplied(): void {
  if (!dataDirRef) return
  const dir = path.join(dataDirRef, 'elasticity')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(appliedPath(), JSON.stringify(state.applied, null, 2), 'utf-8')
}

function applyDecision(decision: ElasticityDecision): void {
  state.applied = {
    concurrency: decision.targetConcurrency,
    baselineConcurrency: state.applied.baselineConcurrency || machineFloorConcurrency(),
    rateLimitFactor: decision.rateLimitFactor,
    lastAppliedAt: decision.at,
    lastAction: decision.action,
    reversible: decision.reversible && decision.action !== 'hold' && decision.action !== 'revert',
  }
  saveApplied()
  log({
    level: 'info',
    type: 'runtime',
    message: `elasticity_applied ${decision.action} concurrency=${decision.targetConcurrency} factor=${decision.rateLimitFactor}`,
    action: 'elasticity_apply',
    context: { ...decision },
  })
}

export function initElasticity(opts: { dataDir: string }): ElasticityState {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'elasticity')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  loadApplied()
  alignAppliedToMachine()
  state.ready = true
  return getElasticityState()
}

export function resetElasticity(): void {
  state.ready = false
  state.lastDecision = null
  state.decisionCount = 0
  state.applied = {
    concurrency: machineFloorConcurrency(),
    baselineConcurrency: machineFloorConcurrency(),
    rateLimitFactor: 1,
    lastAppliedAt: null,
    lastAction: null,
    reversible: false,
  }
  dataDirRef = null
  lastSlaDecideAt = 0
  userInflight = 0
  opsInflight = 0
  longPollInflight = 0
  lastDecideByFamily.clear()
}

export function isElasticityReady(): boolean {
  return state.ready
}

export function getElasticityState(): ElasticityState {
  return {
    ready: state.ready,
    lastDecision: state.lastDecision ? { ...state.lastDecision } : null,
    decisionCount: state.decisionCount,
    applied: { ...state.applied },
  }
}

export function getLastDecision(): ElasticityDecision | null {
  return state.lastDecision ? { ...state.lastDecision } : null
}

export function getAppliedElasticity(): ElasticityApplied {
  return { ...state.applied }
}

export type IngressLane = 'user' | 'ops'

/** ops 车道最低可观测并发地板（危机时仍保留） */
export const MIN_OPS_CONCURRENCY = 3
/** 长轮询独立信号量上限 */
export const MAX_LONGPOLL_INFLIGHT = 32

let userInflight = 0
let opsInflight = 0
let longPollInflight = 0

/**
 * 弹性并发闸分车道：
 * - user：备忘录/登录/文件等真实操作；弹性收紧时上限不低于基线（不因收紧挤掉业务），
 *         但仍受本机 maxConcurrency 硬顶——满则 429，禁止无限排队拖死进程
 * - ops：观测与状态轮询；瓶颈/危机时保留最低可观测并发地板（禁止打到失明）
 * - longpoll：通知长轮询等；独立信号量，不占 user 业务槽
 */
export function tryAcquireIngressSlot(opts?: {
  pressureLevel?: 'ok' | 'warn' | 'critical'
  control?: 'idle' | 'bottleneck' | 'crisis'
  lane?: IngressLane | 'longpoll'
}): {
  ok: boolean
  limit: number
  enforced: boolean
  shed: boolean
  lane: IngressLane | 'longpoll'
} {
  const lane =
    opts?.lane === 'ops' ? 'ops' : opts?.lane === 'longpoll' ? 'longpoll' : 'user'
  const applied = state.applied
  const baseline = Math.max(1, applied.baselineConcurrency || machineFloorConcurrency())
  const tightened = Math.max(1, applied.concurrency || baseline)
  const control = opts?.control || 'idle'
  if (!state.ready) {
    return { ok: true, limit: baseline, enforced: false, shed: false, lane }
  }

  if (lane === 'longpoll') {
    const limit = MAX_LONGPOLL_INFLIGHT
    if (longPollInflight >= limit) {
      return { ok: false, limit, enforced: true, shed: false, lane }
    }
    longPollInflight += 1
    return { ok: true, limit, enforced: true, shed: false, lane }
  }

  if (lane === 'user') {
    const limit = Math.min(machineMaxConcurrency(), Math.max(baseline, tightened))
    if (userInflight >= limit) {
      return { ok: false, limit, enforced: true, shed: false, lane }
    }
    userInflight += 1
    return { ok: true, limit, enforced: true, shed: false, lane }
  }

  let limit = Math.max(baseline, tightened)
  if (control === 'bottleneck') {
    limit = Math.max(MIN_OPS_CONCURRENCY, Math.floor(tightened * 0.35))
  }
  if (control === 'crisis') {
    limit = MIN_OPS_CONCURRENCY
  }
  if (opsInflight >= limit) {
    return { ok: false, limit, enforced: true, shed: control === 'crisis', lane }
  }
  opsInflight += 1
  return { ok: true, limit, enforced: true, shed: false, lane }
}

export function getIngressInflight(): number {
  return userInflight + opsInflight + longPollInflight
}

export function getUserInflight(): number {
  return userInflight
}

export function releaseIngressSlot(lane: IngressLane | 'longpoll' = 'user'): void {
  if (lane === 'ops') opsInflight = Math.max(0, opsInflight - 1)
  else if (lane === 'longpoll') longPollInflight = Math.max(0, longPollInflight - 1)
  else userInflight = Math.max(0, userInflight - 1)
}

export function decideElasticity(input: {
  qps?: number
  rejectRate?: number
  p95Ms?: number
  errorRate?: number
  event?: string
  appVersion?: string
  currentConcurrency?: number
  budget?: { maxConcurrency: number }
}): ElasticityDecision {
  const current = input.currentConcurrency ?? state.applied.concurrency ?? machineFloorConcurrency()
  const baseline = state.applied.baselineConcurrency || machineFloorConcurrency()
  let action: ElasticityAction = 'hold'
  let target = current
  let rateLimitFactor = state.applied.rateLimitFactor
  let reason = 'steady'
  let reversible = false

  if (input.event === 'ClientVersionRejected') {
    action = 'quota_tighten'
    target = clampTightenTarget(current, Math.floor(current * 0.8), baseline)
    rateLimitFactor = Math.max(0.4, rateLimitFactor * 0.85)
    reason = `client_version_rejected:${input.appVersion || 'unknown'}`
    reversible = true
  } else if (input.event === 'PerfPressureCritical') {
    action = 'quota_tighten'
    target = clampTightenTarget(current, Math.floor(current * 0.5), baseline)
    rateLimitFactor = Math.max(0.35, rateLimitFactor * 0.7)
    reason = `perf_pressure_critical:p95=${input.p95Ms ?? 'n/a'}`
    reversible = true
  } else if (input.event === 'PerfPressureWarn' || input.event === 'PerfSlaBreached') {
    action = 'quota_tighten'
    target = clampTightenTarget(current, Math.floor(current * 0.85), baseline)
    rateLimitFactor = Math.max(0.5, rateLimitFactor * 0.9)
    reason =
      input.event === 'PerfPressureWarn'
        ? `perf_pressure_warn:p95=${input.p95Ms ?? 'n/a'}`
        : `perf_sla_breach:p95=${input.p95Ms ?? 'n/a'}`
    reversible = true
  } else if (input.event === 'PerfPressureCleared') {
    // 逐步回升，禁止一次打满防抖
    action = 'raise'
    target = Math.min(
      state.applied.baselineConcurrency || machineFloorConcurrency(),
      current + 1
    )
    rateLimitFactor = Math.min(1, rateLimitFactor + 0.1)
    if (rateLimitFactor >= 0.995) rateLimitFactor = 1
    reason = 'perf_pressure_cleared'
    reversible = true
  } else if (input.event === 'PerfOptimizeRaise') {
    // 健康后自动提高：在基线之上向上限步进扩容（优化，非仅恢复）
    action = 'raise'
    const maxC = input.budget?.maxConcurrency ?? machineMaxConcurrency()
    target = Math.min(maxC, current + 1)
    rateLimitFactor = 1
    reason = 'auto_optimize_raise'
    reversible = true
  } else if (input.event === 'RateLimitTriggered' || (input.rejectRate ?? 0) > 0.05) {
    // 过载拒流：保持或略收紧，禁止扩容加剧卡死
    action = 'quota_tighten'
    target = clampTightenTarget(current, Math.floor(current * 0.9), baseline)
    rateLimitFactor = Math.max(0.45, rateLimitFactor * 0.95)
    reason = 'reject_pressure_shed'
    reversible = true
  } else if (input.event === 'CircuitBreakerOpened') {
    action = 'quota_tighten'
    target = clampTightenTarget(current, Math.floor(current * 0.7), baseline)
    rateLimitFactor = Math.max(0.4, rateLimitFactor * 0.8)
    reason = 'circuit_open'
    reversible = true
  } else if ((input.qps ?? 0) < 1 && current > machineFloorConcurrency()) {
    action = 'lower'
    target = Math.max(machineFloorConcurrency(), current - 1)
    reason = 'low_qps'
    reversible = true
  }

  // 滞回：同一原因族 30s 内重复收紧 → hold（不叠乘）
  if (action === 'quota_tighten' || action === 'lower') {
    const fam = reasonFamily(input.event, reason)
    const last = lastDecideByFamily.get(fam) || 0
    if (Date.now() - last < DECIDE_REASON_COOLDOWN_MS) {
      action = 'hold'
      target = current
      rateLimitFactor = state.applied.rateLimitFactor
      reason = `${reason}:hysteresis`
      reversible = false
    } else {
      lastDecideByFamily.set(fam, Date.now())
    }
  }

  const capMax = machineMaxConcurrency()
  target = Math.min(capMax, Math.max(1, Math.floor(target)))

  const decision: ElasticityDecision = {
    at: new Date().toISOString(),
    action,
    targetConcurrency: target,
    rateLimitFactor,
    reason,
    input: { ...input },
    reversible,
  }
  recordDecision(decision)
  return decision
}

/** 可逆：回到基线并发与限流系数 */
export function revertElasticity(reason = 'manual_revert'): ElasticityDecision {
  const decision: ElasticityDecision = {
    at: new Date().toISOString(),
    action: 'revert',
    targetConcurrency: state.applied.baselineConcurrency || machineFloorConcurrency(),
    rateLimitFactor: 1,
    reason,
    input: { from: { ...state.applied } },
    reversible: false,
  }
  recordDecision(decision)
  return decision
}

/** 把当前已应用并发记为新基线（优化成果固化） */
export function promoteElasticityBaseline(reason = 'auto_optimize_promote'): ElasticityApplied {
  const prev = state.applied.baselineConcurrency
  state.applied.baselineConcurrency = state.applied.concurrency
  state.applied.reversible = false
  state.applied.lastAction = 'promote'
  state.applied.lastAppliedAt = new Date().toISOString()
  saveApplied()
  log({
    level: 'info',
    type: 'runtime',
    message: `elasticity_promote baseline ${prev}→${state.applied.baselineConcurrency} reason=${reason}`,
    action: 'elasticity_promote',
    context: {
      from: prev,
      to: state.applied.baselineConcurrency,
      reason,
      concurrency: state.applied.concurrency,
    },
  })
  return getAppliedElasticity()
}

function recordDecision(decision: ElasticityDecision): void {
  state.lastDecision = decision
  state.decisionCount += 1
  const p = decisionsPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, `${JSON.stringify(decision)}\n`, 'utf-8')
  const hysteresisHold =
    decision.action === 'hold' && String(decision.reason).endsWith(':hysteresis')
  if (hysteresisHold) return
  applyDecision(decision)
  if (state.ready) {
    publishDomainEvent(
      'ElasticityDecisionMade',
      8,
      {
        action: decision.action,
        targetConcurrency: decision.targetConcurrency,
        rateLimitFactor: decision.rateLimitFactor,
        reason: decision.reason,
        reversible: decision.reversible,
      },
      'info'
    )
  }
}

export function wireElasticitySubscriptions(): void {
  subscribeDomainEvent('ClientVersionRejected', async (ev) => {
    decideElasticity({
      event: 'ClientVersionRejected',
      appVersion: String(ev.payload.appVersion || ''),
      currentConcurrency: state.applied.concurrency,
    })
  })
  subscribeDomainEvent('RateLimitTriggered', async () => {
    decideElasticity({
      event: 'RateLimitTriggered',
      currentConcurrency: state.applied.concurrency,
    })
  })
  subscribeDomainEvent('CircuitBreakerOpened', async () => {
    decideElasticity({
      event: 'CircuitBreakerOpened',
      currentConcurrency: state.applied.concurrency,
      rejectRate: 0.1,
    })
  })
  subscribeDomainEvent('PerfSlaBreached', async () => {
    // 越阈只观测。收紧只由性能环在业务瓶颈或危机后发起，禁止这里直接降并发。
  })
  subscribeDomainEvent('PerfSlaRecovered', async () => {
    const now = Date.now()
    if (now - lastSlaDecideAt < SLA_DECIDE_COOLDOWN_MS) return
    const reason = state.lastDecision?.reason || ''
    if (reason.startsWith('circuit_') || reason.startsWith('client_version')) return
    const tightened =
      state.applied.rateLimitFactor < 1 ||
      state.applied.concurrency < (state.applied.baselineConcurrency || machineFloorConcurrency())
    if (!tightened) return
    if (!reason.startsWith('perf_sla_breach') && state.applied.lastAction !== 'quota_tighten') return
    lastSlaDecideAt = now
    revertElasticity('auto_sla_recovered')
  })
}

// ============================================================
// 重试与超时工具（原 retry.ts，合并入锚点文件）
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

const retryStatsState: RetryStats = {
  totalOperations: 0,
  totalRetries: 0,
  successOnFirstTry: 0,
  successAfterRetry: 0,
  failedAfterRetry: 0,
}

function retrySleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateDelay(attempt: number, opts: RetryOptions): number {
  const initial = opts.initialDelayMs ?? DEFAULT_OPTIONS.initialDelayMs
  const multiplier = opts.backoffMultiplier ?? DEFAULT_OPTIONS.backoffMultiplier
  const maxDelay = opts.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs

  let delay = initial * Math.pow(multiplier, Math.max(0, attempt - 1))
  delay = Math.min(delay, maxDelay)

  if (opts.jitter !== false) {
    const jitterFactor = 0.75 + Math.random() * 0.5
    delay = delay * jitterFactor
  }

  return Math.floor(delay)
}

function isRetryable(err: unknown, opts: RetryOptions): boolean {
  if (opts.retryNetworkErrors !== false && err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    if (code && opts.retryableErrors?.includes(code)) return true
    if (code && DEFAULT_RETRYABLE_ERRORS.includes(code)) return true
    if (/network|fetch|timeout|abort/i.test(err.message)) return true
  }

  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    const retryableCodes = opts.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES
    if (retryableCodes.includes(status)) return true
  }

  return false
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxRetries = opts.maxRetries ?? DEFAULT_OPTIONS.maxRetries
  const operationName = opts.operationName || 'unknown'
  const startTime = Date.now()

  let lastError: unknown
  let attempt = 0

  retryStatsState.totalOperations++

  while (attempt <= maxRetries) {
    attempt++

    try {
      const timeoutMs = opts.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const result = await fn(attempt)
        clearTimeout(timeoutId)

        const duration = Date.now() - startTime
        if (attempt === 1) {
          retryStatsState.successOnFirstTry++
        } else {
          retryStatsState.successAfterRetry++
          retryStatsState.totalRetries += attempt - 1
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

      if (attempt > maxRetries || !isRetryable(err, opts)) {
        break
      }

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

      await retrySleep(delay)
    }
  }

  const duration = Date.now() - startTime
  retryStatsState.failedAfterRetry++
  retryStatsState.totalRetries += attempt - 1

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

export interface RetryFetchOptions extends RetryOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  /** 自动为写请求添加幂等键（使用 operationName + timestamp 生成） */
  autoIdempotencyKey?: boolean
}

export async function retryFetch(
  url: string,
  options: RetryFetchOptions = {}
): Promise<RetryResult<Response>> {
  const { method, headers, body, autoIdempotencyKey, ...retryOpts } = options

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

export function generateIdempotencyKey(scope: string, identifier?: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  const idPart = identifier ? `${identifier}-` : ''
  return `${scope}-${idPart}${ts}-${rand}`
}

export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  const trimmed = key.trim()
  if (trimmed.length < 8 || trimmed.length > 256) return false
  return /^[a-zA-Z0-9_-]+$/.test(trimmed)
}

export function getRetryStats(): RetryStats {
  return { ...retryStatsState }
}

export function resetRetryStats(): void {
  retryStatsState.totalOperations = 0
  retryStatsState.totalRetries = 0
  retryStatsState.successOnFirstTry = 0
  retryStatsState.successAfterRetry = 0
  retryStatsState.failedAfterRetry = 0
}

/** 实现锚点 · RB-L1-HOST-RESIL-01 · 混沌演练与弹性限流同文件，不借用性能运行管控布尔 */
export function ready_rb_l1_host_resil_01(): boolean {
  return Boolean(isChaosReady() && isElasticityReady())
}

export {
  egressFetch,
  resetCircuit,
  forceOpen,
  forceClose,
  getCircuitState,
  getCircuitDetail,
  listCircuitSnapshot,
  listCircuitSnapshotDetail,
  resetAllCircuits,
  EGRESS_COOLDOWN_MS,
  EGRESS_COOLDOWN_BASE_MS,
  EGRESS_COOLDOWN_MAX_MS,
  EGRESS_HALF_SUCCESS_NEEDED,
} from './egress.js'
export type { CircuitState, CircuitSnapshot } from './egress.js'

