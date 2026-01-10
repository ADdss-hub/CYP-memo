/**
 * CYP-memo LogDAO 单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../src/database/db'
import { LogDAO } from '../src/database/LogDAO'
import type { LogEntry } from '../src/types'
import { LogLevel } from '../src/types'

describe('LogDAO', () => {
  let logDAO: LogDAO

  beforeEach(async () => {
    logDAO = new LogDAO()
    // Clear all data before each test
    await db.logs.clear()
  })

  afterEach(async () => {
    // Clean up after each test
    await db.logs.clear()
  })

  describe('CRUD 操作', () => {
    it('应该创建日志条目', async () => {
      const log: LogEntry = {
        id: 'log1',
        level: LogLevel.INFO,
        message: '测试日志',
        context: { action: 'test' },
        timestamp: new Date(),
      }

      const id = await logDAO.create(log)
      expect(id).toBe('log1')

      const retrieved = await logDAO.getById('log1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.message).toBe('测试日志')
    })

    it('应该根据 ID 获取日志', async () => {
      const log: LogEntry = {
        id: 'log2',
        level: LogLevel.DEBUG,
        message: '调试信息',
        timestamp: new Date(),
      }

      await logDAO.create(log)
      const retrieved = await logDAO.getById('log2')

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('log2')
      expect(retrieved?.level).toBe(LogLevel.DEBUG)
    })

    it('应该删除日志', async () => {
      const log: LogEntry = {
        id: 'log3',
        level: LogLevel.WARN,
        message: '警告信息',
        timestamp: new Date(),
      }

      await logDAO.create(log)
      await logDAO.delete('log3')

      const retrieved = await logDAO.getById('log3')
      expect(retrieved).toBeUndefined()
    })

    it('应该批量删除日志', async () => {
      const logs: LogEntry[] = [
        {
          id: 'log4',
          level: LogLevel.INFO,
          message: '信息1',
          timestamp: new Date(),
        },
        {
          id: 'log5',
          level: LogLevel.INFO,
          message: '信息2',
          timestamp: new Date(),
        },
      ]

      for (const log of logs) {
        await logDAO.create(log)
      }

      await logDAO.bulkDelete(['log4', 'log5'])

      const retrieved1 = await logDAO.getById('log4')
      const retrieved2 = await logDAO.getById('log5')

      expect(retrieved1).toBeUndefined()
      expect(retrieved2).toBeUndefined()
    })

    it('应该清空所有日志', async () => {
      const logs: LogEntry[] = [
        {
          id: 'log6',
          level: LogLevel.INFO,
          message: '信息1',
          timestamp: new Date(),
        },
        {
          id: 'log7',
          level: LogLevel.ERROR,
          message: '错误1',
          timestamp: new Date(),
        },
      ]

      for (const log of logs) {
        await logDAO.create(log)
      }

      await logDAO.clear()

      const count = await logDAO.count()
      expect(count).toBe(0)
    })
  })

  describe('查询和筛选', () => {
    beforeEach(async () => {
      // 创建测试数据
      const now = Date.now()
      const logs: LogEntry[] = [
        {
          id: 'log10',
          level: LogLevel.DEBUG,
          message: '调试信息1',
          timestamp: new Date(now - 4000),
        },
        {
          id: 'log11',
          level: LogLevel.INFO,
          message: '普通信息1',
          timestamp: new Date(now - 3000),
        },
        {
          id: 'log12',
          level: LogLevel.WARN,
          message: '警告信息1',
          timestamp: new Date(now - 2000),
        },
        {
          id: 'log13',
          level: LogLevel.ERROR,
          message: '错误信息1',
          context: { error: 'test error' },
          timestamp: new Date(now - 1000),
        },
        {
          id: 'log14',
          level: LogLevel.INFO,
          message: '普通信息2',
          timestamp: new Date(now),
        },
      ]

      for (const log of logs) {
        await logDAO.create(log)
      }
    })

    it('应该获取所有日志', async () => {
      const logs = await logDAO.getAll()

      expect(logs.length).toBe(5)
    })

    it('应该根据级别获取日志', async () => {
      const infoLogs = await logDAO.getByLevel(LogLevel.INFO)
      const errorLogs = await logDAO.getByLevel(LogLevel.ERROR)

      expect(infoLogs.length).toBe(2)
      expect(errorLogs.length).toBe(1)
      expect(infoLogs.every((log) => log.level === LogLevel.INFO)).toBe(true)
      expect(errorLogs[0].level).toBe(LogLevel.ERROR)
    })

    it('应该根据时间范围获取日志', async () => {
      const now = Date.now()
      const startDate = new Date(now - 3500)
      const endDate = new Date(now - 1500)

      const logs = await logDAO.getByTimeRange(startDate, endDate)

      expect(logs.length).toBe(2)
      expect(logs.map((l) => l.id)).toContain('log11')
      expect(logs.map((l) => l.id)).toContain('log12')
    })

    it('应该根据筛选条件获取日志（级别）', async () => {
      const logs = await logDAO.getByFilter({ level: LogLevel.WARN })

      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.WARN)
    })

    it('应该根据筛选条件获取日志（时间范围）', async () => {
      const now = Date.now()
      const logs = await logDAO.getByFilter({
        startDate: new Date(now - 3500),
        endDate: new Date(now - 1500),
      })

      expect(logs.length).toBe(2)
    })

    it('应该根据筛选条件获取日志（限制数量）', async () => {
      const logs = await logDAO.getByFilter({ limit: 3 })

      expect(logs.length).toBe(3)
    })

    it('应该获取最近的日志', async () => {
      const logs = await logDAO.getRecent(3)

      expect(logs.length).toBe(3)
      expect(logs[0].id).toBe('log14') // 最新
      expect(logs[2].id).toBe('log12')
    })

    it('应该删除指定时间之前的日志', async () => {
      const now = Date.now()
      const cutoffDate = new Date(now - 2500)

      const deletedCount = await logDAO.deleteOlderThan(cutoffDate)

      expect(deletedCount).toBe(2) // log10 和 log11

      const remaining = await logDAO.getAll()
      expect(remaining.length).toBe(3)
      expect(remaining.map((l) => l.id)).not.toContain('log10')
      expect(remaining.map((l) => l.id)).not.toContain('log11')
    })

    it('应该获取日志总数', async () => {
      const count = await logDAO.count()

      expect(count).toBe(5)
    })

    it('应该按级别统计日志数量', async () => {
      const counts = await logDAO.countByLevel()

      expect(counts[LogLevel.DEBUG]).toBe(1)
      expect(counts[LogLevel.INFO]).toBe(2)
      expect(counts[LogLevel.WARN]).toBe(1)
      expect(counts[LogLevel.ERROR]).toBe(1)
    })
  })
})
