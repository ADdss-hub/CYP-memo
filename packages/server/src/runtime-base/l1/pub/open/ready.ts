/**
 * 开放协作管控（公开子平台 · B9.4）
 * 专属：开放接口目录、应用注册、订阅审批、配额、开放面 SLA。
 * 门户 = 唯一产品入口 `/tenant/open-portal` + 机器可读目录（不新起独立站点）。
 * 红线：不替代契约治理管控 / 业务协同对接 / 公开接入安全；未登记不得宣称已开放。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { listContracts, isContractGovernanceReady } from '../../col/ctr/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export interface OpenApp {
  id: string
  name: string
  owner: string
  status: 'active' | 'suspended'
  createdAt: string
}

export interface OpenSubscription {
  id: string
  appId: string
  apiPath: string
  status: 'pending' | 'approved' | 'revoked'
  createdAt: string
  approvedAt?: string
}

export interface OpenQuota {
  appId: string
  maxRpm: number
  maxDaily: number
}

export interface OpenSla {
  apiPath: string
  availabilityTarget: number
  latencyP99Ms: number
}

interface Persisted {
  version: 1
  apps: OpenApp[]
  subscriptions: OpenSubscription[]
  quotas: OpenQuota[]
  slas: OpenSla[]
}

let dataDirRef: string | null = null
let ready = false
const apps = new Map<string, OpenApp>()
const subscriptions: OpenSubscription[] = []
const quotas = new Map<string, OpenQuota>()
const slas = new Map<string, OpenSla>()

function storePath(): string | null {
  if (!dataDirRef) return null
  return path.join(dataDirRef, 'collab', 'open-collab.json')
}

function persist(): void {
  const file = storePath()
  if (!file) return
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const body: Persisted = {
    version: 1,
    apps: [...apps.values()],
    subscriptions: subscriptions.map((s) => ({ ...s })),
    quotas: [...quotas.values()],
    slas: [...slas.values()],
  }
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
}

function load(): void {
  apps.clear()
  subscriptions.length = 0
  quotas.clear()
  slas.clear()
  const file = storePath()
  if (!file || !fs.existsSync(file)) return
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<Persisted>
    for (const a of raw.apps || []) apps.set(a.id, { ...a })
    for (const s of raw.subscriptions || []) subscriptions.push({ ...s })
    for (const q of raw.quotas || []) quotas.set(q.appId, { ...q })
    for (const s of raw.slas || []) slas.set(s.apiPath, { ...s })
  } catch {
    apps.clear()
    subscriptions.length = 0
    quotas.clear()
    slas.clear()
  }
}

export function initOpenCollab(opts: { dataDir: string }): void {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'collab')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  load()
  ready = true
  ensureOpenCollabBaseline()
  log({
    level: 'info',
    type: 'runtime',
    message: 'open collab ready',
    action: 'open_collab_ready',
    context: { apps: apps.size, subscriptions: subscriptions.length, slas: slas.size },
  })
}

/** 基线：至少 1 应用 + 1 SLA + 1 已审批订阅；目录来自契约治理管控。 */
export function ensureOpenCollabBaseline(): void {
  if (!ready) return
  if (!isContractGovernanceReady()) return
  const catalog = getOpenApiCatalog()
  if (catalog.paths.length === 0) return
  if (apps.size === 0) {
    registerOpenApp({
      id: 'cyp-memo-embedded',
      name: 'CYP-memo Embedded',
      owner: 'system',
    })
  }
  const appId = [...apps.keys()][0]
  const apiPath =
    catalog.paths.find((p) => p.includes('/api/health')) ||
    catalog.paths.find((p) => p.startsWith('GET ')) ||
    catalog.paths[0]
  if (!slas.has(apiPath)) {
    registerOpenSla({ apiPath, availabilityTarget: 0.999, latencyP99Ms: 500 })
  }
  const hasApproved = subscriptions.some(
    (s) => s.appId === appId && s.apiPath === apiPath && s.status === 'approved'
  )
  if (!hasApproved) {
    const sub = requestOpenSubscription({ appId, apiPath })
    if (sub.status === 'pending') approveOpenSubscription(sub.id)
  }
}

