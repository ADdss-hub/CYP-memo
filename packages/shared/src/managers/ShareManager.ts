/**
 * CYP-memo 分享管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
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
      // 验证备忘录是否存在
      const memo = await getStorage().getMemoById(options.memoId)
      if (!memo) {
        throw new Error('备忘录不存在')
      }

      // 验证备忘录所有权
      if (memo.userId !== options.userId) {
        throw new Error('无权分享此备忘录')
      }

      // 计算过期时间
      let expiresAt: Date | undefined
      if (options.expiryDays && options.expiryDays > 0) {
        expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + options.expiryDays)
      }

      // 创建分享链接
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
   */
  async copyShareLinkToClipboard(shareId: string): Promise<boolean> {
    try {
      const url = this.generateShareUrl(shareId)
      await navigator.clipboard.writeText(url)
      return true
    } catch (error) {
      console.error('复制到剪贴板失败:', error)
      return false
    }
  }
}

// 导出单例实例
export const shareManager = ShareManager.getInstance()
