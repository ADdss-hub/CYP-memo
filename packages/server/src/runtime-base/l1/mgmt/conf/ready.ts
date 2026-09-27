/**
 * 配置管控完整形态：版本、审计、回滚、热变更。
 * 热变更面：logLevel / infoSamplePercent / retentionDays / riskThresholds / perfSla。
 * 进程绑定不可热改：port / dataDir / appEnv / nodeEnv。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { applyRuntimeLogLevel, getConfig, type LogLevel } from '../../../l0/infra/cfg/ready.js'
import { logger } from '../../../l0/infra/log/ready.js'
import {
  getLogInfoSamplePercent,
  getLogRetentionDays,
  setLogInfoSamplePercent,
  setLogRetentionDays,
  type LogType,
} from '../../../l0/infra/log/ready.js'
import {
  DEFAULT_RISK_THRESHOLDS,
  getRiskThresholds,
  setRiskThresholds,
  type RiskThresholds,
} from '../../host/rule/ready.js'
import {
  clampPerfSla,
  getDefaultPerfSla,
  getPerfState,
  setPerfSla,
  type PerfSlaConfig,
} from '../perf/ready.js'

export type ConfigRevisionAction = 'bootstrap' | 'hot' | 'rollback'

export interface HotConfigSnapshot {
  logLevel: LogLevel
  infoSamplePercent: number
  retentionDays: Partial<Record<LogType, number>>
  riskThresholds: RiskThresholds
  perfSla: PerfSlaConfig
}

export interface ConfigRevision extends HotConfigSnapshot {
  version: number
  action: ConfigRevisionAction
  actor: string
  at: string
  fromVersion?: number
}

export interface HotConfigPatch {
  logLevel?: string
  infoSamplePercent?: number
  retentionDays?: Partial<Record<LogType, number>>
  riskThresholds?: Partial<RiskThresholds>
  perfSla?: Partial<PerfSlaConfig>
}

interface RevisionStore {
  current: number
  revisions: ConfigRevision[]
}

const MAX_REVISIONS = 50
const HOT_KEYS = [
  'logLevel',
  'infoSamplePercent',
  'retentionDays',
  'riskThresholds',
  'perfSla',
] as const

let store: RevisionStore | null = null
let filePath = ''
let ready = false

function snapshotRuntime(): HotConfigSnapshot {
  return {
    logLevel: getConfig().logLevel,
    infoSamplePercent: getLogInfoSamplePercent(),
    retentionDays: getLogRetentionDays(),
    riskThresholds: getRiskThresholds(),
    perfSla: clampPerfSla(getPerfState().sla || getDefaultPerfSla()),
  }
}

function applySnapshot(snap: HotConfigSnapshot): void {
  const next = applyRuntimeLogLevel(snap.logLevel)
  logger.setLevel(next)
  setLogInfoSamplePercent(snap.infoSamplePercent)
  if (snap.retentionDays && Object.keys(snap.retentionDays).length > 0) {
    setLogRetentionDays(snap.retentionDays)
  }
  setRiskThresholds(snap.riskThresholds || DEFAULT_RISK_THRESHOLDS)
  setPerfSla(snap.perfSla || getDefaultPerfSla(), { persist: true, actor: 'config_snapshot' })
}

function emptyStore(): RevisionStore {
  const snap = snapshotRuntime()
  return {
    current: 1,
    revisions: [
      {
        version: 1,
        ...snap,
        action: 'bootstrap',
        actor: 'bootstrap',
        at: new Date().toISOString(),
      },
    ],
  }
}

function persist(): void {
  if (!store || !filePath) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function normalizeRevision(raw: Partial<ConfigRevision> & { logLevel?: string }): ConfigRevision {
  const level = (raw.logLevel || 'info') as LogLevel
  const sample = Number(raw.infoSamplePercent)
  const thr = { ...DEFAULT_RISK_THRESHOLDS, ...(raw.riskThresholds || {}) }
  const perfSla = clampPerfSla(raw.perfSla || getDefaultPerfSla())
  return {
    version: Number(raw.version) || 1,
    logLevel: level,
    infoSamplePercent: Number.isFinite(sample) && sample >= 1 && sample <= 100 ? sample : 100,
    retentionDays: (raw.retentionDays || {}) as Partial<Record<LogType, number>>,
    riskThresholds: setRiskThresholds(thr),
    perfSla,
    action: (raw.action || 'bootstrap') as ConfigRevisionAction,
    actor: String(raw.actor || 'unknown'),
    at: String(raw.at || new Date().toISOString()),
    fromVersion: raw.fromVersion,
  }
}

function loadOrSeed(dataDir: string): RevisionStore {
  filePath = path.join(dataDir, 'config', 'revisions.json')
  if (!fs.existsSync(filePath)) {
    const seeded = emptyStore()
    store = seeded
    persist()
    return seeded
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RevisionStore
  if (!raw || !Array.isArray(raw.revisions) || raw.revisions.length === 0) {
    const seeded = emptyStore()
    store = seeded
    persist()
    return seeded
  }
  raw.revisions = raw.revisions.map((r) => normalizeRevision(r))
  store = raw
  const head =
    raw.revisions.find((r) => r.version === raw.current) || raw.revisions[raw.revisions.length - 1]
  if (head) applySnapshot(head)
  return raw
}

/** Phase0：落盘版本台账，并把已提交热变更覆盖到本次进程。 */
export function initConfigRevision(dataDir: string): {
  version: number
  logLevel: LogLevel
  infoSamplePercent: number
} {
  // 先绑定默认风险阈值与高标准 SLA，再加载台账覆盖
  setRiskThresholds(DEFAULT_RISK_THRESHOLDS)
  setPerfSla(getDefaultPerfSla(), { persist: false, actor: 'bootstrap_seed' })
  const loaded = loadOrSeed(dataDir)
  const head =
    loaded.revisions.find((r) => r.version === loaded.current) ||
    loaded.revisions[loaded.revisions.length - 1]
  ready = true
  return {
    version: loaded.current,
    logLevel: head.logLevel,
    infoSamplePercent: head.infoSamplePercent,
  }
}

