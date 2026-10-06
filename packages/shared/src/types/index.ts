/**
 * CYP-memo 类型定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * Permission 按侧栏独立入口细化（一入口一权）
 */

/**
 * 权限点全集（一入口一权；与侧栏 APP_MENU_SECTIONS 一一对应）
 */
export enum Permission {
  /** 侧栏「备忘录」 */
  MEMO_MANAGE = 'memo_manage',
  /** 侧栏「备忘录数据」 */
  MEMO_DATA = 'memo_data',
  /** 侧栏「分享管理」 */
  SHARE_MANAGE = 'share_manage',
  /** 侧栏「数据统计」 */
  STATISTICS_VIEW = 'statistics_view',
  /** 侧栏「文件库」 */
  ATTACHMENT_MANAGE = 'attachment_manage',
  /** 侧栏「系统设置」 */
  SETTINGS_MANAGE = 'settings_manage',
  /** 侧栏「子用户管理」（仅 Owner；不可分配给子账号） */
  ACCOUNT_MANAGE = 'account_manage',
  /** 侧栏「运维概览」 */
  TENANT_DASHBOARD = 'tenant_dashboard',
  /** @deprecated 成员业务唯一入口为 account_manage；保留码值兼容旧会话 */
  TENANT_USERS = 'tenant_users',
  /** 数据治理 API（侧栏入口已取消；保留码值兼容） */
  TENANT_DATABASE = 'tenant_database',
  /** 运行监控（侧栏默认隐藏；经运维概览进入） */
  TENANT_MONITOR = 'tenant_monitor',
  /** 侧栏「运行日志」 */
  TENANT_LOGS = 'tenant_logs',
  /** 侧栏「个人资料」 */
  PROFILE_SELF = 'profile_self',
  /**
   * 备忘录：子账号间隔离（勾选后该子账号仅见本人备忘录；默认不勾=本范围共享）
   * 非侧栏入口；仅可分配给子账号
   */
  MEMO_ISOLATE_PEERS = 'memo_isolate_peers',
  /**
   * 文件库：子账号间隔离（勾选后该子账号仅见本人文件；默认不勾=本范围共享）
   * 非侧栏入口；仅可分配给子账号
   */
  ATTACHMENT_ISOLATE_PEERS = 'attachment_isolate_peers',
}

/**
 * 统一身份角色（R1 目标态）
 * Owner = 租户主；Member = 子用户
 */
export type UserRole = 'owner' | 'member'

/**
 * Owner 默认权限包（全开）
 */
export const OWNER_DEFAULT_PERMISSIONS: readonly Permission[] = [
  Permission.MEMO_MANAGE,
  Permission.MEMO_DATA,
  Permission.SHARE_MANAGE,
  Permission.STATISTICS_VIEW,
  Permission.ATTACHMENT_MANAGE,
  Permission.SETTINGS_MANAGE,
  Permission.ACCOUNT_MANAGE,
  Permission.TENANT_DASHBOARD,
  Permission.TENANT_USERS,
  Permission.TENANT_DATABASE,
  Permission.TENANT_MONITOR,
  Permission.TENANT_LOGS,
  Permission.PROFILE_SELF,
] as const

/**
 * Member 建议默认（仅自身；业务权由 Owner 分配）
 */
export const MEMBER_DEFAULT_PERMISSIONS: readonly Permission[] = [
  Permission.PROFILE_SELF,
] as const

/** 权限中文标签（单一事实源） */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.MEMO_MANAGE]: '备忘录',
  [Permission.MEMO_DATA]: '备忘录数据',
  [Permission.SHARE_MANAGE]: '分享管理',
  [Permission.STATISTICS_VIEW]: '数据统计',
  [Permission.ATTACHMENT_MANAGE]: '文件库',
  [Permission.SETTINGS_MANAGE]: '系统设置',
  [Permission.ACCOUNT_MANAGE]: '子用户管理',
  [Permission.TENANT_DASHBOARD]: '运维概览',
  [Permission.TENANT_USERS]: '成员一览（已并入子用户管理）',
  [Permission.TENANT_DATABASE]: '数据治理（兼容）',
  [Permission.TENANT_MONITOR]: '运行监控（经概览）',
  [Permission.TENANT_LOGS]: '运行日志',
  [Permission.PROFILE_SELF]: '个人资料',
  [Permission.MEMO_ISOLATE_PEERS]: '备忘录子账号隔离',
  [Permission.ATTACHMENT_ISOLATE_PEERS]: '文件库子账号隔离',
}

/**
 * Owner 可分配给子账号的权限（禁止 account_manage）
 * profile_self 必含，创建/更新时由 normalizeMemberPermissions 强制合并
 */
