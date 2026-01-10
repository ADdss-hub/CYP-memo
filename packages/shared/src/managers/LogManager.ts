/**
 * CYP-memo 日志管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { logDAO, type LogFilter } from '../database/LogDAO'
import { LogLevel, type LogEntry } from '../types'
import { generateUUID } from '../utils/crypto'

/**
 * 全局错误上下文接口
 */
interface ErrorContext {
  component?: string
  action?: string
  userId?: string
  [key: string]: unknown
}

/**
 * 日志管理器
 * 负责日志记录、查询、清理和全局错误处理
 */
export class LogManager {
  private autoCleanInterval: number | null = null
  private readonly AUTO_CLEAN_INTERVAL_MS = 60 * 60 * 1000 // 1小时检查一次
  private readonly DEFAULT_RETENTION_HOURS = 12

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param context 上下文信息
   */
  async log(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
    const logEntry: LogEntry = {
      id: generateUUID(),
      level,
      message,
      context,
      timestamp: new Date(),
    }

    try {
      await logDAO.create(logEntry)
    } catch (error) {
      // 如果日志记录失败，输出到控制台
      console.error('Failed to save log:', error)
      console.log('Original log:', logEntry)
    }
  }

  /**
   * 记录调试日志
   */
  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * 记录信息日志
   */
  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.INFO, message, context)
  }

  /**
   * 记录警告日志
   */
  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.WARN, message, context)
  }

  /**
   * 记录错误
   * @param error 错误对象
   * @param context 上下文信息
   */
  async error(error: Error, context?: ErrorContext): Promise<void> {
    const errorContext: Record<string, unknown> = {
      ...context,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    }

    await this.log(LogLevel.ERROR, error.message, errorContext)
  }

  /**
   * 获取日志
   * @param filter 筛选条件
   * @returns Promise<LogEntry[]> 日志列表
   */
  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    if (filter) {
      return await logDAO.getByFilter(filter)
    }
    return await logDAO.getAll()
  }

  /**
   * 获取最近的日志
   * @param limit 数量限制
   * @returns Promise<LogEntry[]> 日志列表
   */
  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    return await logDAO.getRecent(limit)
  }

  /**
   * 清理日志
   * @param olderThan 删除此日期之前的日志
   * @returns Promise<number> 删除的日志数量
   */
  async cleanLogs(olderThan: Date): Promise<number> {
    const deletedCount = await logDAO.deleteOlderThan(olderThan)

    // 记录清理操作
    await this.info('日志清理完成', {
      deletedCount,
      olderThan: olderThan.toISOString(),
    })

    return deletedCount
  }

  /**
   * 导出日志
   * @returns Promise<Blob> 日志文件 Blob
   */
  async exportLogs(): Promise<Blob> {
    const logs = await logDAO.getAll()

    // 转换为 JSON 字符串
    const jsonString = JSON.stringify(logs, null, 2)

    // 创建 Blob
    const blob = new Blob([jsonString], { type: 'application/json' })

    // 记录导出操作
    await this.info('日志导出完成', {
      logCount: logs.length,
      exportTime: new Date().toISOString(),
    })

    return blob
  }

  /**
   * 自动清理旧日志（12小时以上）
   * @param retentionHours 保留时长（小时），默认12小时
   * @returns Promise<number> 删除的日志数量
   */
  async autoCleanOldLogs(retentionHours: number = this.DEFAULT_RETENTION_HOURS): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - retentionHours)

    const deletedCount = await this.cleanLogs(cutoffDate)

    return deletedCount
  }

  /**
   * 启动自动清理定时任务
   * @param retentionHours 保留时长（小时），默认12小时
   */
  startAutoCleanTask(retentionHours: number = this.DEFAULT_RETENTION_HOURS): void {
    // 如果已经有定时任务在运行，先停止
    if (this.autoCleanInterval !== null) {
      this.stopAutoCleanTask()
    }

    // 立即执行一次清理
    this.autoCleanOldLogs(retentionHours).catch((error) => {
      console.error('Auto clean logs failed:', error)
    })

    // 启动定时任务
    this.autoCleanInterval = window.setInterval(() => {
      this.autoCleanOldLogs(retentionHours).catch((error) => {
        console.error('Auto clean logs failed:', error)
      })
    }, this.AUTO_CLEAN_INTERVAL_MS)

    console.log(`日志自动清理任务已启动，保留时长: ${retentionHours}小时`)
  }

  /**
   * 停止自动清理定时任务
   */
  stopAutoCleanTask(): void {
    if (this.autoCleanInterval !== null) {
      clearInterval(this.autoCleanInterval)
      this.autoCleanInterval = null
      console.log('日志自动清理任务已停止')
    }
  }

  /**
   * 设置全局错误处理机制
   * 捕获所有未处理的错误和 Promise 拒绝
   */
  setupGlobalErrorHandler(): void {
    // 捕获未处理的 JavaScript 错误
    window.onerror = (message, source, lineno, colno, error) => {
      const errorObj = error || new Error(message as string)
      this.error(errorObj, {
        type: 'window.onerror',
        source,
        lineno,
        colno,
      }).catch(console.error)

      // 返回 true 阻止默认错误处理
      return true
    }

    // 捕获未处理的 Promise 拒绝
    window.onunhandledrejection = (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))

      this.error(error, {
        type: 'unhandledrejection',
        promise: event.promise,
      }).catch(console.error)

      // 阻止默认处理
      event.preventDefault()
    }

    console.log('全局错误处理机制已启动')
  }

  /**
   * 移除全局错误处理机制
   */
  removeGlobalErrorHandler(): void {
    window.onerror = null
    window.onunhandledrejection = null
    console.log('全局错误处理机制已移除')
  }

  /**
   * 获取日志统计信息
   * @returns Promise<Record<LogLevel, number>> 各级别日志数量
   */
  async getLogStats(): Promise<Record<LogLevel, number>> {
    return await logDAO.countByLevel()
  }

  /**
   * 清空所有日志
   */
  async clearAllLogs(): Promise<void> {
    await logDAO.clear()
    await this.info('所有日志已清空')
  }
}

/**
 * LogManager 单例实例
 */
export const logManager = new LogManager()