export function resetOpenCollab(): void {
  ready = false
  dataDirRef = null
  apps.clear()
  subscriptions.length = 0
  quotas.clear()
  slas.clear()
}

/** 机器可读开放接口目录（门户等价物） */
export function getOpenApiCatalog(): {
  paths: string[]
  contractIds: string[]
  generatedAt: string
} {
  const contracts = listContracts()
  const paths = new Set<string>()
  for (const c of contracts) for (const p of c.paths) paths.add(p)
  return {
    paths: [...paths].sort(),
    contractIds: contracts.map((c) => c.id),
    generatedAt: new Date().toISOString(),
  }
}

export function registerOpenApp(input: {
  id?: string
  name: string
  owner: string
}): OpenApp {
  if (!ready) throw new Error('open collab not ready')
  const name = String(input.name || '').trim()
  const owner = String(input.owner || '').trim()
  if (!name || !owner) throw new Error('registerOpenApp requires name and owner')
  const id = String(input.id || uuidv4()).trim()
  const row: OpenApp = {
    id,
    name,
    owner,
    status: 'active',
    createdAt: apps.get(id)?.createdAt || new Date().toISOString(),
  }
  apps.set(id, row)
  if (!quotas.has(id)) {
    quotas.set(id, { appId: id, maxRpm: 60, maxDaily: 10000 })
  }
  persist()
  return { ...row }
}

export function setOpenQuota(input: { appId: string; maxRpm: number; maxDaily: number }): OpenQuota {
  if (!ready) throw new Error('open collab not ready')
  if (!apps.has(input.appId)) throw new Error('应用未注册')
  const row: OpenQuota = {
    appId: input.appId,
    maxRpm: Math.max(1, Number(input.maxRpm) || 60),
    maxDaily: Math.max(1, Number(input.maxDaily) || 10000),
  }
  quotas.set(row.appId, row)
  persist()
  return { ...row }
}

export function registerOpenSla(input: {
  apiPath: string
  availabilityTarget: number
  latencyP99Ms: number
}): OpenSla {
  if (!ready) throw new Error('open collab not ready')
  const apiPath = String(input.apiPath || '').trim()
  if (!apiPath) throw new Error('registerOpenSla requires apiPath')
  const row: OpenSla = {
    apiPath,
    availabilityTarget: Number(input.availabilityTarget) || 0.999,
    latencyP99Ms: Math.max(1, Number(input.latencyP99Ms) || 500),
  }
  slas.set(apiPath, row)
  persist()
  return { ...row }
}

