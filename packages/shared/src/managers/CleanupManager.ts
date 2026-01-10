/**
 * CYP-memo 自动清理管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage, storageManager } from '../storage'
import { memoDAO } from '../database/MemoDAO'
import { logManager } from './LogManager'

/**
 * 清理配置接口
 */
export interface CleanupConfig {
  /** 已删除备忘录保留天数 */
  deletedMemoRetentionDays: number
  /** 日志保留小时数 */
  logRetentionHours: number
  /** 分享链接检查间隔（毫秒） */
  shareCheckInterval: number
  /** 自动清理间隔（毫秒） */
  autoCleanInterval: number
}

/**
 * 清理结果接口
 */
export interface CleanupResult {
  deletedMemosRemoved: number
  orphanedFilesRemoved: number
  expiredSharesRemoved: number
  oldLogsRemoved: number
}

/**
 * 自动清理管理器
 * 负责定期清理已删除数据、未使用附件、过期分享链接和旧日志
 * 通过存储管理器支持本地和远程存储
 */
export class CleanupManager {
  private cleanupTimer: number | null = null
  private config: CleanupConfig = {
    deletedMemoRetentionDays: 30, // 默认保留 30 天
    logRetentionHours: 12, // 默认保留 12 小时
    shareCheckInterval: 60 * 60 * 1000, // 1 小时
    autoCleanInterval: 60 * 60 * 1000, // 1 小时
  }

  /**
   * 设置清理配置
   */
  setConfig(config: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): CleanupConfig {
    return { ...this.config }
  }

