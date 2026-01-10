/**
 * CYP-memo 日志数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import type { LogEntry, LogLevel } from '../types'

/**
 * 日志筛选条件
 */
export interface LogFilter {
  level?: LogLevel
  startDate?: Date
  endDate?: Date
  limit?: number
}

/**
 * 日志数据访问对象
 * 提供日志数据的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class LogDAO {
  /**
   * 创建日志条目
   */
  async create(log: LogEntry): Promise<string> {
    return await getStorage().createLog(log)
  }

  /**
   * 根据 ID 获取日志
   */
  async getById(id: string): Promise<LogEntry | undefined> {
    const logs = await this.getAll()
    return logs.find((log) => log.id === id)
  }

  /**
   * 获取所有日志
   */
  async getAll(): Promise<LogEntry[]> {
    return await getStorage().getLogs()
  }

  /**
   * 根据级别获取日志
   */
  async getByLevel(level: LogLevel): Promise<LogEntry[]> {
    return await getStorage().getLogsByLevel(level)
  }

  /**
   * 根据时间范围获取日志
   */
  async getByTimeRange(startDate: Date, endDate: Date): Promise<LogEntry[]> {
    const logs = await this.getAll()
    return logs.filter(
      (log) => log.timestamp >= startDate && log.timestamp <= endDate
    )
  }

  /**
   * 根据筛选条件获取日志
   */
  async getByFilter(filter: LogFilter): Promise<LogEntry[]> {
    let logs = await this.getAll()

    // 按级别筛选
    if (filter.level) {
      logs = logs.filter((log) => log.level === filter.level)
    }

    // 按时间范围筛选
    if (filter.startDate && filter.endDate) {
      logs = logs.filter(
        (log) => log.timestamp >= filter.startDate! && log.timestamp <= filter.endDate!
      )
    } else if (filter.startDate) {
      logs = logs.filter((log) => log.timestamp >= filter.startDate!)
    } else if (filter.endDate) {
      logs = logs.filter((log) => log.timestamp <= filter.endDate!)
    }

    // 应用限制
    if (filter.limit) {
      logs = logs.slice(0, filter.limit)
    }

    return logs
  }

  /**
   * 获取最近的日志
   */
  async getRecent(limit: number): Promise<LogEntry[]> {
    const logs = await this.getAll()
    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  /**
   * 删除日志
   */
  async delete(id: string): Promise<void> {
    // 注意：远程存储适配器不支持单个日志删除
    throw new Error('不支持单个日志删除，请使用 deleteOlderThan 或 clear')
  }

  /**
   * 批量删除日志
   */
  async bulkDelete(ids: string[]): Promise<void> {
    // 注意：远程存储适配器不支持批量日志删除
    throw new Error('不支持批量日志删除，请使用 deleteOlderThan 或 clear')
  }

  /**
   * 删除指定时间之前的日志
   */
  async deleteOlderThan(date: Date): Promise<number> {
    return await getStorage().deleteOldLogs(date)
  }

  /**
   * 清空所有日志
   */
  async clear(): Promise<void> {
    await getStorage().clearLogs()
  }

  /**
   * 获取日志总数
   */
  async count(): Promise<number> {
    const logs = await this.getAll()
    return logs.length
  }

  /**
   * 按级别统计日志数量
   */
  async countByLevel(): Promise<Record<LogLevel, number>> {
    const logs = await this.getAll()
    const counts: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    }

    logs.forEach((log) => {
      counts[log.level]++
    })

    return counts
  }
}

/**
 * LogDAO 单例实例
 */
export const logDAO = new LogDAO()
