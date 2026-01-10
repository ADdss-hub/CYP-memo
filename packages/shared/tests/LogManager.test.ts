/**
 * CYP-memo 日志管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logManager } from '../src/managers/LogManager'
import { logDAO } from '../src/database/LogDAO'
import { LogLevel, type LogEntry } from '../src/types'

describe('日志管理器单元测试', () => {
  beforeEach(async () => {
    // 清空日志数据库
    await logDAO.clear()
    // 清空本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    // 清空日志数据库
    await logDAO.clear()
    // 停止自动清理任务
    logManager.stopAutoCleanTask()
    // 移除全局错误处理
    logManager.removeGlobalErrorHandler()
  })

  describe('日志轮转测试', () => {
    it('应该能够清理指定时间之前的日志', async () => {
      // 创建不同时间的日志
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

      // 创建旧日志
      const oldLog1: LogEntry = {
        id: crypto.randomUUID(),
        level: LogLevel.INFO,
        message: '6小时前的日志',
        timestamp: sixHoursAgo
      }
      const oldLog2: LogEntry = {
        id: crypto.randomUUID(),
        level: LogLevel.INFO,
        message: '4小时前的日志',
        timestamp: fourHoursAgo
      }

      // 创建新日志
      const newLog: LogEntry = {
        id: crypto.randomUUID(),
        level: LogLevel.INFO,
        message: '2小时前的日志',
        timestamp: twoHoursAgo
      }

      await logDAO.create(oldLog1)
      await logDAO.create(oldLog2)
      await logDAO.create(newLog)

      // 清理 3 小时前的日志
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)
      const deletedCount = await logManager.cleanLogs(threeHoursAgo)

      // 验证删除了 2 条旧日志
      expect(deletedCount).toBe(2)

      // 验证旧日志被删除
      const remainingLogs = await logDAO.getAll()
      expect(remainingLogs.length).toBeGreaterThanOrEqual(1) // 至少有新日志和清理操作日志
      
      const oldLog1Exists = remainingLogs.find(log => log.id === oldLog1.id)
      const oldLog2Exists = remainingLogs.find(log => log.id === oldLog2.id)
      expect(oldLog1Exists).toBeUndefined()
      expect(oldLog2Exists).toBeUndefined()

      // 验证新日志仍然存在
      const newLogExists = remainingLogs.find(log => log.id === newLog.id)
      expect(newLogExists).toBeDefined()
    })

    it('应该在清理日志后记录清理操作', async () => {
      // 创建一些旧日志
      const oldTimestamp = new Date()
      oldTimestamp.setHours(oldTimestamp.getHours() - 24)

      for (let i = 0; i < 5; i++) {
        const oldLog: LogEntry = {
          id: crypto.randomUUID(),
          level: LogLevel.INFO,
          message: `旧日志 ${i}`,
          timestamp: oldTimestamp
        }
        await logDAO.create(oldLog)
      }

      // 清理日志
      const cutoffDate = new Date()
      cutoffDate.setHours(cutoffDate.getHours() - 12)
      await logManager.cleanLogs(cutoffDate)

      // 等待清理日志记录完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 验证清理操作被记录
      const logs = await logDAO.getAll()
      const cleanLog = logs.find(log => 
        log.message.includes('日志清理') && 
        log.level === LogLevel.INFO
      )

      expect(cleanLog).toBeDefined()
      expect(cleanLog?.context?.deletedCount).toBe(5)
      expect(cleanLog?.context?.olderThan).toBeDefined()
    })

    it('应该支持自动清理旧日志（默认12小时）', async () => {
      // 创建超过 12 小时的日志
      const oldTimestamp = new Date()
      oldTimestamp.setHours(oldTimestamp.getHours() - 15)

      const oldLog: LogEntry = {
        id: crypto.randomUUID(),
        level: LogLevel.INFO,
        message: '15小时前的日志',
        timestamp: oldTimestamp
      }
      await logDAO.create(oldLog)

      // 创建新日志
      await logManager.info('新日志')

      // 执行自动清理
      const deletedCount = await logManager.autoCleanOldLogs()

      // 验证旧日志被删除
      expect(deletedCount).toBeGreaterThan(0)

      const oldLogExists = await logDAO.getById(oldLog.id)
      expect(oldLogExists).toBeUndefined()
    })

    it('应该支持自定义保留时长的自动清理', async () => {
      // 创建 25 小时前的日志
      const oldTimestamp = new Date()
      oldTimestamp.setHours(oldTimestamp.getHours() - 25)

      const oldLog: LogEntry = {
        id: crypto.randomUUID(),
        level: LogLevel.INFO,
        message: '25小时前的日志',
        timestamp: oldTimestamp
      }
      await logDAO.create(oldLog)

      // 使用 24 小时保留时长清理
      const deletedCount = await logManager.autoCleanOldLogs(24)

      // 验证旧日志被删除
      expect(deletedCount).toBeGreaterThan(0)

      const oldLogExists = await logDAO.getById(oldLog.id)
      expect(oldLogExists).toBeUndefined()
    })

    it('应该能够启动和停止自动清理定时任务', async () => {
      // 使用 spy 监控 setInterval 和 clearInterval
      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      // 启动自动清理任务
      logManager.startAutoCleanTask(12)

      // 验证 setInterval 被调用
      expect(setIntervalSpy).toHaveBeenCalled()

      // 停止自动清理任务
      logManager.stopAutoCleanTask()

      // 验证 clearInterval 被调用
      expect(clearIntervalSpy).toHaveBeenCalled()

      // 恢复 spy
      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    })

    it('应该在启动新的自动清理任务前停止旧任务', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      // 启动第一个任务
      logManager.startAutoCleanTask(12)

      // 启动第二个任务（应该先停止第一个）
      logManager.startAutoCleanTask(24)

      // 验证 clearInterval 被调用（停止旧任务）
      expect(clearIntervalSpy).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })
  })

  describe('错误上下文记录测试', () => {
    it('应该记录错误的名称、消息和堆栈跟踪', async () => {
      // 创建一个错误
      const error = new Error('测试错误消息')
      error.name = 'TestError'

      // 记录错误
      await logManager.error(error)

      // 获取日志
      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      // 验证错误信息被正确记录
      expect(errorLog).toBeDefined()
      expect(errorLog?.message).toBe('测试错误消息')
      expect(errorLog?.context?.errorName).toBe('TestError')
      expect(errorLog?.context?.errorMessage).toBe('测试错误消息')
      expect(errorLog?.context?.errorStack).toBeDefined()
      expect(typeof errorLog?.context?.errorStack).toBe('string')
      expect((errorLog?.context?.errorStack as string).length).toBeGreaterThan(0)
    })

    it('应该记录错误的自定义上下文信息', async () => {
      const error = new Error('数据库连接失败')
      const context = {
        component: 'DatabaseManager',
        action: 'connect',
        userId: 'user-123',
        database: 'cyp-memo',
        retryCount: 3
      }

      // 记录带上下文的错误
      await logManager.error(error, context)

      // 获取日志
      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      // 验证上下文信息被正确记录
      expect(errorLog).toBeDefined()
      expect(errorLog?.context?.component).toBe('DatabaseManager')
      expect(errorLog?.context?.action).toBe('connect')
      expect(errorLog?.context?.userId).toBe('user-123')
      expect(errorLog?.context?.database).toBe('cyp-memo')
      expect(errorLog?.context?.retryCount).toBe(3)
    })

    it('应该记录包含特殊字符的错误上下文', async () => {
      const error = new Error('文件上传失败')
      const context = {
        component: 'FileManager',
        action: 'upload file',
        fileName: 'test file.txt',
        filePath: '/path/to/file',
        errorCode: 'FILE_TOO_LARGE'
      }

      await logManager.error(error, context)

      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      expect(errorLog).toBeDefined()
      expect(errorLog?.context?.component).toBe('FileManager')
      expect(errorLog?.context?.fileName).toBe('test file.txt')
      expect(errorLog?.context?.filePath).toBe('/path/to/file')
    })

    it('应该记录嵌套对象的错误上下文', async () => {
      const error = new Error('用户认证失败')
      const context = {
        component: 'AuthManager',
        action: 'login',
        user: {
          id: 'user-456',
          username: 'testuser',
          role: 'admin'
        },
        request: {
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        }
      }

      await logManager.error(error, context)

      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      expect(errorLog).toBeDefined()
      expect(errorLog?.context?.component).toBe('AuthManager')
      expect(errorLog?.context?.user).toBeDefined()
      expect((errorLog?.context?.user as Record<string, unknown>).id).toBe('user-456')
      expect((errorLog?.context?.user as Record<string, unknown>).username).toBe('testuser')
      expect(errorLog?.context?.request).toBeDefined()
      expect((errorLog?.context?.request as Record<string, unknown>).ip).toBe('192.168.1.1')
    })

    it('应该能够记录没有上下文的错误', async () => {
      const error = new Error('简单错误')

      await logManager.error(error)

      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      expect(errorLog).toBeDefined()
      expect(errorLog?.message).toBe('简单错误')
      expect(errorLog?.context?.errorName).toBe('Error')
      expect(errorLog?.context?.errorMessage).toBe('简单错误')
      expect(errorLog?.context?.errorStack).toBeDefined()
    })

    it('应该记录全局错误处理捕获的错误上下文', async () => {
      // 设置全局错误处理
      logManager.setupGlobalErrorHandler()

      // 清空之前的日志
      await logDAO.clear()

      // 模拟全局错误
      const error = new Error('全局错误')
      window.onerror?.('全局错误', 'app.ts', 42, 10, error)

      // 等待日志记录完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 获取日志
      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      // 验证错误上下文包含全局错误信息
      expect(errorLog).toBeDefined()
      expect(errorLog?.context?.type).toBe('window.onerror')
      expect(errorLog?.context?.source).toBe('app.ts')
      expect(errorLog?.context?.lineno).toBe(42)
      expect(errorLog?.context?.colno).toBe(10)
    })

    it('应该记录 Promise 拒绝的错误上下文', async () => {
      // 设置全局错误处理
      logManager.setupGlobalErrorHandler()

      // 清空之前的日志
      await logDAO.clear()

      // 模拟 Promise 拒绝
      const error = new Error('Promise 拒绝错误')
      const mockEvent = {
        promise: Promise.reject(error),
        reason: error,
        preventDefault: vi.fn()
      } as PromiseRejectionEvent
      window.onunhandledrejection?.(mockEvent)

      // 等待日志记录完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 获取日志
      const logs = await logDAO.getAll()
      const errorLog = logs.find(log => log.level === LogLevel.ERROR)

      // 验证错误上下文包含 Promise 拒绝信息
      expect(errorLog).toBeDefined()
      expect(errorLog?.context?.type).toBe('unhandledrejection')
      expect(errorLog?.context?.promise).toBeDefined()
      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })
  })

  describe('日志导出测试', () => {
    it('应该能够导出日志为 JSON 格式', async () => {
      // 创建一些日志
      await logManager.info('测试日志 1')
      await logManager.warn('测试日志 2')
      await logManager.error(new Error('测试错误'))

      // 导出日志
      const blob = await logManager.exportLogs()

      // 验证 Blob 类型
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('application/json')

      // 读取 Blob 内容
      const text = await blob.text()
      const logs = JSON.parse(text)

      // 验证导出的日志
      expect(Array.isArray(logs)).toBe(true)
      expect(logs.length).toBeGreaterThanOrEqual(3)
    })

    it('应该在导出日志后记录导出操作', async () => {
      // 创建一些日志
      await logManager.info('测试日志')

      // 清空之前的导出日志
      const beforeLogs = await logDAO.getAll()
      const exportLogsBefore = beforeLogs.filter(log => log.message.includes('日志导出'))
      
      // 导出日志
      await logManager.exportLogs()

      // 等待导出日志记录完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 获取日志
      const logs = await logDAO.getAll()
      const exportLog = logs.find(log => 
        log.message.includes('日志导出') && 
        log.level === LogLevel.INFO &&
        !exportLogsBefore.some(oldLog => oldLog.id === log.id)
      )

      expect(exportLog).toBeDefined()
      expect(exportLog?.context?.logCount).toBeDefined()
      expect(exportLog?.context?.exportTime).toBeDefined()
    })
  })

  describe('日志统计测试', () => {
    it('应该能够获取各级别日志的统计信息', async () => {
      // 创建不同级别的日志
      await logManager.debug('调试日志')
      await logManager.info('信息日志 1')
      await logManager.info('信息日志 2')
      await logManager.warn('警告日志')
      await logManager.error(new Error('错误日志'))

      // 获取统计信息
      const stats = await logManager.getLogStats()

      // 验证统计信息
      expect(stats[LogLevel.DEBUG]).toBeGreaterThanOrEqual(1)
      expect(stats[LogLevel.INFO]).toBeGreaterThanOrEqual(2)
      expect(stats[LogLevel.WARN]).toBeGreaterThanOrEqual(1)
      expect(stats[LogLevel.ERROR]).toBeGreaterThanOrEqual(1)
    })
  })
})
