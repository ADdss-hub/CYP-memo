/**
 * CYP-memo 身份迁移钩子（R1/G08 · SIX-DB）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 权威 DDL 在 server sql.js；shared Dexie 为离线/桌面兼容面（version 3 已落地）。
 */

import type { User, UserRole } from '../types'
import {
  OWNER_DEFAULT_PERMISSIONS,
  MEMBER_DEFAULT_PERMISSIONS,
  inferUserRole,
  resolveTenantRootId,
} from '../types'

export interface IdentityMigrationResult {
  applied: boolean
  reason: string
  /** 计划变更摘要（未执行时也可列出） */
  plannedSteps: string[]
}

/**
 * 身份迁移步骤（server 已落地；Dexie v3 已落地）
 */
export const IDENTITY_MIGRATION_PLANNED_STEPS: readonly string[] = [
  'users.role (owner|member)',
  'users.tenantRootId',
  'Owner 十权包回填',
  'admins → users 合并',
  'server initDefaultAdmin 改为 Owner 种子',
  'Dexie version(3) + IndexedDB upgrade',
] as const

/**
 * 纯函数：为内存中的 User 投影 R1 身份字段（不写库）
 */
export function projectUserIdentityFields(user: User): User {
  const role: UserRole = inferUserRole(user)
  const tenantRootId = resolveTenantRootId(user)
  // 显式空数组保留（权限清空）；仅 undefined/null 时按角色回填默认权包
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : role === 'owner'
      ? [...OWNER_DEFAULT_PERMISSIONS]
      : [...MEMBER_DEFAULT_PERMISSIONS]

  return {
    ...user,
    role,
    tenantRootId,
    permissions,
  }
}

/**
 * 客户端 digitalId 分配（6 位数字，避开 used 集合）
 */
export function allocateClientDigitalId(used: Set<string>): string {
  for (let i = 0; i < 10_000; i++) {
    const id = String(Math.floor(100000 + Math.random() * 900000))
    if (!used.has(id)) {
      used.add(id)
      return id
    }
  }
  throw new Error('allocateClientDigitalId: exhausted')
}

/**
 * 迁移入口：声明 server + Dexie v3 已齐套
 */
export async function applyIdentityMigrationV1(): Promise<IdentityMigrationResult> {
  return {
    applied: true,
    reason:
      'server sql.js + Dexie version(3) 身份列/回填/admins→users 已落地；权威仍以 server users 为准',
    plannedSteps: [...IDENTITY_MIGRATION_PLANNED_STEPS],
  }
}
