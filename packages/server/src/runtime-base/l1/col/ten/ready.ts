/**
 * 租户协作服务（协作能力子平台 · B9.2）
 * 专属：租户生命周期登记、跨租户授权编排、配额与隔离策略编排。
 * 红线：不替代身份访问管控；权限最终必须落到 RBAC权限矩阵的行（user.permissions）。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { database } from '../../../l0/infra/db/ready.js'
import { MEMBER_ASSIGNABLE_PERMISSIONS, type User } from '../../../../types.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export type TenantCollabGrantStatus = 'pending' | 'approved' | 'applied' | 'revoked' | 'denied'

export interface TenantRecord {
  tenantRootId: string
  ownerUserId: string
  createdAt: string
  quota: {
    maxCrossTenantGrants: number
    maxMembers: number
  }
  isolation: {
    /** 默认拒绝跨租户；仅编排落地的 RBAC 行可放行 */
    defaultDenyCrossTenant: true
  }
}

export interface CrossTenantGrant {
  id: string
  fromTenantRootId: string
  toTenantRootId: string
  /** 被授予权限的用户（目标租户内） */
  subjectUserId: string
  /** 必须是 RBAC权限矩阵已有权限码；禁止发明平行权限 */
  permissions: string[]
  status: TenantCollabGrantStatus
  reason: string
  createdAt: string
  updatedAt: string
  appliedAt?: string
  revokedAt?: string
}

interface PersistedState {
  version: 1
  tenants: TenantRecord[]
  grants: CrossTenantGrant[]
}

const ALLOWED = new Set<string>(MEMBER_ASSIGNABLE_PERMISSIONS)

let dataDirRef: string | null = null
let ready = false
const tenants = new Map<string, TenantRecord>()
const grants: CrossTenantGrant[] = []

function storePath(): string | null {
  if (!dataDirRef) return null
  return path.join(dataDirRef, 'collab', 'tenant-collab.json')
}

function persist(): void {
  const file = storePath()
  if (!file) return
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const body: PersistedState = {
    version: 1,
    tenants: [...tenants.values()],
    grants: grants.map((g) => ({ ...g, permissions: [...g.permissions] })),
  }
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
}

function load(): void {
  tenants.clear()
  grants.length = 0
  const file = storePath()
  if (!file || !fs.existsSync(file)) return
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<PersistedState>
    for (const t of raw.tenants || []) {
      tenants.set(t.tenantRootId, {
        ...t,
        isolation: { defaultDenyCrossTenant: true },
        quota: {
          maxCrossTenantGrants: t.quota?.maxCrossTenantGrants ?? 20,
          maxMembers: t.quota?.maxMembers ?? 50,
        },
      })
    }
    for (const g of raw.grants || []) {
      grants.push({ ...g, permissions: [...(g.permissions || [])] })
    }
  } catch {
    tenants.clear()
    grants.length = 0
  }
}

function normalizePerms(perms: string[]): string[] {
  const out: string[] = []
  for (const p of perms || []) {
    const code = String(p || '').trim()
    if (!code) continue
    if (!ALLOWED.has(code)) {
      throw new Error(`租户协作拒绝：权限码不在 RBAC权限矩阵 — ${code}`)
    }
    if (!out.includes(code)) out.push(code)
  }
  if (out.length === 0) throw new Error('租户协作拒绝：permissions 为空')
  return out
}

export function initTenantCollabService(opts: { dataDir: string }): void {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'collab')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  load()
  ready = true
  log({
    level: 'info',
    type: 'runtime',
    message: 'tenant collab service ready',
    action: 'tenant_collab_ready',
    context: { tenants: tenants.size, grants: grants.length },
  })
}

export function resetTenantCollabService(): void {
  ready = false
  dataDirRef = null
  tenants.clear()
  grants.length = 0
}

export function isTenantCollabReady(): boolean {
  return ready
}

/** 登记租户（生命周期）；幂等。 */
export function registerTenant(input: {
  tenantRootId: string
  ownerUserId: string
  maxCrossTenantGrants?: number
  maxMembers?: number
}): TenantRecord {
  if (!ready) throw new Error('tenant collab not ready')
  const tenantRootId = String(input.tenantRootId || '').trim()
  const ownerUserId = String(input.ownerUserId || '').trim()
  if (!tenantRootId || !ownerUserId) throw new Error('registerTenant requires tenantRootId and ownerUserId')
  const existing = tenants.get(tenantRootId)
  if (existing) return { ...existing, quota: { ...existing.quota }, isolation: { ...existing.isolation } }
  const row: TenantRecord = {
    tenantRootId,
    ownerUserId,
    createdAt: new Date().toISOString(),
    quota: {
      maxCrossTenantGrants: input.maxCrossTenantGrants ?? 20,
      maxMembers: input.maxMembers ?? 50,
    },
    isolation: { defaultDenyCrossTenant: true },
  }
  tenants.set(tenantRootId, row)
  persist()
  return { ...row, quota: { ...row.quota }, isolation: { ...row.isolation } }
}