  /**
   * 清理已删除的备忘录
   * @param olderThanDays 删除超过指定天数的备忘录
   * @returns Promise<number> 清理的备忘录数量
   */
  async cleanDeletedMemos(olderThanDays?: number): Promise<number> {
    const days = olderThanDays ?? this.config.deletedMemoRetentionDays

    try {
      const storage = storageManager.getAdapter()
      
      // 检查是否是远程存储模式
      if (storage.getMode() === 'remote' && 'cleanDeletedMemos' in storage) {
        // 远程模式：调用服务器端清理 API
        const result = await (storage as any).cleanDeletedMemos(days)
        if (result > 0) {
          await logManager.info('已删除备忘录清理完成', {
            action: 'cleanup_deleted_memos',
            removedCount: result,
          })
        }
        return result
      } else {
        // 本地模式：使用 DAO 清理
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const deletedMemos = await memoDAO.getDeletedMemos()
        let removedCount = 0
        
        for (const memo of deletedMemos) {
          if (memo.deletedAt && new Date(memo.deletedAt) < cutoffDate) {
            await memoDAO.permanentlyDelete(memo.id)
            removedCount++
          }
        }
        
        if (removedCount > 0) {
          await logManager.info('已删除备忘录清理完成', {
            action: 'cleanup_deleted_memos',
            removedCount,
          })
        }
        
        return removedCount
      }
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'cleanup_deleted_memos',
      })
      return 0
    }
  }

  /**
   * 清理未使用的附件
   * @returns Promise<number> 清理的文件数量
   */
  async cleanOrphanedFiles(): Promise<number> {
    try {
      const storage = storageManager.getAdapter()
      
      // 检查是否是远程存储模式
      if (storage.getMode() === 'remote' && 'cleanOrphanedFiles' in storage) {
        // 远程模式：调用服务器端清理 API
        const result = await (storage as any).cleanOrphanedFiles()
        if (result > 0) {
          await logManager.info('孤立文件清理完成', {
            action: 'cleanup_orphaned_files',
            removedCount: result,
          })
        }
        return result
      } else {
        // 本地模式：暂不支持，返回 0
        return 0
      }
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'cleanup_orphaned_files',
      })
      return 0
    }
  }

  /**
   * 清理过期的分享链接
   * @returns Promise<number> 清理的分享链接数量
   */
  async cleanExpiredShares(): Promise<number> {
    try {
      const removedCount = await getStorage().deleteExpiredShares()

      if (removedCount > 0) {
        await logManager.info('过期分享链接清理完成', {
          action: 'cleanup_expired_shares',
          removedCount,
        })
      }

      return removedCount
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'cleanup_expired_shares',
      })
      return 0
    }
  }

  /**
   * 清理旧日志
   * @param olderThanHours 删除超过指定小时数的日志
   * @returns Promise<number> 清理的日志数量
   */
  async cleanOldLogs(olderThanHours?: number): Promise<number> {
    const hours = olderThanHours ?? this.config.logRetentionHours
    return await logManager.autoCleanOldLogs(hours)
  }

  /**
   * 执行完整的清理任务
   * @returns Promise<CleanupResult> 清理结果
   */
  async performCleanup(): Promise<CleanupResult> {
    await logManager.info('开始执行自动清理任务', {
      action: 'cleanup_start',
    })

    const result: CleanupResult = {
      deletedMemosRemoved: 0,
      orphanedFilesRemoved: 0,
      expiredSharesRemoved: 0,
      oldLogsRemoved: 0,
    }

    try {
      const storage = storageManager.getAdapter()
      
      // 检查是否是远程存储模式且支持完整清理
      if (storage.getMode() === 'remote' && 'performCleanup' in storage) {
        // 远程模式：调用服务器端完整清理 API
        const remoteResult = await (storage as any).performCleanup(
          this.config.deletedMemoRetentionDays,
          this.config.logRetentionHours
        )
        result.deletedMemosRemoved = remoteResult.deletedMemosRemoved || 0
        result.orphanedFilesRemoved = remoteResult.orphanedFilesRemoved || 0
        result.expiredSharesRemoved = remoteResult.expiredSharesRemoved || 0
        result.oldLogsRemoved = remoteResult.oldLogsRemoved || 0
      } else {
        // 本地模式：逐个执行清理
        result.deletedMemosRemoved = await this.cleanDeletedMemos()
        result.orphanedFilesRemoved = await this.cleanOrphanedFiles()
        result.expiredSharesRemoved = await this.cleanExpiredShares()
        result.oldLogsRemoved = await this.cleanOldLogs()
      }
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'cleanup_error',
      })
    }

    await logManager.info('自动清理任务完成', {
      action: 'cleanup_complete',
      result,
    })

    return result
  }

  /**
   * 启动自动清理定时任务
   */
  startAutoCleanup(): void {
    // 如果已经有定时任务在运行，先停止
    if (this.cleanupTimer !== null) {
      this.stopAutoCleanup()
    }

    // 启动定时任务
    this.cleanupTimer = window.setInterval(() => {
      this.performCleanup().catch((error) => {
        logManager.error(error instanceof Error ? error : new Error(String(error)), {
          action: 'auto_cleanup_error',
        })
      })
    }, this.config.autoCleanInterval)

    logManager.info('自动清理定时任务已启动', {
      action: 'auto_cleanup_start',
      interval: this.config.autoCleanInterval,
    })
  }

  /**
   * 停止自动清理定时任务
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer !== null) {
      window.clearInterval(this.cleanupTimer)
      this.cleanupTimer = null

      logManager.info('自动清理定时任务已停止', {
        action: 'auto_cleanup_stop',
      })
    }
  }

  /**
   * 检查自动清理是否正在运行
   */
  isAutoCleanupRunning(): boolean {
    return this.cleanupTimer !== null
  }

  /**
   * 获取清理统计信息
   */
  async getCleanupStatistics(): Promise<{
    deletedMemosCount: number
    orphanedFilesCount: number
    expiredSharesCount: number
    oldLogsCount: number
  }> {
    // 注意：在远程模式下，此功能需要服务器端支持
    return {
      deletedMemosCount: 0,
      orphanedFilesCount: 0,
      expiredSharesCount: 0,
      oldLogsCount: 0,
    }
  }
}

/**
 * CleanupManager 单例实例
 */
export const cleanupManager = new CleanupManager()
