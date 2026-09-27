/**
 * 数据协作服务（协作能力子平台 · B9.2）
 * 专属：数据合约、交换、订阅、数据权限、血缘。
 * 红线：不替代数据处理核算的清洗/对账；权限回链 RBAC权限矩阵。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../../../l0/infra/db/ready.js'
import { MEMBER_ASSIGNABLE_PERMISSIONS, type User } from '../../../../types.js'
import { getRequestTraceId } from '../../mgmt/trace/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export interface LineageEdge {
  id: string
  at: string
  source: string
  table: string
  op: string
  key: string
  sink: string
  trace_id: string
  tenantRootId?: string | null
  digitalId?: string | null
  bytesApprox?: number
}

let lineageDataDir: string | null = null
const recentLineage: LineageEdge[] = []
const MAX_RECENT_LINEAGE = 500

function lineagePath(): string | null {
  if (!lineageDataDir) return null
  return path.join(lineageDataDir, 'pipeline', 'lineage.jsonl')
}

export function initLineage(opts: { dataDir: string }): void {
  lineageDataDir = opts.dataDir
  const dir = path.join(opts.dataDir, 'pipeline')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function recordLineageEdge(input: Omit<LineageEdge, 'id' | 'at'> & { id?: string; at?: string }): LineageEdge {
  const edge: LineageEdge = {
    id: input.id || `lin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: input.at || new Date().toISOString(),
    source: input.source,
    table: input.table,
    op: input.op,
    key: input.key,
    sink: input.sink,
    trace_id: input.trace_id || 'unknown',
    tenantRootId: input.tenantRootId ?? null,
    digitalId: input.digitalId ?? null,
    bytesApprox: input.bytesApprox,
  }
  recentLineage.push(edge)
  while (recentLineage.length > MAX_RECENT_LINEAGE) recentLineage.shift()
  const p = lineagePath()
  if (p) {
    fs.appendFileSync(p, `${JSON.stringify(edge)}\n`, 'utf-8')
  }
  return edge
}

/** 按 key 或 trace_id 查上游 */
export function findLineageUpstream(query: {
  key?: string
  trace_id?: string
  limit?: number
}): LineageEdge[] {
  const lim = Math.min(Math.max(query.limit || 20, 1), 100)
  const out: LineageEdge[] = []
  for (let i = recentLineage.length - 1; i >= 0 && out.length < lim; i--) {
    const e = recentLineage[i]
    if (query.key && e.key !== query.key) continue
    if (query.trace_id && e.trace_id !== query.trace_id) continue
    if (!query.key && !query.trace_id) {
      out.push(e)
      continue
    }
    out.push(e)
  }
  return out
}

export function getRecentLineage(limit = 50): LineageEdge[] {
  return recentLineage.slice(-Math.min(Math.max(limit, 1), 200))
}

export function resetLineage(): void {
  recentLineage.length = 0
  lineageDataDir = null
  log({
    level: 'debug',
    type: 'runtime',
    message: 'lineage reset',
    action: 'g07_lineage_reset',
  })
}

export interface DataContract {
  id: string
  producerTenantRootId: string
  consumerTenantRootId: string
  dataset: string
  fields: string[]
  /** RBAC权限矩阵已有权限码 */
  requiredPermission: string
  status: 'active' | 'revoked'
  createdAt: string
}

export interface DataSubscription {
  id: string
  contractId: string
  subscriberUserId: string
  status: 'active' | 'cancelled'
  createdAt: string
}

interface Persisted {
  version: 1
  contracts: DataContract[]
  subscriptions: DataSubscription[]
}

const ALLOWED = new Set<string>(MEMBER_ASSIGNABLE_PERMISSIONS)
let dataDirRef: string | null = null
let ready = false
const contracts = new Map<string, DataContract>()
const subscriptions: DataSubscription[] = []

function storePath(): string | null {
  if (!dataDirRef) return null
  return path.join(dataDirRef, 'collab', 'data-collab.json')
}

function persist(): void {
  const file = storePath()
  if (!file) return
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const body: Persisted = {
    version: 1,
    contracts: [...contracts.values()].map((c) => ({ ...c, fields: [...c.fields] })),
    subscriptions: subscriptions.map((s) => ({ ...s })),
  }
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
}

function load(): void {
  contracts.clear()
  subscriptions.length = 0
  const file = storePath()
  if (!file || !fs.existsSync(file)) return
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<Persisted>
    for (const c of raw.contracts || []) contracts.set(c.id, { ...c, fields: [...(c.fields || [])] })
    for (const s of raw.subscriptions || []) subscriptions.push({ ...s })
  } catch {
    contracts.clear()
    subscriptions.length = 0
  }
}

export function initDataCollabService(opts: { dataDir: string }): void {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'collab')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  load()
  ready = true
  log({
    level: 'info',
    type: 'runtime',
    message: 'data collab service ready',
    action: 'data_collab_ready',
    context: { contracts: contracts.size },
  })
}

export function resetDataCollabService(): void {
  ready = false
  dataDirRef = null
  contracts.clear()
  subscriptions.length = 0
}

export function isDataCollabReady(): boolean {
  return ready
}

