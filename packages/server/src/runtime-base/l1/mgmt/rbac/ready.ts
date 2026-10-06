import type { NextFunction, Request, Response } from 'express'
import { fail, Err } from '../code/ready.js'
import type { User } from '../../../../types.js'
import { recordAuditSafe } from '../../host/audit/ready.js'
import { database } from '../../../l0/infra/db/ready.js'
import { getBootstrapReadyFlag } from '../../../l0/infra/init/ready.js'
import { getGovernanceState } from '../iam/ready.js'
import { recordChainMark } from '../trace/ready.js'

export type ColumnMask = 'mask' | 'hash' | 'null' | 'partial'

export type RowPredicate =
  | { op: 'eq'; field: string; value: string }
  | { op: 'deny' }

export function requirePermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser
    if (!user) {
      fail(res, 401, Err.UNAUTH, '未认证', req)
      return
    }
    const missing = perms.filter((p) => !user.permissions.includes(p))
    if (missing.length > 0) {
      void import('../../col/evt/ready.js')
        .then((m) => {
          m.publishDomainEvent(
            'PermissionDenied',
            11,
            {
              userId: user.id,
              resource: req.path,
              action: missing.join(','),
              policyId: 'rbac',
            },
            'warn'
          )
          m.publishDomainEvent(
            'PolicyEvaluated',
            11,
            { policyId: 'rbac', result: 'deny', userId: user.id },
            'warn'
          )
        })
        .catch(() => undefined)
      recordAuditSafe({
        actor: user.username || user.id,
        action: 'permission_denied',
        resource: `${req.method} ${req.path}`.slice(0, 180),
        detail: missing.join(','),
        serviceIdentity: '',
        tenant: user.tenantRootId || undefined,
        permissionRow: '无行',
        result: '拒绝',
        traceId: req.traceId,
      })
      recordChainMark(
        'permission_deny',
        `无行:${missing.join(',')}:${req.path}`,
        req.traceId
      )
      fail(res, 403, Err.FORBIDDEN, `权限不足：缺少 ${missing.join(', ')}`, req)
      return
    }
    next()
  }
}

/** 任一权限满足即可（用于通知等跨入口能力） */
export function requireAnyPermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser
    if (!user) {
      fail(res, 401, Err.UNAUTH, '未认证', req)
      return
    }
    if (!perms.some((p) => user.permissions.includes(p))) {
      recordAuditSafe({
        actor: user.username || user.id,
        action: 'permission_denied',
        resource: `${req.method} ${req.path}`.slice(0, 180),
        detail: perms.join('|'),
      })
      fail(res, 403, Err.FORBIDDEN, `权限不足：需要 ${perms.join(' 或 ')}`, req)
      return
    }
    next()
  }
}

export function listTenantUserIds(req: Request): Set<string> {
  const root = req.authUser?.tenantRootId
  if (!root) return new Set()
  return new Set(database.getUsersByTenantRootId(root).map((u) => u.id))
}

/**
 * 可见用户范围：主账号始终本范围全员；
 * 子账号勾选 memo_isolate_peers / attachment_isolate_peers 时仅本人。
 */
export function resolveVisibleUserIds(
  req: Request,
  kind: 'memo' | 'attachment'
): string[] {
  const actor = req.authUser
  if (!actor?.id) return []
  const tenant = [...listTenantUserIds(req)]
  if (tenant.length === 0) return [actor.id]

  const isOwner =
    actor.role === 'owner' ||
    actor.isMainAccount === true ||
    (Array.isArray(actor.permissions) && actor.permissions.includes('account_manage'))
  if (isOwner) return tenant

  const isolateFlag =
    kind === 'memo' ? 'memo_isolate_peers' : 'attachment_isolate_peers'
  const isolated =
    Array.isArray(actor.permissions) && actor.permissions.includes(isolateFlag)
  if (isolated) return [actor.id]
  return tenant
}

export function actorIsolatesPeers(
  actor: { permissions?: string[]; role?: string; isMainAccount?: boolean } | null | undefined,
  kind: 'memo' | 'attachment'
): boolean {
  if (!actor) return false
  if (actor.role === 'owner' || actor.isMainAccount) return false
  if (Array.isArray(actor.permissions) && actor.permissions.includes('account_manage')) {
    return false
  }
  const isolateFlag =
    kind === 'memo' ? 'memo_isolate_peers' : 'attachment_isolate_peers'
  return Array.isArray(actor.permissions) && actor.permissions.includes(isolateFlag)
}

/** 本租户可见备忘录。调用方须已通过 requirePermission('memo_manage')。 */
export function listTenantMemos(req: Request): Array<{
  id: string
  userId: string
  deletedAt?: string | null
  updatedAt: string
  [key: string]: unknown
}> {
  const ids = resolveVisibleUserIds(req, 'memo')
  const memos = database.getMemosListByUserIds(ids)
  return memos
    .map((m) => m as unknown as { id: string; userId: string; deletedAt?: string | null; updatedAt: string; [key: string]: unknown })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/** 同租户同伴只读：矩阵属性，非平行权限码。 */
export function canReadTenantPeer(actor: User, parentUserId: string): boolean {
  const canManage = actor.permissions.includes('account_manage')
  if (canManage) return true
  if (!actor.permissions.includes('memo_manage')) return false
  const isParent = actor.id === parentUserId
  const isMemberUnderParent = actor.parentUserId === parentUserId || actor.tenantRootId === parentUserId
  return isParent || isMemberUnderParent
}

export function ready_rb_l1_mgmt_rbac_01(): boolean {
  const g = getGovernanceState()
  return typeof requirePermission === 'function' && g.ready && !g.killSwitch && getBootstrapReadyFlag()
}

export const rbac = {
  resolve_data_scope(subject: { tenantId?: string }, _resource: string): {
    row_predicate: RowPredicate
    column_mask: Record<string, ColumnMask>
  } {
    if (!subject?.tenantId) {
      return { row_predicate: { op: 'deny' }, column_mask: {} }
    }
    return {
      row_predicate: { op: 'eq', field: 'tenant_id', value: subject.tenantId },
      column_mask: {},
    }
  },
}

/** RJ-02：已有会话但目标资源无权限行，拒绝且不得进入履约 */
export function probeMissingPermissionRow(): { denied: boolean; proceeded: boolean } {
  let proceeded = false
  let statusCode = 0
  const req = {
    method: 'GET',
    path: '/api/memos/rj02',
    traceId: 'rj02-permission',
    authUser: {
      id: 'user-rj02',
      username: 'rj02',
      permissions: [] as string[],
      tenantRootId: 'tenant-rj02',
    },
  } as unknown as Request
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json() {
      return this
    },
  } as unknown as Response
  requirePermission('memo_manage')(req, res, () => {
    proceeded = true
  })
  return { denied: statusCode === 403 && !proceeded, proceeded }
}
