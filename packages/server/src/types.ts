/**
 * CYP-memo 服务器类型定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 管理员接口
 * @deprecated R1 兼容期；权威身份在 User(role=owner)
 */
export interface Admin {
  id: string
  username: string
  passwordHash: string
  role: 'admin' | 'super_admin'
  createdAt: string
  lastLoginAt: string | null
}

/**
 * 安全问题接口
 */
export interface SecurityQuestion {
  question: string
  answer: string
}

/** R1 统一角色 */
export type UserRole = 'owner' | 'member'

/** Owner 默认权限包（与 shared OWNER_DEFAULT_PERMISSIONS 同形） */
export const OWNER_DEFAULT_PERMISSIONS: readonly string[] = [
  'memo_manage',
  'memo_data',
  'share_manage',
  'statistics_view',
  'attachment_manage',
  'settings_manage',
  'account_manage',
  'tenant_dashboard',
  'tenant_users',
  'tenant_database',
  'tenant_monitor',
  'tenant_logs',
  'profile_self',
] as const

export const MEMBER_DEFAULT_PERMISSIONS: readonly string[] = ['profile_self'] as const

/** 子账号可分配权限（禁止 account_manage；tenant_users 已停用） */
export const MEMBER_ASSIGNABLE_PERMISSIONS: readonly string[] = [
  'memo_manage',
  'memo_data',
  'share_manage',
  'statistics_view',
  'attachment_manage',
  'settings_manage',
  'tenant_dashboard',
  'tenant_database',
  'tenant_monitor',
  'tenant_logs',
  'profile_self',
] as const

const MEMBER_ASSIGNABLE_SET = new Set(MEMBER_ASSIGNABLE_PERMISSIONS)

/** 旧包抬升：memo_manage→memo_data+share_manage；tenant_monitor→tenant_logs */
export function liftLegacyPermissions(
  permissions: readonly string[] | undefined | null
): string[] {
  const set = new Set<string>((permissions || []).map(String))
  if (set.has('memo_manage')) {
    set.add('memo_data')
    set.add('share_manage')
  }
  if (set.has('tenant_monitor')) {
    set.add('tenant_logs')
  }
  return [...set]
}

/** 规范化子账号权限：强制 profile_self，去掉 account_manage / tenant_users */
export function normalizeMemberPermissions(
  permissions: readonly string[] | undefined | null
): string[] {
  const picked = new Set<string>()
  for (const raw of permissions || []) {
    if (raw === 'account_manage') continue
    if (raw === 'tenant_users') continue
    if (MEMBER_ASSIGNABLE_SET.has(raw)) picked.add(raw)
  }
  picked.add('profile_self')
  return MEMBER_ASSIGNABLE_PERMISSIONS.filter((p) => picked.has(p))
}

/**
 * 用户接口（R1：role + tenantRootId）
 */
export interface User {
  id: string
  /** CYP 6 位数字身份（R6 CLN-02）；主键仍为 UUID id */
  digitalId: string
  username: string
  passwordHash: string | null
  token: string | null
  securityQuestion: SecurityQuestion | null
  gender: string | null
  email: string | null
  birthDate: string | null
  phone: string | null
  address: string | null
  position: string | null
  company: string | null
  bio: string | null
  rememberPassword: boolean
  isMainAccount: boolean
  parentUserId: string | null
  permissions: string[]
  createdAt: string
  lastLoginAt: string | null
  role: UserRole
  tenantRootId: string
}

/**
 * 用户创建参数
 */
export interface CreateUserParams {
  id?: string
  digitalId?: string | null
  username: string
  passwordHash?: string | null
  token?: string | null
  securityQuestion?: SecurityQuestion | null
  gender?: string | null
  email?: string | null
  birthDate?: string | null
  phone?: string | null
  address?: string | null
  position?: string | null
  company?: string | null
  bio?: string | null
  rememberPassword?: boolean
  isMainAccount?: boolean
  parentUserId?: string | null
  permissions?: string[]
  createdAt?: string
  lastLoginAt?: string | null
  role?: UserRole
  tenantRootId?: string | null
}

/**
 * 备忘录接口
 */
export interface Memo {
  id: string
  userId: string
  title: string | null
  content: string
  tags: string[]
  priority: string | null
  attachments: string[]
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 备忘录创建参数
 */
export interface CreateMemoParams {
  id?: string
  userId: string
  title?: string | null
  content?: string
  tags?: string[]
  priority?: string | null
  attachments?: string[]
  createdAt?: string
  updatedAt?: string
}

/**
 * 文件接口
 */
export interface FileRecord {
  id: string
  userId: string
  memoId: string | null
  filename: string
  mimeType: string
  size: number
  path: string
  createdAt: string
}

/**
 * 文件创建参数
 */
export interface CreateFileParams {
  id?: string
  userId: string
  memoId?: string | null
  filename: string
  mimeType: string
  size: number
  path: string
  createdAt?: string
}

/**
 * 分享链接接口
 */
export interface Share {
  id: string
  userId: string
  memoId: string
  shareCode: string
  /** bcrypt 哈希；公开访问时校验，勿下发给访客 */
  passwordHash?: string | null
  expiresAt: string | null
  viewCount: number
  createdAt: string
}

/**
 * 分享创建参数
 */
export interface CreateShareParams {
  id?: string
  userId: string
  memoId: string
  shareCode?: string
  passwordHash?: string | null
  expiresAt?: string | null
  viewCount?: number
  createdAt?: string
}

/** 公开分享评论反馈：有帮助 / 一般 / 需改进 */
export type ShareCommentFeedback = 'helpful' | 'neutral' | 'improve'

/**
 * 公开分享评论
 */
export interface ShareComment {
  id: string
  shareId: string
  authorName: string
  content: string
  feedback: ShareCommentFeedback
  createdAt: string
  /** 分享主人回复（可选） */
  replyContent?: string | null
  replyAt?: string | null
  replyBy?: string | null
}

/**
 * 公开分享评论创建参数
 */
export interface CreateShareCommentParams {
  id?: string
  shareId: string
  authorName?: string
  content: string
  feedback: ShareCommentFeedback
  createdAt?: string
}

/**
 * 日志接口
 */
export interface LogEntry {
  id: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  userId: string | null
  action: string | null
  details: string | null
  /** SIX-LOG / Trace 同信封 */
  traceId?: string | null
  createdAt: string
}

/**
 * 日志创建参数
 */
export interface CreateLogParams {
  id?: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  userId?: string | null
  action?: string | null
  details?: string | null
  /** SIX-LOG / Trace 同信封 */
  traceId?: string | null
  createdAt?: string
}

/**
 * 数据库统计信息
 */
export interface DatabaseStatistics {
  userCount: number
  memoCount: number
  fileCount: number
  shareCount: number
  logCount: number
}

/**
 * 用户删除结果
 */
export interface DeleteUserResult {
  memos: number
  files: number
  shares: number
  subAccounts: number
}

/**
 * 数据导出格式
 */
export interface ExportData {
  users: User[]
  memos: Memo[]
  files: FileRecord[]
  shares: Share[]
  logs: LogEntry[]
  settings: Record<string, string>
}