export const MEMBER_ASSIGNABLE_PERMISSIONS: readonly Permission[] = [
  Permission.MEMO_MANAGE,
  Permission.MEMO_DATA,
  Permission.SHARE_MANAGE,
  Permission.STATISTICS_VIEW,
  Permission.ATTACHMENT_MANAGE,
  Permission.SETTINGS_MANAGE,
  Permission.TENANT_DASHBOARD,
  Permission.TENANT_MONITOR,
  Permission.TENANT_LOGS,
  Permission.PROFILE_SELF,
  Permission.MEMO_ISOLATE_PEERS,
  Permission.ATTACHMENT_ISOLATE_PEERS,
] as const

/**
 * 子账号可勾选权限项（扁平 · 一入口一权）
 * hint 仅在有额外说明时填写；禁止与 PERMISSION_LABELS 同义重复
 */
export const ASSIGNABLE_PERMISSION_ITEMS: readonly {
  permission: Permission
  path: string
  hint?: string
}[] = [
  { permission: Permission.MEMO_MANAGE, path: '/memos' },
  { permission: Permission.MEMO_DATA, path: '/memo-data' },
  { permission: Permission.SHARE_MANAGE, path: '/shares' },
  { permission: Permission.STATISTICS_VIEW, path: '/statistics' },
  { permission: Permission.ATTACHMENT_MANAGE, path: '/attachments' },
  { permission: Permission.SETTINGS_MANAGE, path: '/settings' },
  { permission: Permission.TENANT_DASHBOARD, path: '/tenant' },
  {
    permission: Permission.TENANT_MONITOR,
    path: '/tenant/monitor',
    hint: '经运维概览进入；侧栏默认不显示',
  },
  { permission: Permission.TENANT_LOGS, path: '/tenant/logs' },
  { permission: Permission.PROFILE_SELF, path: '/profile', hint: '必选' },
  {
    permission: Permission.MEMO_ISOLATE_PEERS,
    path: '',
    hint: '勾选后看不到其他子账号备忘录；默认本范围共享',
  },
  {
    permission: Permission.ATTACHMENT_ISOLATE_PEERS,
    path: '',
    hint: '勾选后看不到其他子账号文件；默认本范围共享',
  },
] as const

/**
 * @deprecated 已改为扁平 ASSIGNABLE_PERMISSION_ITEMS；保留兼容导出
 */
export const ASSIGNABLE_PERMISSION_GROUPS: readonly {
  title: string
  items: readonly { permission: Permission; hint: string }[]
}[] = [
  {
    title: '权限',
    items: ASSIGNABLE_PERMISSION_ITEMS.map(({ permission, hint }) => ({
      permission,
      hint: hint || '',
    })) as readonly { permission: Permission; hint: string }[],
  },
] as const

const ASSIGNABLE_SET = new Set<string>(MEMBER_ASSIGNABLE_PERMISSIONS)

/**
 * 旧包兼容抬升：曾用 memo_manage 涵盖数据/分享、tenant_monitor 涵盖日志
 * 仅补缺不删权；之后可按细权单独收回
 */
export function liftLegacyPermissions(
  permissions: readonly string[] | undefined | null
): string[] {
  const set = new Set<string>((permissions || []).map(String))
  if (set.has(Permission.MEMO_MANAGE)) {
    set.add(Permission.MEMO_DATA)
    set.add(Permission.SHARE_MANAGE)
  }
  if (set.has(Permission.TENANT_MONITOR)) {
    set.add(Permission.TENANT_LOGS)
  }
  return [...set]
}

/**
 * 规范化子账号权限：去掉 account_manage / 停用项、仅保留可分配项、强制 profile_self
 * 不做旧包抬升（抬升仅在 migrateIdentityData，避免保存时无法单独收回细权）
 */
export function normalizeMemberPermissions(
  permissions: readonly string[] | undefined | null
): Permission[] {
  const picked = new Set<Permission>()
  for (const raw of permissions || []) {
    if (raw === Permission.ACCOUNT_MANAGE) continue
    if (raw === Permission.TENANT_USERS) continue
    if (ASSIGNABLE_SET.has(raw)) picked.add(raw as Permission)
  }
  picked.add(Permission.PROFILE_SELF)
  return MEMBER_ASSIGNABLE_PERMISSIONS.filter((p) => picked.has(p))
}

/**
 * 按侧栏优先级解析登录/拒权后的落地路径
 */
export function resolveLandingPath(permissions: readonly string[]): string {
  const order: Array<[string, Permission]> = [
    ['/memos', Permission.MEMO_MANAGE],
    ['/statistics', Permission.STATISTICS_VIEW],
    ['/attachments', Permission.ATTACHMENT_MANAGE],
    ['/memo-data', Permission.MEMO_DATA],
    ['/shares', Permission.SHARE_MANAGE],
    ['/accounts', Permission.ACCOUNT_MANAGE],
    ['/tenant', Permission.TENANT_DASHBOARD],
    ['/tenant/logs', Permission.TENANT_LOGS],
    ['/settings', Permission.SETTINGS_MANAGE],
    ['/profile', Permission.PROFILE_SELF],
  ]
  for (const [path, need] of order) {
    if (permissions.includes(need)) return path
  }
  return '/profile'
}