export function requestOpenSubscription(input: {
  appId: string
  apiPath: string
}): OpenSubscription {
  if (!ready) throw new Error('open collab not ready')
  if (!apps.has(input.appId)) throw new Error('应用未注册，不得开放订阅')
  const catalog = getOpenApiCatalog()
  if (!catalog.paths.includes(input.apiPath)) {
    throw new Error('接口不在开放目录（须先经契约治理管控登记）')
  }
  const existing = subscriptions.find(
    (s) =>
      s.appId === input.appId &&
      s.apiPath === input.apiPath &&
      (s.status === 'pending' || s.status === 'approved')
  )
  if (existing) return { ...existing }
  const row: OpenSubscription = {
    id: uuidv4(),
    appId: input.appId,
    apiPath: input.apiPath,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  subscriptions.push(row)
  persist()
  return { ...row }
}

export function approveOpenSubscription(subscriptionId: string): OpenSubscription {
  if (!ready) throw new Error('open collab not ready')
  const row = subscriptions.find((s) => s.id === subscriptionId)
  if (!row) throw new Error('subscription not found')
  if (row.status !== 'pending') throw new Error(`subscription status=${row.status}`)
  row.status = 'approved'
  row.approvedAt = new Date().toISOString()
  persist()
  log({
    level: 'info',
    type: 'audit',
    message: 'open subscription approved',
    action: 'open_collab_subscribe_approve',
    context: { subscriptionId: row.id, appId: row.appId, apiPath: row.apiPath },
  })
  return { ...row }
}

/**
 * 未登记不得宣称已开放：应用须注册且对目标路径有已审批订阅。
 */
export function assertOpenCallAllowed(input: {
  appId: string
  apiPath: string
}): { ok: true } | { ok: false; reason: 'unregistered_app' | 'no_subscription' | 'suspended' } {
  const app = apps.get(input.appId)
  if (!app) return { ok: false, reason: 'unregistered_app' }
  if (app.status !== 'active') return { ok: false, reason: 'suspended' }
  const sub = subscriptions.find(
    (s) => s.appId === input.appId && s.apiPath === input.apiPath && s.status === 'approved'
  )
  if (!sub) return { ok: false, reason: 'no_subscription' }
  return { ok: true }
}

export function listOpenApps(): OpenApp[] {
  return [...apps.values()].map((a) => ({ ...a }))
}

export function listOpenQuotas(): OpenQuota[] {
  return [...quotas.values()].map((q) => ({ ...q }))
}

export function listOpenSlas(): OpenSla[] {
  return [...slas.values()].map((s) => ({ ...s }))
}

export function listOpenSubscriptions(): OpenSubscription[] {
  return subscriptions.map((s) => ({ ...s }))
}

export function isOpenCollabReady(): boolean {
  if (!ready) return false
  const catalog = getOpenApiCatalog()
  return (
    apps.size > 0 &&
    quotas.size > 0 &&
    slas.size > 0 &&
    catalog.paths.length > 0 &&
    subscriptions.some((s) => s.status === 'approved')
  )
}

export function runOpenCollabProbe(): {
  catalogNonEmpty: boolean
  appRegistered: boolean
  unregisteredDenied: boolean
  subscriptionApproved: boolean
  allowedAfterApprove: boolean
  quotaSet: boolean
  slaRegistered: boolean
} {
  if (!ready) throw new Error('open collab not ready')
  const catalog = getOpenApiCatalog()
  const apiPath = catalog.paths.find((p) => p.startsWith('GET ')) || catalog.paths[0]
  if (!apiPath) {
    return {
      catalogNonEmpty: false,
      appRegistered: false,
      unregisteredDenied: true,
      subscriptionApproved: false,
      allowedAfterApprove: false,
      quotaSet: false,
      slaRegistered: false,
    }
  }
  const app = registerOpenApp({
    id: 'b94-open-probe-app',
    name: 'B94 Open Probe',
    owner: 'b94-probe',
  })
  const quota = setOpenQuota({ appId: app.id, maxRpm: 30, maxDaily: 1000 })
  const sla = registerOpenSla({
    apiPath,
    availabilityTarget: 0.999,
    latencyP99Ms: 400,
  })
  // 可重复探针：先确保无已批准订阅，再走 deny → request → approve → allow
  for (let i = subscriptions.length - 1; i >= 0; i--) {
    const s = subscriptions[i]
    if (s.appId === app.id && s.apiPath === apiPath) subscriptions.splice(i, 1)
  }
  persist()
  const deny = assertOpenCallAllowed({ appId: app.id, apiPath })
  const req = requestOpenSubscription({ appId: app.id, apiPath })
  const approved =
    req.status === 'approved' ? req : approveOpenSubscription(req.id)
  const allow = assertOpenCallAllowed({ appId: app.id, apiPath })
  const ghost = assertOpenCallAllowed({ appId: 'no-such-app', apiPath })
  return {
    catalogNonEmpty: catalog.paths.length > 0,
    appRegistered: Boolean(apps.get(app.id)),
    unregisteredDenied: ghost.ok === false && ghost.reason === 'unregistered_app',
    subscriptionApproved: approved.status === 'approved',
    allowedAfterApprove: allow.ok === true && deny.ok === false,
    quotaSet: quota.maxRpm === 30,
    slaRegistered: slas.has(sla.apiPath),
  }
}

export function ready_rb_l1_pub_open_01(): boolean {
  return isOpenCollabReady()
}
