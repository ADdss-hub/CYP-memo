/**
 * CYP-memo 交付/发布服务（嵌入式 · 制品与灰度）
 * 专属：登记制品版本、activeVersion、canaryWeight、release notes、promote/rollback
 * 红线：不编译不构建；不查业务日志；不直接拉起进程（归⑦）；只写期望态
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { publishDomainEvent } from '../../col/evt/ready.js'

export interface ReleaseArtifact {
  version: string
  notes: string
  registeredAt: string
}

export interface ReleaseState {
  ready: boolean
  dataDir: string | null
  activeVersion: string | null
  previousVersion: string | null
  canaryWeight: number
  artifacts: ReleaseArtifact[]
  phase: 'canary' | 'rolling' | 'full' | 'idle'
  planId: string | null
}

interface PersistedReleaseState {
  activeVersion: string | null
  previousVersion: string | null
  canaryWeight: number
  artifacts: ReleaseArtifact[]
  phase?: ReleaseState['phase']
  planId?: string | null
}

const state: ReleaseState = {
  ready: false,
  dataDir: null,
  activeVersion: null,
  previousVersion: null,
  canaryWeight: 0,
  artifacts: [],
  phase: 'idle',
  planId: null,
}

function statePath(): string {
  return path.join(state.dataDir || '.', 'release', 'state.json')
}

function ensureDir(): void {
  if (!state.dataDir) return
  const dir = path.join(state.dataDir, 'release')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function persist(): void {
  if (!state.dataDir || !state.ready) return
  ensureDir()
  const body: PersistedReleaseState = {
    activeVersion: state.activeVersion,
    previousVersion: state.previousVersion,
    canaryWeight: state.canaryWeight,
    artifacts: state.artifacts,
    phase: state.phase,
    planId: state.planId,
  }
  fs.writeFileSync(statePath(), JSON.stringify(body, null, 2), 'utf-8')
}

function loadFromDisk(): void {
  const p = statePath()
  if (!fs.existsSync(p)) return
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<PersistedReleaseState>
    state.activeVersion = raw.activeVersion ?? null
    state.previousVersion = raw.previousVersion ?? null
    state.canaryWeight = clampWeight(raw.canaryWeight ?? 0)
    state.artifacts = Array.isArray(raw.artifacts) ? raw.artifacts.map(a => ({ ...a })) : []
    state.phase = raw.phase ?? 'idle'
    state.planId = raw.planId ?? null
  } catch {
    /* ignore */
  }
}

function emitDesired(): void {
  publishDomainEvent('ReleaseDesiredStateChanged', 6, {
    desiredArtifact: state.activeVersion,
    activeVersion: state.activeVersion,
    previousVersion: state.previousVersion,
    canaryWeight: state.canaryWeight,
    phase: state.phase,
    configVersion: state.activeVersion,
  })
}

function emitCacheBump(fromPrefix: string, toPrefix: string): void {
  publishDomainEvent('CacheNamespaceBumped', 6, {
    fromPrefix,
    toPrefix,
    oldPrefix: fromPrefix,
    newPrefix: toPrefix,
    artifactVersion: state.activeVersion,
  })
}

export function registerArtifact(version: string, notes = ''): ReleaseArtifact {
  if (!state.ready) throw new Error('release not ready')
  const ver = String(version).trim()
  if (!ver) throw new Error('version required')
  const existing = state.artifacts.find(a => a.version === ver)
  if (existing) {
    existing.notes = String(notes ?? existing.notes)
    persist()
    return { ...existing }
  }
  const row: ReleaseArtifact = {
    version: ver,
    notes: String(notes ?? ''),
    registeredAt: new Date().toISOString(),
  }
  state.artifacts.push(row)
  persist()
  return { ...row }
}

export function setCanaryWeight(weight: number): number {
  if (!state.ready) throw new Error('release not ready')
  state.canaryWeight = clampWeight(weight)
  state.phase = state.canaryWeight > 0 && state.canaryWeight < 100 ? 'canary' : state.phase
  state.planId = state.planId || `plan-${Date.now().toString(36)}`
  persist()
  publishDomainEvent('CanaryWeightChanged', 6, {
    weight: state.canaryWeight,
    phase: state.phase,
    planId: state.planId,
  })
  publishDomainEvent('ReleaseCanaryWeightChanged', 6, {
    canaryWeight: state.canaryWeight,
    planStepId: state.planId,
    observeUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  emitDesired()
  return state.canaryWeight
}

export function promote(version: string): ReleaseState {
  if (!state.ready) throw new Error('release not ready')
  const ver = String(version).trim()
  const art = state.artifacts.find(a => a.version === ver)
  if (!art) throw new Error(`artifact not registered: ${ver}`)
  const fromPrefix = state.activeVersion ? `v${state.activeVersion}:` : 'v0:'
  if (state.activeVersion && state.activeVersion !== ver) {
    state.previousVersion = state.activeVersion
  }
  state.activeVersion = ver
  state.canaryWeight = 0
  state.phase = 'full'
  persist()
  const toPrefix = `v${ver}:`
  emitCacheBump(fromPrefix, toPrefix)
  publishDomainEvent('VersionDeployed', 6, {
    artifactVersion: ver,
    nodes: 1,
  })
  publishDomainEvent('ReleasePromoted', 6, {
    version: ver,
    manifestId: `m-${ver}`,
    fullAt: new Date().toISOString(),
  })
  emitDesired()
  return getReleaseState()
}

export function rollback(): ReleaseState {
  if (!state.ready) throw new Error('release not ready')
  if (!state.previousVersion) {
    throw new Error('no previousVersion to rollback')
  }
  const target = state.previousVersion
  if (!state.artifacts.some(a => a.version === target)) {
    throw new Error(`previous artifact missing: ${target}`)
  }
  const fromPrefix = state.activeVersion ? `v${state.activeVersion}:` : 'v0:'
  const current = state.activeVersion
  state.activeVersion = target
  state.previousVersion = current
  state.canaryWeight = 0
  state.phase = 'full'
  persist()
  emitCacheBump(fromPrefix, `v${target}:`)
  publishDomainEvent('ReleaseRolledBack', 6, {
    fromVersion: current,
    toVersion: target,
    toArtifact: target,
    reason: 'rollback',
  })
  emitDesired()
  return getReleaseState()
}

export function getReleaseState(): ReleaseState {
  return {
    ...state,
    artifacts: state.artifacts.map(a => ({ ...a })),
  }
}

export function isReleaseReady(): boolean {
  return state.ready
}

export function initRelease(opts: { dataDir: string }): ReleaseState {
  state.dataDir = opts.dataDir
  state.activeVersion = null
  state.previousVersion = null
  state.canaryWeight = 0
  state.artifacts = []
  state.phase = 'idle'
  state.planId = null
  ensureDir()
  loadFromDisk()
  state.ready = true
  return getReleaseState()
}

export function resetRelease(): void {
  state.ready = false
  state.dataDir = null
  state.activeVersion = null
  state.previousVersion = null
  state.canaryWeight = 0
  state.artifacts = []
  state.phase = 'idle'
  state.planId = null
}

export function ready_rb_l1_host_rel_01(): boolean {
  return isReleaseReady()
}
