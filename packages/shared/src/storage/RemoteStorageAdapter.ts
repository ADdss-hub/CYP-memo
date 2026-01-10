/**
 * CYP-memo 远程存储适配器
 * 基于 REST API 实现，适用于 NAS/容器环境
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, Admin } from '../types'
import type { IStorageAdapter, StorageMode, StorageConfig, QueryOptions } from './StorageAdapter'

/**
 * API 响应格式
 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * 远程存储适配器
 * 通过 REST API 与后端服务器通信
 */
export class RemoteStorageAdapter implements IStorageAdapter {
  private apiUrl: string
  private apiKey?: string
  private initialized = false

  constructor(config: StorageConfig) {
    if (!config.apiUrl) {
      throw new Error('远程存储模式需要配置 apiUrl')
    }
    this.apiUrl = config.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
    this.apiKey = config.apiKey
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    isFormData = false
  ): Promise<T> {
    const headers: Record<string, string> = {}
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    
    if (!isFormData) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers,
      body: isFormData ? (body as FormData) : (body ? JSON.stringify(body) : undefined),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(error.message || `API 请求失败: ${response.status}`)
    }

    const result: ApiResponse<T> = await response.json()
    
    if (!result.success) {
      throw new Error(result.error?.message || 'API 请求失败')
    }

