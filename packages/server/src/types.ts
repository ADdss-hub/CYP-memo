/**
 * CYP-memo 服务器类型定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 管理员接口
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

/**
 * 用户接口
 */
export interface User {
  id: string
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
}

/**
 * 用户创建参数
 */
export interface CreateUserParams {
  id?: string
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
  expiresAt?: string | null
  viewCount?: number
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