export function isConfigRevisionReady(): boolean {
  return ready && store !== null && (store?.revisions.length || 0) > 0
}

export function getConfigRevisionView(): {
  current: number
  hotKeys: string[]
  immutable: string[]
  snapshot: HotConfigSnapshot
  revisions: ConfigRevision[]
} {
  if (!store) {
    initConfigRevision(getConfig().dataDir)
  }
  const snap = store || emptyStore()
  return {
    current: snap.current,
    hotKeys: [...HOT_KEYS],
    immutable: ['port', 'dataDir', 'appEnv', 'nodeEnv'],
    snapshot: snapshotRuntime(),
    revisions: snap.revisions.slice(),
  }
}

function pushRevision(entry: ConfigRevision): void {
  if (!store) throw new Error('配置版本服务未初始化')
  store.revisions.push(entry)
  if (store.revisions.length > MAX_REVISIONS) {
    store.revisions.splice(0, store.revisions.length - MAX_REVISIONS)
  }
  store.current = entry.version
  persist()
}

export function applyHotConfig(patch: HotConfigPatch | string, actor: string): ConfigRevision {
  if (!store) initConfigRevision(getConfig().dataDir)
  const body: HotConfigPatch = typeof patch === 'string' ? { logLevel: patch } : patch || {}
  if (
    body.logLevel === undefined &&
    body.infoSamplePercent === undefined &&
    (body.retentionDays === undefined || Object.keys(body.retentionDays).length === 0) &&
    (body.riskThresholds === undefined || Object.keys(body.riskThresholds).length === 0) &&
    (body.perfSla === undefined || Object.keys(body.perfSla).length === 0)
  ) {
    throw new Error(
      '热变更须至少包含 logLevel / infoSamplePercent / retentionDays / riskThresholds / perfSla 之一'
    )
  }

  const nextLevel =
    body.logLevel !== undefined ? applyRuntimeLogLevel(body.logLevel) : getConfig().logLevel
  logger.setLevel(nextLevel)

  const nextSample =
    body.infoSamplePercent !== undefined
      ? setLogInfoSamplePercent(body.infoSamplePercent)
      : getLogInfoSamplePercent()

  if (body.retentionDays && Object.keys(body.retentionDays).length > 0) {
    setLogRetentionDays(body.retentionDays)
  }

  if (body.riskThresholds && Object.keys(body.riskThresholds).length > 0) {
    setRiskThresholds({ ...getRiskThresholds(), ...body.riskThresholds })
  }

  let nextPerf = clampPerfSla(getPerfState().sla || getDefaultPerfSla())
  if (body.perfSla && Object.keys(body.perfSla).length > 0) {
    nextPerf = setPerfSla(body.perfSla, { persist: true, actor: actor || 'config_hot' })
  }

  const version = (store?.current || 0) + 1
  const entry: ConfigRevision = {
    version,
    logLevel: nextLevel,
    infoSamplePercent: nextSample,
    retentionDays: getLogRetentionDays(),
    riskThresholds: getRiskThresholds(),
    perfSla: nextPerf,
    action: 'hot',
    actor: actor || 'unknown',
    at: new Date().toISOString(),
  }
  pushRevision(entry)
  logger.info('config.hot', {
    version,
    logLevel: nextLevel,
    infoSamplePercent: nextSample,
    riskThresholds: entry.riskThresholds,
    perfSla: entry.perfSla,
    actor: entry.actor,
  })
  return entry
}

export function rollbackConfig(toVersion: number, actor: string): ConfigRevision {
  if (!store) initConfigRevision(getConfig().dataDir)
  const target = store?.revisions.find((r) => r.version === toVersion)
  if (!target) {
    throw new Error(`配置版本不存在: ${toVersion}`)
  }
  applySnapshot(target)
  const version = (store?.current || 0) + 1
  const entry: ConfigRevision = {
    version,
    logLevel: getConfig().logLevel,
    infoSamplePercent: getLogInfoSamplePercent(),
    retentionDays: getLogRetentionDays(),
    riskThresholds: getRiskThresholds(),
    perfSla: clampPerfSla(getPerfState().sla || getDefaultPerfSla()),
    action: 'rollback',
    actor: actor || 'unknown',
    at: new Date().toISOString(),
    fromVersion: toVersion,
  }
  pushRevision(entry)
  logger.info('config.rollback', {
    version,
    fromVersion: toVersion,
    logLevel: entry.logLevel,
    infoSamplePercent: entry.infoSamplePercent,
    riskThresholds: entry.riskThresholds,
    perfSla: entry.perfSla,
    actor: entry.actor,
  })
  return entry
}

export function resetConfigRevision(): void {
  store = null
  filePath = ''
  ready = false
}

export function ready_rb_l1_mgmt_conf_01(): boolean {
  try {
    getConfig()
  } catch {
    return false
  }
  return isConfigRevisionReady()
}