    return result.data as T
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    
    // 测试 API 连接
    try {
      await this.request<{ status: string }>('GET', '/health')
      this.initialized = true
    } catch (error) {
      throw new Error(`无法连接到远程存储服务: ${error}`)
    }
  }

  getMode(): StorageMode {
    return 'remote'
  }

  // ========== 管理员操作 ==========
  async createAdmin(admin: Admin): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/admins', admin)
    return result.id
  }

  async getAdminById(id: string): Promise<Admin | undefined> {
    try {
      return await this.request<Admin>('GET', `/admins/${id}`)
    } catch {
      return undefined
    }
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    try {
      return await this.request<Admin>('GET', `/admins/by-username/${encodeURIComponent(username)}`)
    } catch {
      return undefined
    }
  }

  async getAllAdmins(): Promise<Admin[]> {
    return await this.request<Admin[]>('GET', '/admins')
  }

  async updateAdmin(id: string, updates: Partial<Admin>): Promise<number> {
    await this.request<void>('PATCH', `/admins/${id}`, updates)
    return 1
  }

  async deleteAdmin(id: string): Promise<void> {
    await this.request<void>('DELETE', `/admins/${id}`)
  }

  async adminUsernameExists(username: string): Promise<boolean> {
    const result = await this.request<{ exists: boolean }>(
      'GET',
      `/admins/check-username/${encodeURIComponent(username)}`
    )
    return result.exists
  }

  async countAdmins(): Promise<number> {
    const result = await this.request<{ count: number }>('GET', '/admins/count')
    return result.count
  }

  async adminLogin(username: string, password: string): Promise<Admin> {
    const admin = await this.request<Admin>('POST', '/admins/login', { username, password })
    return admin
  }

  // ========== 用户操作 ==========
  async createUser(user: User): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/users', user)
    return result.id
  }

  async getUserById(id: string): Promise<User | undefined> {
    try {
      return await this.request<User>('GET', `/users/${id}`)
    } catch {
      return undefined
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      return await this.request<User>('GET', `/users/by-username/${encodeURIComponent(username)}`)
    } catch {
      return undefined
    }
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    try {
      return await this.request<User>('GET', `/users/by-token/${encodeURIComponent(token)}`)
    } catch {
      return undefined
    }
  }

  async getAllUsers(): Promise<User[]> {
    return await this.request<User[]>('GET', '/users')
  }

  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await this.request<User[]>('GET', `/users/${parentUserId}/sub-accounts`)
  }

  async updateUser(id: string, updates: Partial<User>): Promise<number> {
    await this.request<void>('PATCH', `/users/${id}`, updates)
    return 1
  }

  async deleteUser(id: string): Promise<void> {
    await this.request<void>('DELETE', `/users/${id}`)
  }

  async usernameExists(username: string): Promise<boolean> {
    const result = await this.request<{ exists: boolean }>(
      'GET', 
      `/users/check-username/${encodeURIComponent(username)}`
    )
    return result.exists
  }

  async tokenExists(token: string): Promise<boolean> {
    const result = await this.request<{ exists: boolean }>(
      'GET',
      `/users/check-token/${encodeURIComponent(token)}`
    )
    return result.exists
  }

  // ========== 备忘录操作 ==========
  async createMemo(memo: Memo): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/memos', memo)
    return result.id
  }

  async getMemoById(id: string): Promise<Memo | undefined> {
    try {
      return await this.request<Memo>('GET', `/memos/${id}`)
    } catch {
      return undefined
    }
  }

  async getMemosByUserId(userId: string, options?: QueryOptions): Promise<Memo[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    if (options?.orderBy) params.set('orderBy', options.orderBy)
    if (options?.orderDir) params.set('orderDir', options.orderDir)
    
    const query = params.toString()
    return await this.request<Memo[]>('GET', `/users/${userId}/memos${query ? `?${query}` : ''}`)
  }

  async getDeletedMemos(userId: string): Promise<Memo[]> {
    return await this.request<Memo[]>('GET', `/users/${userId}/memos/deleted`)
  }

  async updateMemo(id: string, updates: Partial<Memo>): Promise<number> {
    await this.request<void>('PATCH', `/memos/${id}`, updates)
    return 1
  }

  async deleteMemo(id: string): Promise<void> {
    await this.request<void>('DELETE', `/memos/${id}`)
  }

  async searchMemos(userId: string, query: string): Promise<Memo[]> {
    return await this.request<Memo[]>(
      'GET',
      `/users/${userId}/memos/search?q=${encodeURIComponent(query)}`
    )
  }

  async getMemosByTag(userId: string, tag: string): Promise<Memo[]> {
    return await this.request<Memo[]>(
      'GET',
      `/users/${userId}/memos/by-tag/${encodeURIComponent(tag)}`
    )
  }

  async countMemos(userId: string): Promise<number> {
    const result = await this.request<{ count: number }>('GET', `/users/${userId}/memos/count`)
    return result.count
  }

  // ========== 备忘录历史 ==========
  async createMemoHistory(history: MemoHistory): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/memo-history', history)
    return result.id
  }

  async getMemoHistory(memoId: string): Promise<MemoHistory[]> {
    return await this.request<MemoHistory[]>('GET', `/memos/${memoId}/history`)
  }

  async deleteMemoHistory(memoId: string): Promise<void> {
    await this.request<void>('DELETE', `/memos/${memoId}/history`)
  }

  // ========== 文件操作 ==========
  async createFile(metadata: FileMetadata, blob: Blob): Promise<string> {
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    formData.append('file', blob, metadata.filename)
    
    const result = await this.request<{ id: string }>('POST', '/files', formData, true)
    return result.id
  }

  async getFileById(id: string): Promise<FileMetadata | undefined> {
    try {
      return await this.request<FileMetadata>('GET', `/files/${id}/metadata`)
    } catch {
      return undefined
    }
  }

  async getFileBlob(id: string): Promise<Blob | undefined> {
    try {
      const response = await fetch(`${this.apiUrl}/files/${id}/blob`, {
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
      })
      if (!response.ok) return undefined
      return await response.blob()
    } catch {
      return undefined
    }
  }

  async getFilesByUserId(userId: string): Promise<FileMetadata[]> {
    return await this.request<FileMetadata[]>('GET', `/users/${userId}/files`)
  }

  async getFilesByMemoId(memoId: string): Promise<FileMetadata[]> {
    return await this.request<FileMetadata[]>('GET', `/memos/${memoId}/files`)
  }

  async updateFile(id: string, updates: Partial<FileMetadata>): Promise<number> {
    await this.request<void>('PATCH', `/files/${id}`, updates)
    return 1
  }

  async deleteFile(id: string): Promise<void> {
    await this.request<void>('DELETE', `/files/${id}`)
  }

  async getStorageUsed(userId: string): Promise<number> {
    const result = await this.request<{ used: number }>('GET', `/users/${userId}/storage`)
    return result.used
  }

  // ========== 分享链接 ==========
  async createShare(share: ShareLink): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/shares', share)
    return result.id
  }

  async getShareById(id: string): Promise<ShareLink | undefined> {
    try {
      return await this.request<ShareLink>('GET', `/shares/${id}`)
    } catch {
      return undefined
    }
  }

  async getSharesByUserId(userId: string): Promise<ShareLink[]> {
    return await this.request<ShareLink[]>('GET', `/users/${userId}/shares`)
  }

  async getSharesByMemoId(memoId: string): Promise<ShareLink[]> {
    return await this.request<ShareLink[]>('GET', `/memos/${memoId}/shares`)
  }

  async updateShare(id: string, updates: Partial<ShareLink>): Promise<number> {
    await this.request<void>('PATCH', `/shares/${id}`, updates)
    return 1
  }

  async deleteShare(id: string): Promise<void> {
    await this.request<void>('DELETE', `/shares/${id}`)
  }

  async deleteExpiredShares(): Promise<number> {
    const result = await this.request<{ deleted: number }>('DELETE', '/cleanup/expired-shares')
    return result.deleted
  }

  /**
   * 清理已删除的备忘录
   */
  async cleanDeletedMemos(days: number = 30): Promise<number> {
    const result = await this.request<{ deleted: number }>('DELETE', `/cleanup/deleted-memos?days=${days}`)
    return result.deleted
  }

  /**
   * 清理孤立文件
   */
  async cleanOrphanedFiles(): Promise<number> {
    const result = await this.request<{ deleted: number }>('DELETE', '/cleanup/orphaned-files')
    return result.deleted
  }

  /**
   * 执行完整清理
   */
  async performCleanup(days: number = 30, hours: number = 12): Promise<{
    deletedMemosRemoved: number
    orphanedFilesRemoved: number
    expiredSharesRemoved: number
    oldLogsRemoved: number
  }> {
    return await this.request('POST', '/cleanup/perform', { days, hours })
  }

  // ========== 日志操作 ==========
  async createLog(log: LogEntry): Promise<string> {
    // 确保 timestamp 是 ISO 字符串格式
    const logData = {
      ...log,
      timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp
    }
    const result = await this.request<{ id: string }>('POST', '/logs', logData)
    return result.id
  }

  async getLogs(options?: QueryOptions): Promise<LogEntry[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    
    const query = params.toString()
    return await this.request<LogEntry[]>('GET', `/logs${query ? `?${query}` : ''}`)
  }

  async getLogsByLevel(level: string): Promise<LogEntry[]> {
    return await this.request<LogEntry[]>('GET', `/logs/by-level/${level}`)
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    const result = await this.request<{ deleted: number }>(
      'DELETE',
      `/logs/before/${beforeDate.toISOString()}`
    )
    return result.deleted
  }

  async clearLogs(): Promise<void> {
    await this.request<void>('DELETE', '/logs')
  }

  // ========== 设置操作 ==========
  async getSetting<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.request<{ value: T }>('GET', `/settings/${key}`)
      return result.value
    } catch {
      return undefined
    }
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.request<void>('PUT', `/settings/${key}`, { value })
  }

  async getAllSettings(): Promise<Record<string, unknown>> {
    return await this.request<Record<string, unknown>>('GET', '/settings')
  }

  // ========== 数据管理 ==========
  async exportAllData(): Promise<string> {
    return await this.request<string>('GET', '/data/export')
  }

  async importData(jsonData: string): Promise<void> {
    await this.request<void>('POST', '/data/import', { data: jsonData })
  }

  async clearAllData(): Promise<void> {
    await this.request<void>('DELETE', '/data/clear')
  }

  async getStatistics(): Promise<{
    userCount: number
    memoCount: number
    fileCount: number
    shareCount: number
    logCount: number
  }> {
    return await this.request('GET', '/data/statistics')
  }
}
