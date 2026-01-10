/**
 * CYP-memo 类型定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export enum Permission {
  MEMO_MANAGE = 'memo_manage',
  STATISTICS_VIEW = 'statistics_view',
  ATTACHMENT_MANAGE = 'attachment_manage',
  SETTINGS_MANAGE = 'settings_manage',
  ACCOUNT_MANAGE = 'account_manage',
}

/**
 * 系统管理员角色
 */
export enum AdminRole {
  SUPER_ADMIN = 'super_admin',  // 超级管理员，拥有所有权限
  ADMIN = 'admin',              // 普通管理员
}

/**
 * 系统管理员账号
 * 与普通用户账号完全分开
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
}

export interface User {
  id: string
  username: string
  passwordHash?: string
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
  /** 创建人用户名（用于主账号和子账号共享时显示） */
  creatorName?: string
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
  filename: string
  size: number
  type: string
  memoId?: string
  uploadedAt: Date
}

export interface ShareLink {
  id: string
  memoId: string
  userId: string
  password?: string
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
}

export interface StorageInfo {
  used: number
  total: number
  available: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}
