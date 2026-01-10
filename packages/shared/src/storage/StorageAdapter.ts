/**
 * CYP-memo 存储适配器接口
 * 支持多种存储后端：IndexedDB（本地）、REST API（容器/NAS）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, Admin } from '../types'

/**
 * 存储模式
 */
export type StorageMode = 'local' | 'remote'

/**
 * 存储配置
 */
export interface StorageConfig {
  mode: StorageMode
  /** 远程 API 地址（仅 remote 模式需要） */
  apiUrl?: string
  /** API 密钥（可选） */
  apiKey?: string
}

/**
 * 文件 Blob 数据
 */
export interface FileBlob {
  id: string
  blob: Blob
}

/**
 * 查询选项
 */
export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDir?: 'asc' | 'desc'
}

/**
 * 存储适配器接口
 * 定义所有存储操作的统一接口
 */
export interface IStorageAdapter {
  /** 初始化存储 */
  initialize(): Promise<void>
  
  /** 获取存储模式 */
  getMode(): StorageMode

  // ========== 管理员操作 ==========
  createAdmin(admin: Admin): Promise<string>
  getAdminById(id: string): Promise<Admin | undefined>
  getAdminByUsername(username: string): Promise<Admin | undefined>
  getAllAdmins(): Promise<Admin[]>
  updateAdmin(id: string, updates: Partial<Admin>): Promise<number>
  deleteAdmin(id: string): Promise<void>
  adminUsernameExists(username: string): Promise<boolean>
  countAdmins(): Promise<number>
  adminLogin(username: string, password: string): Promise<Admin>

  // ========== 用户操作 ==========
  createUser(user: User): Promise<string>
  getUserById(id: string): Promise<User | undefined>
  getUserByUsername(username: string): Promise<User | undefined>
  getUserByToken(token: string): Promise<User | undefined>
  getAllUsers(): Promise<User[]>
  getSubAccounts(parentUserId: string): Promise<User[]>
  updateUser(id: string, updates: Partial<User>): Promise<number>
  deleteUser(id: string): Promise<void>
  usernameExists(username: string): Promise<boolean>
  tokenExists(token: string): Promise<boolean>

  // ========== 备忘录操作 ==========
  createMemo(memo: Memo): Promise<string>
  getMemoById(id: string): Promise<Memo | undefined>
  getMemosByUserId(userId: string, options?: QueryOptions): Promise<Memo[]>
  getDeletedMemos(userId: string): Promise<Memo[]>
  updateMemo(id: string, updates: Partial<Memo>): Promise<number>
  deleteMemo(id: string): Promise<void>
  searchMemos(userId: string, query: string): Promise<Memo[]>
  getMemosByTag(userId: string, tag: string): Promise<Memo[]>
  countMemos(userId: string): Promise<number>

  // ========== 备忘录历史 ==========
  createMemoHistory(history: MemoHistory): Promise<string>
  getMemoHistory(memoId: string): Promise<MemoHistory[]>
  deleteMemoHistory(memoId: string): Promise<void>

  // ========== 文件操作 ==========
  createFile(metadata: FileMetadata, blob: Blob): Promise<string>
  getFileById(id: string): Promise<FileMetadata | undefined>
  getFileBlob(id: string): Promise<Blob | undefined>
  getFilesByUserId(userId: string): Promise<FileMetadata[]>
  getFilesByMemoId(memoId: string): Promise<FileMetadata[]>
  updateFile(id: string, updates: Partial<FileMetadata>): Promise<number>
  deleteFile(id: string): Promise<void>
  getStorageUsed(userId: string): Promise<number>

  // ========== 分享链接 ==========
  createShare(share: ShareLink): Promise<string>
  getShareById(id: string): Promise<ShareLink | undefined>
  getSharesByUserId(userId: string): Promise<ShareLink[]>
  getSharesByMemoId(memoId: string): Promise<ShareLink[]>
  updateShare(id: string, updates: Partial<ShareLink>): Promise<number>
  deleteShare(id: string): Promise<void>
  deleteExpiredShares(): Promise<number>

  // ========== 日志操作 ==========
  createLog(log: LogEntry): Promise<string>
  getLogs(options?: QueryOptions): Promise<LogEntry[]>
  getLogsByLevel(level: string): Promise<LogEntry[]>
  deleteOldLogs(beforeDate: Date): Promise<number>
  clearLogs(): Promise<void>

  // ========== 设置操作 ==========
  getSetting<T>(key: string): Promise<T | undefined>
  setSetting<T>(key: string, value: T): Promise<void>
  getAllSettings(): Promise<Record<string, unknown>>

  // ========== 数据管理 ==========
  exportAllData(): Promise<string>
  importData(jsonData: string): Promise<void>
  clearAllData(): Promise<void>
  getStatistics(): Promise<{
    userCount: number
    memoCount: number
    fileCount: number
    shareCount: number
    logCount: number
  }>
}

/**
 * 存储适配器工厂函数类型
 */
export type StorageAdapterFactory = (config: StorageConfig) => IStorageAdapter