export function upsertDataContract(input: {
  id: string
  producerTenantRootId: string
  consumerTenantRootId: string
  dataset: string
  fields: string[]
  requiredPermission: string
}): DataContract {
  if (!ready) throw new Error('data collab not ready')
  const requiredPermission = String(input.requiredPermission || '').trim()
  if (!ALLOWED.has(requiredPermission)) {
    throw new Error(`数据协作拒绝：权限码不在 RBAC权限矩阵 — ${requiredPermission}`)
  }
  if (input.producerTenantRootId === input.consumerTenantRootId) {
    throw new Error('数据协作拒绝：合约双方须跨租户')
  }
  const now = new Date().toISOString()
  const row: DataContract = {
    id: String(input.id).trim(),
    producerTenantRootId: input.producerTenantRootId,
    consumerTenantRootId: input.consumerTenantRootId,
    dataset: input.dataset,
    fields: [...input.fields],
    requiredPermission,
    status: 'active',
    createdAt: contracts.get(input.id)?.createdAt || now,
  }
  contracts.set(row.id, row)
  persist()
  return { ...row, fields: [...row.fields] }
}

export function subscribeDataContract(input: {
  contractId: string
  subscriberUserId: string
}): DataSubscription {
  if (!ready) throw new Error('data collab not ready')
  const contract = contracts.get(input.contractId)
  if (!contract || contract.status !== 'active') throw new Error('数据合约不存在或已撤销')
  const user = database.getUserById(input.subscriberUserId)
  if (!user) throw new Error('订阅用户不存在')
  if (!user.permissions.includes(contract.requiredPermission)) {
    throw new Error('数据协作拒绝：订阅方 RBAC权限矩阵缺行')
  }
  const existing = subscriptions.find(
    (s) => s.contractId === input.contractId && s.subscriberUserId === input.subscriberUserId && s.status === 'active'
  )
  if (existing) return { ...existing }
  const row: DataSubscription = {
    id: uuidv4(),
    contractId: input.contractId,
    subscriberUserId: input.subscriberUserId,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  subscriptions.push(row)
  persist()
  log({
    level: 'info',
    type: 'business',
    message: 'data subscription opened',
    action: 'data_collab_subscribe',
    context: { contractId: row.contractId, subscriberUserId: row.subscriberUserId },
  })
  return { ...row }
}

export function exchangeDataContract(input: {
  contractId: string
  actor: User
}): { ok: true; lineageId: string } | { ok: false; reason: 'permission' | 'contract' } {
  if (!ready) throw new Error('data collab not ready')
  const contract = contracts.get(input.contractId)
  if (!contract || contract.status !== 'active') return { ok: false, reason: 'contract' }
  const live = database.getUserById(input.actor.id) || input.actor
  if (!live.permissions.includes(contract.requiredPermission)) {
    log({
      level: 'warn',
      type: 'business',
      message: 'data exchange denied',
      action: 'data_collab_deny',
      context: { contractId: contract.id, userId: live.id, missing: contract.requiredPermission },
    })
    return { ok: false, reason: 'permission' }
  }
  const edge = recordLineageEdge({
    source: contract.producerTenantRootId,
    table: contract.dataset,
    op: 'data_exchange',
    key: contract.id,
    sink: contract.consumerTenantRootId,
    trace_id: getRequestTraceId() || `data-collab-${Date.now().toString(36)}`,
    tenantRootId: live.tenantRootId,
    digitalId: live.digitalId,
  })
  log({
    level: 'info',
    type: 'business',
    message: 'data exchange recorded',
    action: 'data_collab_exchange',
    traceId: edge.trace_id,
    context: { contractId: contract.id, lineageId: edge.id },
  })
  return { ok: true, lineageId: edge.id }
}

export function runDataCollabProbe(input: {
  producer: User
  denied: User
}): {
  contractActive: boolean
  deniedWithoutRbac: boolean
  exchanged: boolean
  lineageRecorded: boolean
  subscribed: boolean
} {
  if (!ready) throw new Error('data collab not ready')
  const denied = database.getUserById(input.denied.id)
  const producer = database.getUserById(input.producer.id)
  if (!denied || !producer) throw new Error('probe user missing')
  if (producer.tenantRootId === denied.tenantRootId) {
    throw new Error('probe requires two distinct tenants')
  }
  const contract = upsertDataContract({
    id: 'b92-data-probe',
    producerTenantRootId: producer.tenantRootId,
    consumerTenantRootId: denied.tenantRootId,
    dataset: 'memo.stats',
    fields: ['count'],
    requiredPermission: 'statistics_view',
  })
  const deniedResult = exchangeDataContract({ contractId: contract.id, actor: denied })
  const allowed = exchangeDataContract({ contractId: contract.id, actor: producer })
  const edges = findLineageUpstream({ key: contract.id, limit: 5 })
  let subscribed = false
  if (producer.permissions.includes('statistics_view')) {
    const sub = subscribeDataContract({ contractId: contract.id, subscriberUserId: producer.id })
    subscribed = sub.status === 'active'
  }
  return {
    contractActive: contract.status === 'active',
    deniedWithoutRbac: deniedResult.ok === false && deniedResult.reason === 'permission',
    exchanged: allowed.ok === true,
    lineageRecorded: edges.some((e) => e.op === 'data_exchange' && e.key === contract.id),
    subscribed,
  }
}

export function ready_rb_l1_col_data_01(): boolean {
  return isDataCollabReady()
}
