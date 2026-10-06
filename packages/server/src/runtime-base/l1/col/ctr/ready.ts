/**
 * CYP-memo API 契约文档服务（嵌入式）
 * 专属：登记契约；版本兼容结论；不兼容变更须有审批记录后才能落地
 * 红线：不执行调用；不存业务字典；不分发密钥（KMS）；不替代配置管控
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 导出 API：init / reset / getState / isReady / registerContract / listContracts / detectBreakingChanges
 */

import fs from 'fs'
import path from 'path'

export interface ApiContractEntry {
  id: string
  /** OpenAPI 片段或说明（文档位，不执行） */
  openApiFragment?: string
  /** 路径清单，如 GET /api/memos */
  paths: string[]
  contractVersion: string
  registeredAt: string
  updatedAt: string
}

export interface BreakingChangeReport {
  removedPaths: string[]
  addedPaths: string[]
  breaking: boolean
}

export interface ApiContractState {
  ready: boolean
  dataDir: string | null
  registryPath: string | null
  contractCount: number
}

interface PersistedRegistry {
  version: 1 | 2 | 3
  contracts: ApiContractEntry[]
  approvals?: ChangeApproval[]
  conclusions?: CompatibilityConclusion[]
  consumers?: ConsumerContract[]
}

export interface ConsumerContract {
  consumerId: string
  providerContractId: string
  expectedPaths: string[]
  registeredAt: string
}

export interface CdcFailure {
  consumerId: string
  missingPaths: string[]
}

export interface CompatibilityConclusion {
  contractId: string
  compatible: boolean
  breaking: boolean
  removedPaths: string[]
  addedPaths: string[]
  decidedAt: string
}

export interface ChangeApproval {
  id: string
  contractId: string
  fromVersion: string
  toVersion: string
  approvedBy: string
  reason: string
  at: string
  used: boolean
}

const state: ApiContractState = {
  ready: false,
  dataDir: null,
  registryPath: null,
  contractCount: 0,
}

let contracts: ApiContractEntry[] = []
let approvals: ChangeApproval[] = []
let conclusions: CompatibilityConclusion[] = []
let consumers: ConsumerContract[] = []

function registryFile(dataDir: string): string {
  return path.join(dataDir, 'contracts', 'registry.json')
}

