/**
 * CYP-memo 远程存储适配器
 * 基于 REST API 实现，适用于本机与 NAS 远程环境
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, StorageInfo } from '../types'
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

  /** SIX-LOG：客户端错误上报取 Bearer（无则 undefined） */
  getAccessToken(): string | undefined {
    return this.apiKey
  }

  /** 会话恢复：写入 Bearer（刷新后从持久化配置回填） */
  setAccessToken(token: string | undefined): void {
    this.apiKey = token || undefined
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

    // R4 X-01：客户端→服务端 Trace 贯通
    const rid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
    headers['X-Request-Id'] = rid
    headers['X-Trace-Id'] = rid

    // 前端安全防护：写操作附带 Idempotency-Key（防重）
    const m = method.toUpperCase()
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      headers['Idempotency-Key'] = rid
    }

    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers,
      credentials: 'include',
      body: isFormData ? (body as FormData) : (body ? JSON.stringify(body) : undefined),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string
        code?: string
        error?: { message?: string; code?: string }
      }
      const msg =
        error.message ||
        error.error?.message ||
        `API 请求失败: ${response.status}`
      const code = error.code || error.error?.code
      const err = new Error(msg) as Error & { code?: string }
      if (code) err.code = code
      throw err
    }

    const result = (await response.json()) as ApiResponse<T> & {
      message?: string
      code?: string
    }

    if (!result.success) {
      const msg = result.message || result.error?.message || 'API 请求失败'
      const err = new Error(msg) as Error & { code?: string }
      if (result.code || result.error?.code) {
        err.code = result.code || result.error?.code
      }
      throw err
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

  // ========== 用户操作 ==========
  /**
   * 远程建用户：必须带明文 password，由服务端 bcrypt 哈希。
   * 禁止上传浏览器 PBKDF2 等非 bcrypt 的 passwordHash（登录侧只认 bcrypt）。
   */
  async createUser(user: User & { password?: string }): Promise<string> {
    const payload: Record<string, unknown> = { ...user }
    const plain =
      typeof (user as { password?: string }).password === 'string'
        ? String((user as { password?: string }).password)
        : ''

    if (plain) {
      payload.password = plain
      delete payload.passwordHash
    } else if (
      typeof user.passwordHash === 'string' &&
      /^\$2[aby]\$/.test(user.passwordHash)
    ) {
      payload.passwordHash = user.passwordHash
    } else {
      throw new Error(
        '创建用户须提供明文 password（服务端 bcrypt）；浏览器侧哈希与登录校验不兼容'
      )
    }

    const result = await this.request<{ id: string }>('POST', '/users', payload)
    return result.id
  }

  /**
   * R2：自助注册 Owner（走 /api/auth/register，禁止 POST /users 冒充）
   */
  async registerWithPassword(
    username: string,
    password: string,
    securityQuestion: { question: string; answerHash: string }
  ): Promise<User> {
    const result = await this.request<{ accessToken: string; user: User }>(
      'POST',
      '/auth/register',
      { username, password, securityQuestion }
    )
    this.apiKey = result.accessToken
    return { ...result.user, token: result.accessToken }
  }

  /**
   * R2：服务端验密登录，签发 Bearer（= users.token）
   */
  async loginWithPassword(
    username: string,
    password: string,
    challenge?: { challengeId?: string; challengeAnswer?: string }
  ): Promise<User> {
    const result = await this.request<{ accessToken: string; user: User }>(
      'POST',
      '/auth/login',
      {
        username,
        password,
        challengeId: challenge?.challengeId,
        challengeAnswer: challenge?.challengeAnswer,
      }
    )
    this.apiKey = result.accessToken
    return { ...result.user, token: result.accessToken }
  }

  /** 中风险挑战签发 */
  async fetchLoginChallenge(): Promise<{
    challengeId: string
    prompt: string
    expiresInSec: number
    type: string
  }> {
    return await this.request<{
      challengeId: string
      prompt: string
      expiresInSec: number
      type: string
    }>('GET', '/auth/challenge')
  }

  /**
   * R2：个人令牌登录
   */
  async loginWithToken(token: string): Promise<User> {
    const result = await this.request<{ accessToken: string; user: User }>(
      'POST',
      '/auth/login',
      { token }
    )
    this.apiKey = result.accessToken
    return { ...result.user, token: result.accessToken }
  }

  /** 账号恢复：取安全问题文案（不下发 hash） */
  async recoverGetQuestion(username: string): Promise<{ question: string }> {
    return await this.request<{ question: string }>('POST', '/auth/recover/question', {
      username,
    })
  }

  /** 账号恢复：校验密保答案 */
  async recoverVerifyAnswer(
    username: string,
    answer: string
  ): Promise<{ username: string; ok: boolean }> {
    return await this.request<{ username: string; ok: boolean }>('POST', '/auth/recover/verify', {
      username,
      answer,
    })
  }

  /** 账号恢复：令牌查用户名 */
  async recoverByToken(token: string): Promise<{ username: string }> {
    return await this.request<{ username: string }>('POST', '/auth/recover/by-token', { token })
  }

  /** 账号恢复：密保验证后重置密码 */
  async recoverResetPassword(
    username: string,
    answer: string,
    newPassword: string
  ): Promise<void> {
    await this.request<{ ok: boolean }>('POST', '/auth/recover/reset', {
      username,
      answer,
      newPassword,
    })
  }

  /** 账号恢复：令牌重置密码 */
  async recoverResetPasswordByToken(token: string, newPassword: string): Promise<void> {
    await this.request<{ ok: boolean }>('POST', '/auth/recover/reset-by-token', {
      token,
      newPassword,
    })
  }

  /** 已登录用户修改密码（服务端校验当前密码） */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request<{ changed: boolean }>('POST', '/auth/change-password', {
      currentPassword,
      newPassword,
    })
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

  /** 按租户根过滤用户（对齐 server getUsersByTenantRootId） */
  async getUsersByTenantRootId(tenantRootId: string): Promise<User[]> {
    const all = await this.getAllUsers()
    return all.filter((u) => u.tenantRootId === tenantRootId || u.id === tenantRootId)
  }

  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await this.request<User[]>('GET', `/users/${parentUserId}/sub-accounts`)
  }

  /**
   * 本租户可见备忘录（十权 memo_manage + 租户数据范围 · RBAC权限矩阵 · 唯一入口 GET /memos）
   */
  async getMemos(): Promise<Memo[]> {
    return await this.request<Memo[]>('GET', '/memos')
  }

  async updateUser(id: string, updates: Partial<User>): Promise<number> {
    const keys = Object.keys(updates)
    const selfSafe = new Set([
      'gender',
      'email',
      'birthDate',
      'phone',
      'address',
      'position',
      'company',
      'bio',
      'securityQuestion',
      'lastLoginAt',
      'rememberPassword',
    ])
    const onlySelfSafe =
      keys.length > 0 &&
      keys.every((k) => selfSafe.has(k)) &&
      !('permissions' in updates) &&
      !('role' in updates) &&
      !('passwordHash' in updates)

    if (onlySelfSafe) {
      await this.request<User>('PATCH', '/me', updates)
      return 1
    }

    await this.request<void>('PATCH', `/users/${id}`, updates)
    return 1
  }

  async deleteUser(id: string): Promise<void> {
    await this.request<void>('DELETE', `/users/${id}`)
  }

  /** 自助注销本账号（服务端按 purge 设置决定是否清内容） */
  async cancelOwnAccount(): Promise<{ message: string; purgeRelated: boolean }> {
    // 空对象 body：保证 Content-Type JSON 与防重中间件稳定解析
    const result = await this.request<{ message: string; purgeRelated: boolean }>(
      'POST',
      '/users/me/cancel-account',
      {}
    )
    return {
      message: result.message || '已注销本账号',
      purgeRelated: Boolean(result.purgeRelated),
    }
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
        credentials: 'include',
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
    const result = await this.request<{ accountUsed?: number }>(
      'GET',
      `/users/${userId}/storage`
    )
    // 仅文件库存储空间（主+子合计）；禁止回退到系统存储空间 used（R-010）
    return result.accountUsed ?? 0
  }

  async getStorageInfo(userId: string): Promise<StorageInfo> {
    const result = await this.request<{
      used: number
      total: number
      available: number
      accountUsed: number
    }>('GET', `/users/${userId}/storage`)
    return {
      used: result.used ?? 0,
      total: result.total ?? 0,
      available: result.available ?? 0,
      accountUsed: result.accountUsed ?? 0,
    }
  }

  // ========== 分享链接 ==========
  async createShare(share: ShareLink): Promise<string> {
    const result = await this.request<{ id: string }>('POST', '/shares', share)
    return result.id
  }

  /**
   * 公开访问分享（无需登录）
   * 对应 POST /api/public/shares/:id/access
   */
  async accessPublicShare(
    shareId: string,
    password?: string
  ): Promise<{
    success: boolean
    memo?: Memo
    requiresPassword?: boolean
    error?: string
  }> {
    return await this.request('POST', `/public/shares/${encodeURIComponent(shareId)}/access`, {
      password: password || undefined,
    })
  }

  /**
   * 公开列出分享评论
   * GET /api/public/shares/:id/comments
   */
  async listPublicShareComments(
    shareId: string,
    password?: string
  ): Promise<{
    success: boolean
    comments?: Array<{
      id: string
      shareId: string
      authorName: string
      content: string
      feedback: 'helpful' | 'neutral' | 'improve'
      createdAt: string
    }>
    requiresPassword?: boolean
    error?: string
  }> {
    const q =
      password && password.length > 0
        ? `?password=${encodeURIComponent(password)}`
        : ''
    return await this.request(
      'GET',
      `/public/shares/${encodeURIComponent(shareId)}/comments${q}`
    )
  }

  /**
   * 公开发表分享评论
   * POST /api/public/shares/:id/comments
   */
  async createPublicShareComment(
    shareId: string,
    input: {
      content: string
      feedback: 'helpful' | 'neutral' | 'improve'
      authorName?: string
      password?: string
    }
  ): Promise<{
    success: boolean
    comment?: {
      id: string
      shareId: string
      authorName: string
      content: string
      feedback: 'helpful' | 'neutral' | 'improve'
      createdAt: string
    }
    requiresPassword?: boolean
    error?: string
  }> {
    return await this.request('POST', `/public/shares/${encodeURIComponent(shareId)}/comments`, {
      content: input.content,
      feedback: input.feedback,
      authorName: input.authorName,
      password: input.password || undefined,
    })
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

  /**
   * 分享主人收件：该用户名下全部分享的访客评论
   * GET /api/users/:userId/share-comments
   */
  async listOwnerShareComments(userId: string): Promise<
    Array<{
      id: string
      shareId: string
      authorName: string
      content: string
      feedback: 'helpful' | 'neutral' | 'improve'
      createdAt: string
      replyContent?: string | null
      replyAt?: string | null
      replyBy?: string | null
    }>
  > {
    return await this.request('GET', `/users/${encodeURIComponent(userId)}/share-comments`)
  }

  async replyShareComment(
    shareId: string,
    commentId: string,
    content: string
  ): Promise<{
    id: string
    shareId: string
    authorName: string
    content: string
    feedback: 'helpful' | 'neutral' | 'improve'
    createdAt: string
    replyContent?: string | null
    replyAt?: string | null
    replyBy?: string | null
  }> {
    return await this.request(
      'POST',
      `/shares/${encodeURIComponent(shareId)}/comments/${encodeURIComponent(commentId)}/reply`,
      { content }
    )
  }

  async listNotifications(
    userId: string,
    unreadOnly = false
  ): Promise<{
    items: Array<{
      id: string
      channel: string
      templateId: string
      userId: string
      title: string
      body: string
      link?: string
      at: string
      readAt?: string | null
    }>
    unreadCount: number
  }> {
    const q = unreadOnly ? '?unreadOnly=1' : ''
    return await this.request('GET', `/users/${encodeURIComponent(userId)}/notifications${q}`)
  }

  /** 长轮询：有新通知立即返回 */
  async waitNotifications(
    userId: string,
    since: string,
    timeoutMs = 25000
  ): Promise<{
    items: Array<{
      id: string
      channel: string
      templateId: string
      userId: string
      title: string
      body: string
      link?: string
      at: string
      readAt?: string | null
    }>
    unreadCount: number
  }> {
    const q = `?since=${encodeURIComponent(since)}&timeoutMs=${encodeURIComponent(String(timeoutMs))}`
    return await this.request(
      'GET',
      `/users/${encodeURIComponent(userId)}/notifications/wait${q}`
    )
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    await this.request(
      'POST',
      `/users/${encodeURIComponent(userId)}/notifications/${encodeURIComponent(notificationId)}/read`
    )
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await this.request<{ marked: number }>(
      'POST',
      `/users/${encodeURIComponent(userId)}/notifications/read-all`
    )
    return result.marked
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

  async getLogs(options?: QueryOptions & { traceId?: string }): Promise<LogEntry[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    if (options?.traceId) params.set('traceId', options.traceId)

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

  async importData(jsonData: string, _options?: { merge?: boolean }): Promise<void> {
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