export function listTenants(): TenantRecord[] {
  return [...tenants.values()].map((t) => ({
    ...t,
    quota: { ...t.quota },
    isolation: { ...t.isolation },
  }))
}

export function listCrossTenantGrants(): CrossTenantGrant[] {
  return grants.map((g) => ({ ...g, permissions: [...g.permissions] }))
}

/**
 * 发起跨租户授权编排（尚未落 RBAC）。
 * 同租户编排无意义时拒绝；默认隔离策略禁止未落地直访。
 */
export function requestCrossTenantGrant(input: {
  fromTenantRootId: string
  toTenantRootId: string
  subjectUserId: string
  permissions: string[]
  reason: string
}): CrossTenantGrant {
  if (!ready) throw new Error('tenant collab not ready')
  const fromTenantRootId = String(input.fromTenantRootId || '').trim()
  const toTenantRootId = String(input.toTenantRootId || '').trim()
  const subjectUserId = String(input.subjectUserId || '').trim()
  const reason = String(input.reason || '').trim()
  if (!fromTenantRootId || !toTenantRootId || !subjectUserId || !reason) {
    throw new Error('requestCrossTenantGrant requires from/to/subject/reason')
  }
  if (fromTenantRootId === toTenantRootId) {
    throw new Error('租户协作拒绝：同租户请走身份访问管控，不经跨租户编排')
  }
  registerTenant({ tenantRootId: fromTenantRootId, ownerUserId: fromTenantRootId })
  registerTenant({ tenantRootId: toTenantRootId, ownerUserId: toTenantRootId })
  const from = tenants.get(fromTenantRootId)!
  const active = grants.filter(
    (g) =>
      g.fromTenantRootId === fromTenantRootId &&
      (g.status === 'pending' || g.status === 'approved' || g.status === 'applied')
  ).length
  if (active >= from.quota.maxCrossTenantGrants) {
    throw new Error('租户协作拒绝：跨租户授权配额已满')
  }
  const subject = database.getUserById(subjectUserId)
  if (!subject) throw new Error('租户协作拒绝：subject 用户不存在')
  if (subject.tenantRootId !== toTenantRootId) {
    throw new Error('租户协作拒绝：subject 必须属于 toTenant')
  }
  const permissions = normalizePerms(input.permissions)
  const now = new Date().toISOString()
  const row: CrossTenantGrant = {
    id: uuidv4(),
    fromTenantRootId,
    toTenantRootId,
    subjectUserId,
    permissions,
    status: 'pending',
    reason,
    createdAt: now,
    updatedAt: now,
  }
  grants.push(row)
  persist()
  return { ...row, permissions: [...row.permissions] }
}

export function approveCrossTenantGrant(grantId: string): CrossTenantGrant {
  if (!ready) throw new Error('tenant collab not ready')
  const row = grants.find((g) => g.id === grantId)
  if (!row) throw new Error('grant not found')
  if (row.status !== 'pending') throw new Error(`grant status=${row.status}`)
  row.status = 'approved'
  row.updatedAt = new Date().toISOString()
  persist()
  return { ...row, permissions: [...row.permissions] }
}

/**
 * 编排完成：把权限写入目标用户的 RBAC权限矩阵行。
 * 禁止在此旁路鉴权；后续仍由 requirePermission 读矩阵。
 */