function ensureRegistryDir(): void {
  if (!state.dataDir) return
  const dir = path.join(state.dataDir, 'contracts')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function persist(): void {
  if (!state.ready || !state.dataDir || !state.registryPath) return
  ensureRegistryDir()
  const body: PersistedRegistry = {
    version: 3,
    contracts: contracts.map((c) => ({
      ...c,
      paths: [...c.paths],
    })),
    approvals: approvals.map((a) => ({ ...a })),
    conclusions: conclusions.map((c) => ({ ...c, removedPaths: [...c.removedPaths], addedPaths: [...c.addedPaths] })),
    consumers: consumers.map((c) => ({ ...c, expectedPaths: [...c.expectedPaths] })),
  }
  fs.writeFileSync(state.registryPath, JSON.stringify(body, null, 2), 'utf-8')
  state.contractCount = contracts.length
}

function loadFromDisk(): void {
  if (!state.registryPath || !fs.existsSync(state.registryPath)) {
    contracts = []
    state.contractCount = 0
    approvals = []
    conclusions = []
    consumers = []
    return
  }
  try {
    const raw = JSON.parse(fs.readFileSync(state.registryPath, 'utf-8')) as Partial<PersistedRegistry>
    contracts = Array.isArray(raw.contracts)
      ? raw.contracts.map((c) => ({
          id: String(c.id),
          openApiFragment: c.openApiFragment != null ? String(c.openApiFragment) : undefined,
          paths: Array.isArray(c.paths) ? c.paths.map((p) => String(p)) : [],
          contractVersion: String(c.contractVersion || '1.0.0'),
          registeredAt: String(c.registeredAt || new Date().toISOString()),
          updatedAt: String(c.updatedAt || c.registeredAt || new Date().toISOString()),
        }))
      : []
    state.contractCount = contracts.length
    approvals = Array.isArray(raw.approvals)
      ? raw.approvals.map((a) => ({
          id: String(a.id),
          contractId: String(a.contractId),
          fromVersion: String(a.fromVersion),
          toVersion: String(a.toVersion),
          approvedBy: String(a.approvedBy),
          reason: String(a.reason || ''),
          at: String(a.at || new Date().toISOString()),
          used: Boolean(a.used),
        }))
      : []
    conclusions = Array.isArray(raw.conclusions)
      ? raw.conclusions.map((c) => ({
          contractId: String(c.contractId),
          compatible: Boolean(c.compatible),
          breaking: Boolean(c.breaking),
          removedPaths: Array.isArray(c.removedPaths) ? c.removedPaths.map(String) : [],
          addedPaths: Array.isArray(c.addedPaths) ? c.addedPaths.map(String) : [],
          decidedAt: String(c.decidedAt || new Date().toISOString()),
        }))
      : []
    consumers = Array.isArray(raw.consumers)
      ? raw.consumers.map((c) => ({
          consumerId: String(c.consumerId),
          providerContractId: String(c.providerContractId || 'cyp-memo-core'),
          expectedPaths: Array.isArray(c.expectedPaths) ? c.expectedPaths.map(String) : [],
          registeredAt: String(c.registeredAt || new Date().toISOString()),
        }))
      : []
  } catch {
    contracts = []
    state.contractCount = 0
    approvals = []
    conclusions = []
    consumers = []
  }
}

function normalizePath(p: string): string {
  return String(p || '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * 登记一条契约（OpenAPI 片段和/或路径清单）。仅文档位，不发起 HTTP。
 */
export function registerContract(input: {
  id: string
  openApiFragment?: string
  paths?: string[]
}): ApiContractEntry {
  if (!state.ready) throw new Error('api-contract not ready')
  const id = String(input.id || '').trim()
  if (!id) throw new Error('registerContract requires id')
  const paths = (input.paths || []).map(normalizePath).filter(Boolean)
  const now = new Date().toISOString()
  const existing = contracts.find((c) => c.id === id)
  if (existing) {
    if (input.openApiFragment != null) existing.openApiFragment = String(input.openApiFragment)
    if (input.paths) existing.paths = paths
    existing.updatedAt = now
    persist()
    return { ...existing, paths: [...existing.paths] }
  }
  const row: ApiContractEntry = {
    id,
    openApiFragment: input.openApiFragment != null ? String(input.openApiFragment) : undefined,
    paths,
    contractVersion: '1.0.0',
    registeredAt: now,
    updatedAt: now,
  }
  contracts.push(row)
  persist()
  return { ...row, paths: [...row.paths] }
}

export function listContracts(): ApiContractEntry[] {
  return contracts.map((c) => ({ ...c, paths: [...c.paths] }))
}

/**
 * 简单破坏性检测：next 相对 prev 删除的路径视为 breaking。
 * （内部即 compareBreaking(prev, next)）
 */
export function detectBreakingChanges(
  prev: { paths: string[] } | string[],
  next: { paths: string[] } | string[]
): BreakingChangeReport {
  const prevPaths = new Set(
    (Array.isArray(prev) ? prev : prev.paths || []).map(normalizePath).filter(Boolean)
  )
  const nextPaths = new Set(
    (Array.isArray(next) ? next : next.paths || []).map(normalizePath).filter(Boolean)
  )
  const removedPaths: string[] = []
  const addedPaths: string[] = []
  for (const p of prevPaths) {
    if (!nextPaths.has(p)) removedPaths.push(p)
  }
  for (const p of nextPaths) {
    if (!prevPaths.has(p)) addedPaths.push(p)
  }
  removedPaths.sort()
  addedPaths.sort()
  return {
    removedPaths,
    addedPaths,
    breaking: removedPaths.length > 0,
  }
}

/** 别名：规格文案中的 compareBreaking */
export const compareBreaking = detectBreakingChanges

export function listCompatibilityConclusions(): CompatibilityConclusion[] {
  return conclusions.map((c) => ({
    ...c,
    removedPaths: [...c.removedPaths],
    addedPaths: [...c.addedPaths],
  }))
}

export function listChangeApprovals(): ChangeApproval[] {
  return approvals.map((a) => ({ ...a }))
}

/** 对照现行契约给出兼容结论；破坏性变更不自动落地。 */
export function concludeCompatibility(input: {
  contractId: string
  nextPaths: string[]
}): CompatibilityConclusion {
  if (!state.ready) throw new Error('api-contract not ready')
  const id = String(input.contractId || '').trim()
  const current = contracts.find((c) => c.id === id)
  const prevPaths = current?.paths || []
  const report = detectBreakingChanges(prevPaths, input.nextPaths || [])
  const row: CompatibilityConclusion = {
    contractId: id,
    compatible: !report.breaking,
    breaking: report.breaking,
    removedPaths: report.removedPaths,
    addedPaths: report.addedPaths,
    decidedAt: new Date().toISOString(),
  }
  conclusions = conclusions.filter((c) => c.contractId !== id)
  conclusions.push(row)
  persist()
  return {
    ...row,
    removedPaths: [...row.removedPaths],
    addedPaths: [...row.addedPaths],
  }
}

export function approveBreakingChange(input: {
  contractId: string
  fromVersion: string
  toVersion: string
  approvedBy: string
  reason: string
}): ChangeApproval {
  if (!state.ready) throw new Error('api-contract not ready')
  const contractId = String(input.contractId || '').trim()
  const fromVersion = String(input.fromVersion || '').trim()
  const toVersion = String(input.toVersion || '').trim()
  const approvedBy = String(input.approvedBy || '').trim()
  const reason = String(input.reason || '').trim()
  if (!contractId || !fromVersion || !toVersion || !approvedBy || !reason) {
    throw new Error('approveBreakingChange requires contractId/fromVersion/toVersion/approvedBy/reason')
  }
  const row: ChangeApproval = {
    id: `apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    contractId,
    fromVersion,
    toVersion,
    approvedBy,
    reason,
    at: new Date().toISOString(),
    used: false,
  }
  approvals.push(row)
  persist()
  return { ...row }
}

/**
 * 提议变更路径。兼容变更可直接落地；破坏性变更必须先有未使用的审批记录。
 */
export function proposeContractChange(input: {
  contractId: string
  nextPaths: string[]
  toVersion: string
}):
  | { ok: true; entry: ApiContractEntry; conclusion: CompatibilityConclusion }
  | { ok: false; reason: 'approval_required' | 'not_found'; conclusion: CompatibilityConclusion } {
  if (!state.ready) throw new Error('api-contract not ready')
  const id = String(input.contractId || '').trim()
  const existing = contracts.find((c) => c.id === id)
  if (!existing) {
    const empty = concludeCompatibility({ contractId: id, nextPaths: input.nextPaths || [] })
    return { ok: false, reason: 'not_found', conclusion: empty }
  }
  const conclusion = concludeCompatibility({ contractId: id, nextPaths: input.nextPaths || [] })
  const toVersion = String(input.toVersion || '').trim() || bumpPatch(existing.contractVersion)
  if (conclusion.breaking) {
    const approval = approvals.find(
      (a) =>
        !a.used &&
        a.contractId === id &&
        a.fromVersion === existing.contractVersion &&
        a.toVersion === toVersion
    )
    if (!approval) {
      return { ok: false, reason: 'approval_required', conclusion }
    }
    approval.used = true
  }
  existing.paths = (input.nextPaths || []).map(normalizePath).filter(Boolean)
  existing.contractVersion = toVersion
  existing.updatedAt = new Date().toISOString()
  persist()
  return {
    ok: true,
    entry: { ...existing, paths: [...existing.paths] },
    conclusion,
  }
}

function bumpPatch(version: string): string {
  const parts = String(version || '1.0.0').split('.').map((n) => Number(n))
  const major = Number.isFinite(parts[0]) ? parts[0] : 1
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0
  return `${major}.${minor}.${patch + 1}`
}

export function registerConsumerExpectation(input: {
  consumerId: string
  providerContractId?: string
  expectedPaths: string[]
}): ConsumerContract {
  if (!state.ready) throw new Error('api-contract not ready')
  const consumerId = String(input.consumerId || '').trim()
  if (!consumerId) throw new Error('registerConsumerExpectation requires consumerId')
  const providerContractId = String(input.providerContractId || 'cyp-memo-core').trim() || 'cyp-memo-core'
  const expectedPaths = (input.expectedPaths || []).map(normalizePath).filter(Boolean)
  const now = new Date().toISOString()
  const existing = consumers.find((c) => c.consumerId === consumerId)
  if (existing) {
    existing.providerContractId = providerContractId
    existing.expectedPaths = expectedPaths
    persist()
    return { ...existing, expectedPaths: [...existing.expectedPaths] }
  }
  const row: ConsumerContract = {
    consumerId,
    providerContractId,
    expectedPaths,
    registeredAt: now,
  }
  consumers.push(row)
  persist()
  return { ...row, expectedPaths: [...row.expectedPaths] }
}

export function listConsumerExpectations(): ConsumerContract[] {
  return consumers.map((c) => ({ ...c, expectedPaths: [...c.expectedPaths] }))
}

/** 消费者驱动：每个消费者声明的路径必须仍在提供方契约中。 */
export function verifyConsumerDrivenContracts(): { ok: boolean; failures: CdcFailure[] } {
  const failures: CdcFailure[] = []
  for (const c of consumers) {
    const provider = contracts.find((p) => p.id === c.providerContractId)
    const have = new Set((provider?.paths || []).map(normalizePath))
    const missingPaths = c.expectedPaths.filter((p) => !have.has(normalizePath(p)))
    if (missingPaths.length) failures.push({ consumerId: c.consumerId, missingPaths })
  }
  return { ok: failures.length === 0, failures }
}

export function runCdcProbe(): {
  consumerSatisfied: boolean
  consumerRejectedOnMissing: boolean
} {
  if (!state.ready) throw new Error('api-contract not ready')
  const providerId = 'cyp-memo-core'
  if (!contracts.find((c) => c.id === providerId)) {
    registerContract({
      id: providerId,
      paths: ['GET /api/health', 'POST /api/auth/login'],
    })
  }
  registerConsumerExpectation({
    consumerId: 'cdc-probe-web',
    providerContractId: providerId,
    expectedPaths: ['GET /api/health'],
  })
  const ok = verifyConsumerDrivenContracts()
  registerConsumerExpectation({
    consumerId: 'cdc-probe-missing',
    providerContractId: providerId,
    expectedPaths: ['GET /api/health', 'GET /api/cdc-missing-path'],
  })
  const missing = verifyConsumerDrivenContracts()
  consumers = consumers.filter((c) => c.consumerId !== 'cdc-probe-missing')
  persist()
  return {
    consumerSatisfied: ok.ok === true,
    consumerRejectedOnMissing: missing.ok === false && missing.failures.some((f) => f.consumerId === 'cdc-probe-missing'),
  }
}

export function isContractGovernanceReady(): boolean {
  return state.ready && contracts.length > 0 && conclusions.length > 0
}

/** B9.1 探针：兼容结论 + 无审批拒绝 + 有审批落地 */
export function runContractGovernanceProbe(): {
  conclusionRecorded: boolean
  breakingBlocked: boolean
  approvedApplied: boolean
} {
  if (!state.ready) throw new Error('api-contract not ready')
  const id = 'b91-contract-probe'
  const existing = contracts.find((c) => c.id === id)
  if (existing) {
    existing.paths = ['GET /api/health', 'POST /api/memos']
    existing.contractVersion = '1.0.0'
    existing.updatedAt = new Date().toISOString()
    persist()
  } else {
    registerContract({
      id,
      paths: ['GET /api/health', 'POST /api/memos'],
    })
  }
  approvals = approvals.filter((a) => a.contractId !== id)
  conclusions = conclusions.filter((c) => c.contractId !== id)
  const conclusion = concludeCompatibility({
    contractId: id,
    nextPaths: ['GET /api/health'],
  })
  const blocked = proposeContractChange({
    contractId: id,
    nextPaths: ['GET /api/health'],
    toVersion: '1.1.0',
  })
  approveBreakingChange({
    contractId: id,
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    approvedBy: 'b91-probe',
    reason: 'B9.1 契约治理验收：删除路径经审批',
  })
  const applied = proposeContractChange({
    contractId: id,
    nextPaths: ['GET /api/health'],
    toVersion: '1.1.0',
  })
  return {
    conclusionRecorded: conclusion.breaking === true && conclusion.removedPaths.includes('POST /api/memos'),
    breakingBlocked: blocked.ok === false && blocked.reason === 'approval_required',
    approvedApplied: applied.ok === true && applied.entry.contractVersion === '1.1.0',
  }
}

export function getState(): ApiContractState {
  return { ...state, contractCount: contracts.length }
}

export function isReady(): boolean {
  return state.ready
}

export function init(opts: { dataDir: string }): ApiContractState {
  const dataDir = String(opts.dataDir || '').trim()
  if (!dataDir) throw new Error('api-contract init requires dataDir')
  state.dataDir = dataDir
  state.registryPath = registryFile(dataDir)
  ensureRegistryDir()
  loadFromDisk()
  state.ready = true
  if (contracts.length === 0) {
    registerContract({
      id: 'cyp-memo-core',
      paths: [
        'GET /api/health',
        'POST /api/auth/login',
        'POST /api/memos',
        'GET /api/memos',
        'POST /api/public/shares/:id/access',
        'GET /api/public/shares/:id/comments',
        'POST /api/public/shares/:id/comments',
      ],
    })
  }
  if (conclusions.length === 0 && contracts[0]) {
    concludeCompatibility({ contractId: contracts[0].id, nextPaths: contracts[0].paths })
  }
  if (consumers.length === 0) {
    registerConsumerExpectation({
      consumerId: 'web-app',
      providerContractId: 'cyp-memo-core',
      expectedPaths: ['GET /api/health', 'POST /api/auth/login', 'GET /api/memos'],
    })
    registerConsumerExpectation({
      consumerId: 'mcp-sidecar',
      providerContractId: 'cyp-memo-core',
      expectedPaths: ['GET /api/health', 'POST /api/auth/login'],
    })
  }
  if (!fs.existsSync(state.registryPath!)) {
    persist()
  }
  state.contractCount = contracts.length
  return getState()
}

export function reset(): void {
  state.ready = false
  state.dataDir = null
  state.registryPath = null
  state.contractCount = 0
  contracts = []
  approvals = []
  conclusions = []
  consumers = []
}

/** bootstrap / ready 探针兼容别名 */
export const initApiContract = init
export const resetApiContract = reset
export const getApiContractState = getState
export const isApiContractReady = isReady

export function ready_rb_l1_col_ctr_01(): boolean {
  return isContractGovernanceReady()
}
