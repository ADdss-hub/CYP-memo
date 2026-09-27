/**
 * CYP-memo 分享管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import { RemoteStorageAdapter } from '../storage/RemoteStorageAdapter'
import type { ShareLink, Memo } from '../types'
import { LogLevel } from '../types'
import { logManager } from './LogManager'

/**
 * 分享链接创建选项
 */
export interface ShareLinkOptions {
  memoId: string
  userId: string
  password?: string
  expiryDays?: number // 0 表示永久
}

/**
 * 分享访问结果
 */
export interface ShareAccessResult {
  success: boolean
  memo?: Memo
  requiresPassword?: boolean
  error?: string
}

/** 公开分享评论反馈 */
export type ShareCommentFeedback = 'helpful' | 'neutral' | 'improve'

export interface ShareCommentItem {
  id: string
  shareId: string
  authorName: string
  content: string
  feedback: ShareCommentFeedback
  createdAt: string
  replyContent?: string | null
  replyAt?: string | null
  replyBy?: string | null
}

/**
 * 分享管理器
 * 负责分享链接的创建、管理和访问控制
 * 通过存储管理器支持本地和远程存储
 */
export class ShareManager {
  private static instance: ShareManager

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ShareManager {
    if (!ShareManager.instance) {
      ShareManager.instance = new ShareManager()
    }
    return ShareManager.instance
  }

  /**
   * 生成唯一的分享 ID
   */
  private generateShareId(): string {
    const timestamp = Date.now().toString(36)
    const randomStr = Math.random().toString(36).substring(2, 15)
    return `${timestamp}-${randomStr}`
  }