/**
 * @deprecated R1 废止双身份后删除；迁移期内仅兼容 admins 表
 */
export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
}

/**
 * @deprecated R1 合并进 User(role=owner) + permissions；勿再作为种子权威
 */
export interface Admin {
  id: string
  username: string
  passwordHash: string
  role: AdminRole
  createdAt: Date
  lastLoginAt: Date
}

export interface SecurityQuestion {
  question: string
  answerHash: string
  /** 服务端 sanitize 后可能清空为 '' */
  answer?: string
}

/**
 * 统一用户（目标：单表 + role + tenantRootId）
 */
export interface User {
  id: string
  /** CYP 6 位数字身份（R6）；缺省时由服务端补齐 */
  digitalId?: string
  username: string
  passwordHash?: string
  /** 是否已设置登录密码（服务端 sanitize 后下发；禁止下发 hash） */
  hasPassword?: boolean
  token?: string
  securityQuestion?: SecurityQuestion
  gender?: string
  email?: string
  birthDate?: Date
  phone?: string
  address?: string
  position?: string
  company?: string
  bio?: string
  rememberPassword: boolean
  isMainAccount: boolean
  parentUserId?: string
  permissions: Permission[]
  createdAt: Date
  lastLoginAt: Date
  role?: UserRole
  tenantRootId?: string
}

export type Priority = 'low' | 'medium' | 'high'

export interface Memo {
  id: string
  userId: string
  title: string
  content: string
  tags: string[]
  priority?: Priority
  attachments: string[]
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
  creatorName?: string
  /** 允许 MCP 公开投影 */
  mcpPublic?: boolean
}

export interface MemoHistory {
  id: string
  memoId: string
  content: string
  timestamp: Date
}

export interface FileMetadata {
  id: string
  userId: string
  /** 上传者用户名（本范围共享文件库区分主/子账号） */
  uploaderUsername?: string
  filename: string
  size: number
  type: string
  memoId?: string | null
  /** 同时使用该文件的备忘录 id（可多条；由 attachments 汇总） */
  linkedMemoIds?: string[]
  uploadedAt: Date
  /** 允许 MCP 公开投影 */
  mcpPublic?: boolean
}

export interface ShareLink {
  id: string
  memoId: string
  userId: string
  /** 明文口令仅创建时短暂存在；列表/详情用 hasPassword */
  password?: string
  /** 是否设有访问密码（列表/详情接口返回，不回传明文） */
  hasPassword?: boolean
  expiresAt?: Date
  accessCount: number
  createdAt: Date
}

export interface AppSettings {
  isFirstTime: boolean
  welcomeCompleted: boolean
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  language: string
  autoCleanLogs: boolean
  logRetentionHours: number
  /** 账号注销/删除后自动清除该账号全部相关内容（备忘录、文件、分享等） */
  purgeRelatedOnAccountDelete: boolean
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: Date
  traceId?: string
  action?: string
  userId?: string
}

export interface StorageInfo {
  /**
   * 系统存储空间已用（服务器 dataDir 唯一根所在卷 · OS 探测）
   * 与文件库存储空间（accountUsed）分称，禁止混用
   */
  used: number
  /** 系统存储空间总量（同上卷） */
  total: number
  /** 系统存储空间可用（同上卷） */
  available: number
  /**
   * 文件库存储空间（本可见范围附件合计；默认主+子；隔离时仅本人）
   * 非整卷已用；须单独展示
   */
  accountUsed: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  code?: string
  message?: string
  timestamp?: string
  request_id?: string
  trace_id?: string
  errId?: string
  error?: {
    code: string
    message: string
  }
}

/**
 * 从现网字段推断目标 role（迁移辅助，非权威鉴权）
 */
export function inferUserRole(user: Pick<User, 'role' | 'isMainAccount'>): UserRole {
  if (user.role === 'owner' || user.role === 'member') {
    return user.role
  }
  return user.isMainAccount ? 'owner' : 'member'
}

/**
 * 解析租户根（缺省时 Owner=自身、Member=parent）
 */
export function resolveTenantRootId(
  user: Pick<User, 'id' | 'tenantRootId' | 'parentUserId' | 'isMainAccount' | 'role'>
): string {
  if (user.tenantRootId) {
    return user.tenantRootId
  }
  const role = inferUserRole(user)
  if (role === 'owner') {
    return user.id
  }
  return user.parentUserId || user.id
}