export function applyCrossTenantGrant(grantId: string): {
  grant: CrossTenantGrant
  rbacRow: { userId: string; permissions: string[] }
} {
  if (!ready) throw new Error('tenant collab not ready')
  const row = grants.find((g) => g.id === grantId)
  if (!row) throw new Error('grant not found')
  if (row.status !== 'approved' && row.status !== 'pending') {
    throw new Error(`grant cannot apply from status=${row.status}`)
  }
  if (row.status === 'pending') {
    row.status = 'approved'
  }
  const user = database.getUserById(row.subjectUserId)
  if (!user) throw new Error('subject 用户不存在')
  if (user.tenantRootId !== row.toTenantRootId) {
    throw new Error('subject 租户已变更，拒绝落地')
  }
  const next = [...user.permissions]
  for (const p of row.permissions) {
    if (!next.includes(p)) next.push(p)
  }
  database.updateUser(user.id, { permissions: next })
  const refreshed = database.getUserById(user.id)
  if (!refreshed) throw new Error('RBAC 落地后读取失败')
  for (const p of row.permissions) {
    if (!refreshed.permissions.includes(p)) {
      throw new Error(`RBAC权限矩阵缺行：${p}`)
    }
  }
  const now = new Date().toISOString()
  row.status = 'applied'
  row.appliedAt = now
  row.updatedAt = now
  persist()
  log({
    level: 'info',
    type: 'business',
    message: 'cross-tenant grant applied to RBAC',
    action: 'tenant_collab_apply',
    context: {
      grantId: row.id,
      subjectUserId: row.subjectUserId,
      permissions: row.permissions,
    },
  })
  return {
    grant: { ...row, permissions: [...row.permissions] },
    rbacRow: { userId: refreshed.id, permissions: [...refreshed.permissions] },
  }
}

export function revokeCrossTenantGrant(grantId: string): CrossTenantGrant {
  if (!ready) throw new Error('tenant collab not ready')
  const row = grants.find((g) => g.id === grantId)
  if (!row) throw new Error('grant not found')
  if (row.status === 'applied') {
    const user = database.getUserById(row.subjectUserId)
    if (user) {
      const next = user.permissions.filter((p) => !row.permissions.includes(p))
      // 保底 profile_self
      if (!next.includes('profile_self')) next.push('profile_self')
      database.updateUser(user.id, { permissions: next })
    }
  }
  row.status = 'revoked'
  row.revokedAt = new Date().toISOString()
  row.updatedAt = row.revokedAt
  persist()
  return { ...row, permissions: [...row.permissions] }
}

/** 编排态查询：未 applied 则视为无跨租户权（默认拒绝）。 */
export function hasAppliedCrossTenantPermission(
  subjectUserId: string,
  permission: string,
  fromTenantRootId?: string
): boolean {
  return grants.some(
    (g) =>
      g.status === 'applied' &&
      g.subjectUserId === subjectUserId &&
      g.permissions.includes(permission) &&
      (!fromTenantRootId || g.fromTenantRootId === fromTenantRootId)
  )
}

/**
 * B9.2 探针：编排 → 落地 RBAC → 矩阵有行；未落地时矩阵无新增行。
 * 使用真实用户对，不 Mock。
 */
export function runTenantCollabProbe(input: {
  fromOwner: User
  subjectUserId: string
  permission?: string
}): {
  requested: boolean
  applied: boolean
  rbacHasRow: boolean
  beforeMissing: boolean
} {
  if (!ready) throw new Error('tenant collab not ready')
  const permission = input.permission || 'statistics_view'
  const subject = database.getUserById(input.subjectUserId)
  if (!subject) throw new Error('subject 用户不存在')
  if (input.fromOwner.tenantRootId === subject.tenantRootId) {
    throw new Error('probe requires two distinct tenants')
  }
  for (const g of [...grants]) {
    if (
      g.subjectUserId === subject.id &&
      g.permissions.includes(permission) &&
      g.reason === 'B9.2 tenant-collab probe' &&
      (g.status === 'applied' || g.status === 'pending' || g.status === 'approved')
    ) {
      if (g.status === 'pending') g.status = 'approved'
      revokeCrossTenantGrant(g.id)
    }
  }
  const before = database.getUserById(subject.id)
  if (!before) throw new Error('subject 用户不存在')
  const beforeMissing = !before.permissions.includes(permission)

  const grant = requestCrossTenantGrant({
    fromTenantRootId: input.fromOwner.tenantRootId,
    toTenantRootId: subject.tenantRootId,
    subjectUserId: subject.id,
    permissions: [permission],
    reason: 'B9.2 tenant-collab probe',
  })
  const mid = database.getUserById(subject.id)!
  const stillMissing = !mid.permissions.includes(permission)
  approveCrossTenantGrant(grant.id)
  const applied = applyCrossTenantGrant(grant.id)
  const rbacHasRow = applied.rbacRow.permissions.includes(permission)
  return {
    requested: stillMissing,
    applied: applied.grant.status === 'applied',
    rbacHasRow,
    beforeMissing: beforeMissing && stillMissing,
  }
}

export function ready_rb_l1_col_ten_01(): boolean {
  return isTenantCollabReady()
}