  /**
   * 创建分享链接
   */
  async createShareLink(options: ShareLinkOptions): Promise<ShareLink> {
    try {
      // 可读即可分享：远程由服务端 guardMemoAccess（同租户）裁决；
      // 禁止客户端再卡「必须 memo.userId === 当前用户」（主账号无法分享子账号备忘录）
      const memo = await getStorage().getMemoById(options.memoId)
      if (!memo) {
        throw new Error('备忘录不存在或无权访问')
      }

      // 计算过期时间
      let expiresAt: Date | undefined
      if (options.expiryDays && options.expiryDays > 0) {
        expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + options.expiryDays)
      }

      // 创建分享链接（分享创建者记为当前用户；备忘录作者可为同租户其他用户）
      const shareLink: ShareLink = {
        id: this.generateShareId(),
        memoId: options.memoId,
        userId: options.userId,
        password: options.password,
        expiresAt,
        accessCount: 0,
        createdAt: new Date(),
      }

      // 保存到数据库
      await getStorage().createShare(shareLink)

      // 记录日志
      await logManager.log(LogLevel.INFO, `创建分享链接: ${shareLink.id}`, {
        memoId: options.memoId,
        userId: options.userId,
        hasPassword: !!options.password,
        expiryDays: options.expiryDays,
      })

      return shareLink
    } catch (error) {
      await logManager.error(error as Error, { action: 'createShareLink', options })
      throw error
    }
  }

  /**
   * 获取分享链接
   */
  async getShareLink(shareId: string): Promise<ShareLink | undefined> {
    try {
      return await getStorage().getShareById(shareId)
    } catch (error) {
      await logManager.error(error as Error, { action: 'getShareLink', shareId })
      throw error
    }
  }

  /**
   * 获取用户的所有分享链接
   */
  async getUserShareLinks(userId: string): Promise<ShareLink[]> {
    try {
      return await getStorage().getSharesByUserId(userId)
    } catch (error) {
      await logManager.error(error as Error, { action: 'getUserShareLinks', userId })
      throw error
    }
  }

  /**
   * 分享管理收件：登录用户查看自己分享下的访客评论与反馈
   */
  async listOwnerShareComments(userId: string): Promise<ShareCommentItem[]> {
    try {
      const storage = getStorage()
      if (!(storage instanceof RemoteStorageAdapter)) return []
      return await storage.listOwnerShareComments(userId)
    } catch (error) {
      await logManager.error(error as Error, { action: 'listOwnerShareComments', userId })
      throw error
    }
  }

  /** 分享主人回复访客评论 */
  async replyShareComment(
    shareId: string,
    commentId: string,
    content: string
  ): Promise<ShareCommentItem> {
    const storage = getStorage()
    if (!(storage instanceof RemoteStorageAdapter)) {
      throw new Error('当前模式不支持回复评论')
    }
    return await storage.replyShareComment(shareId, commentId, content)
  }

  /** 站内通知收件箱 */
  async listNotifications(userId: string, unreadOnly = false): Promise<{
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
    const storage = getStorage()
    if (!(storage instanceof RemoteStorageAdapter)) {
      return { items: [], unreadCount: 0 }
    }
    return await storage.listNotifications(userId, unreadOnly)
  }

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
    const storage = getStorage()
    if (!(storage instanceof RemoteStorageAdapter)) {
      return { items: [], unreadCount: 0 }
    }
    return await storage.waitNotifications(userId, since, timeoutMs)
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    const storage = getStorage()
    if (!(storage instanceof RemoteStorageAdapter)) return
    await storage.markNotificationRead(userId, notificationId)
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const storage = getStorage()
    if (!(storage instanceof RemoteStorageAdapter)) return 0
    return await storage.markAllNotificationsRead(userId)
  }

  /**
   * 获取备忘录的所有分享链接
   */
  async getMemoShareLinks(memoId: string): Promise<ShareLink[]> {
    try {
      return await getStorage().getSharesByMemoId(memoId)
    } catch (error) {
      await logManager.error(error as Error, { action: 'getMemoShareLinks', memoId })
      throw error
    }
  }

  /**
   * 验证分享链接是否有效
   */
  isShareLinkValid(shareLink: ShareLink): boolean {
    // 检查是否过期
    if (shareLink.expiresAt) {
      const now = new Date()
      if (now > new Date(shareLink.expiresAt)) {
        return false
      }
    }
    return true
  }

  /**
   * 访问分享链接
   */
  async accessShareLink(shareId: string, password?: string): Promise<ShareAccessResult> {
    try {
      const storage = getStorage()
      // 远程模式：走服务端公开接口（访客无需 Bearer，否则会被鉴权挡成「不存在」）
      if (storage instanceof RemoteStorageAdapter) {
        return await storage.accessPublicShare(shareId, password)
      }

      // 获取分享链接
      const shareLink = await this.getShareLink(shareId)
      if (!shareLink) {
        return {
          success: false,
          error: '分享链接不存在',
        }
      }

      // 检查是否过期
      if (!this.isShareLinkValid(shareLink)) {
        return {
          success: false,
          error: '分享链接已过期',
        }
      }

      // 检查密码
      if (shareLink.password) {
        if (!password) {
          return {
            success: false,
            requiresPassword: true,
            error: '需要输入访问密码',
          }
        }
        if (password !== shareLink.password) {
          // 记录失败的访问尝试
          await logManager.log(LogLevel.WARN, `分享链接密码错误: ${shareId}`, {
            shareId,
            timestamp: new Date(),
          })
          return {
            success: false,
            requiresPassword: true,
            error: '密码错误',
          }
        }
      }

      // 获取备忘录
      const memo = await getStorage().getMemoById(shareLink.memoId)
      if (!memo) {
        return {
          success: false,
          error: '备忘录不存在',
        }
      }

      // 增加访问计数
      await getStorage().updateShare(shareId, {
        accessCount: shareLink.accessCount + 1,
      })

      // 记录访问日志
      await logManager.log(LogLevel.INFO, `访问分享链接: ${shareId}`, {
        shareId,
        memoId: shareLink.memoId,
        accessCount: shareLink.accessCount + 1,
        timestamp: new Date(),
      })

      return {
        success: true,
        memo,
      }
    } catch (error) {
      await logManager.error(error as Error, { action: 'accessShareLink', shareId })
      return {
        success: false,
        error: '访问失败，请重试',
      }
    }
  }

  /**
   * 列出公开分享评论
   */
  async listShareComments(
    shareId: string,
    password?: string
  ): Promise<{ success: boolean; comments?: ShareCommentItem[]; requiresPassword?: boolean; error?: string }> {
    try {
      const storage = getStorage()
      if (!(storage instanceof RemoteStorageAdapter)) {
        return { success: true, comments: [] }
      }
      return await storage.listPublicShareComments(shareId, password)
    } catch (error) {
      await logManager.error(error as Error, { action: 'listShareComments', shareId })
      return { success: false, error: '加载评论失败，请重试' }
    }
  }

  /**
   * 发表公开分享评论（须带反馈）
   */
  async createShareComment(
    shareId: string,
    input: {
      content: string
      feedback: ShareCommentFeedback
      authorName?: string
      password?: string
    }
  ): Promise<{ success: boolean; comment?: ShareCommentItem; requiresPassword?: boolean; error?: string }> {
    try {
      const storage = getStorage()
      if (!(storage instanceof RemoteStorageAdapter)) {
        return { success: false, error: '当前模式不支持公开评论' }
      }
      return await storage.createPublicShareComment(shareId, input)
    } catch (error) {
      await logManager.error(error as Error, { action: 'createShareComment', shareId })
      const msg = error instanceof Error ? error.message : '发表评论失败，请重试'
      return { success: false, error: msg }
    }
  }

  /**
   * 撤销分享链接
   */
  async revokeShareLink(shareId: string, userId: string): Promise<void> {
    try {
      // 获取分享链接
      const shareLink = await this.getShareLink(shareId)
      if (!shareLink) {
        throw new Error('分享链接不存在')
      }

      // 验证所有权
      if (shareLink.userId !== userId) {
        throw new Error('无权撤销此分享链接')
      }

      // 删除分享链接
      await getStorage().deleteShare(shareId)

      // 记录日志
      await logManager.log(LogLevel.INFO, `撤销分享链接: ${shareId}`, {
        shareId,
        userId,
        memoId: shareLink.memoId,
      })
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'revokeShareLink',
        shareId,
        userId,
      })
      throw error
    }
  }

  /**
   * 批量撤销分享链接
   */
  async revokeShareLinks(shareIds: string[], userId: string): Promise<void> {
    try {
      for (const shareId of shareIds) {
        await this.revokeShareLink(shareId, userId)
      }
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'revokeShareLinks',
        shareIds,
        userId,
      })
      throw error
    }
  }

  /**
   * 清理过期的分享链接
   */
  async cleanExpiredShareLinks(): Promise<number> {
    try {
      const deletedCount = await getStorage().deleteExpiredShares()

      if (deletedCount > 0) {
        await logManager.log(LogLevel.INFO, `清理过期分享链接: ${deletedCount} 个`, {
          cleanedCount: deletedCount,
          timestamp: new Date(),
        })
      }

      return deletedCount
    } catch (error) {
      await logManager.error(error as Error, { action: 'cleanExpiredShareLinks' })
      throw error
    }
  }

  /**
   * 生成分享链接 URL
   * @param shareId 分享ID
   * @returns 完整的分享链接URL
   */
  generateShareUrl(shareId: string): string {
    // 获取当前页面的基础URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // 确保生成正确的分享链接格式
    return `${baseUrl}/share/${shareId}`
  }

  /**
   * 复制分享链接到剪贴板
   * 使用多种方式确保兼容性：
   * 1. 优先使用 navigator.clipboard API（需要安全上下文）
   * 2. 回退到 document.execCommand（兼容旧浏览器和非安全上下文）
   */
  async copyShareLinkToClipboard(shareId: string): Promise<boolean> {
    try {
      const url = this.generateShareUrl(shareId)
      
      // 方式1：尝试使用现代 Clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(url)
          return true
        } catch (clipboardError) {
          console.warn('Clipboard API 失败，尝试回退方案:', clipboardError)
        }
      }
      
      // 方式2：回退到 execCommand（兼容非安全上下文和旧浏览器）
      if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        try {
          const successful = document.execCommand('copy')
          document.body.removeChild(textArea)
          if (successful) {
            return true
          }
        } catch (execError) {
          document.body.removeChild(textArea)
          console.warn('execCommand 复制失败:', execError)
        }
      }
      
      // 所有方式都失败
      console.error('复制到剪贴板失败: 所有复制方式都不可用')
      return false
    } catch (error) {
      console.error('复制到剪贴板失败:', error)
      return false
    }
  }
}

// 导出单例实例
export const shareManager = ShareManager.getInstance()
