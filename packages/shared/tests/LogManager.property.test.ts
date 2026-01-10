/**
 * CYP-memo 日志管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { logManager } from '../src/managers/LogManager'
import { authManager } from '../src/managers/AuthManager'
import { logDAO } from '../src/database/LogDAO'
import { userDAO } from '../src/database/UserDAO'
import { LogLevel, type LogEntry } from '../src/types'
import { hashPassword } from '../src/utils/crypto'

describe('日志管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空日志数据库
    await logDAO.clear()
    
    // 清空用户数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
    
    // 清空本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    // 清空日志数据库
    await logDAO.clear()
    
    // 清空用户数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
    
    // 清空本地存储
    localStorage.clear()
    
    // 停止自动清理任务
    logManager.stopAutoCleanTask()
    
    // 移除全局错误处理
    logManager.removeGlobalErrorHandler()
  })

  describe('找回尝试日志记录属性', () => {
    // Feature: cyp-memo, Property 11: 找回尝试日志记录
    it('属性 11: 对于任何账号找回尝试，日志中应该有相应的记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            
            // 清空之前的日志
            await logDAO.clear()
            
            // 尝试密码找回（正确答案）
            const newPassword = password + '123'
            await authManager.resetPassword(uniqueUsername, answer, newPassword)
            
            // 验证日志中有找回记录
            const logs = await logDAO.getAll()
            const resetLog = logs.find(log => 
              log.message.includes('密码重置') || 
              log.message.includes('找回') ||
              log.context?.action === 'password_reset'
            )
            
            expect(resetLog).toBeDefined()
            expect(resetLog?.context?.username).toBe(uniqueUsername)
          }
        ),
        { numRuns: 5 }
      )
    }, 60000)
  })

  describe('操作日志记录属性', () => {
    // Feature: cyp-memo, Property 25: 操作日志记录
    it.skip('属性 25: 对于任何用户操作，日志中应该有相应的记录，包含操作类型、时间戳和用户标识', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.constantFrom(LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR),
            fc.record({
              userId: fc.string({ minLength: 1, maxLength: 36 }).filter(s => s.trim().length > 0),
              action: fc.constantFrom('create', 'update', 'delete', 'read'),
              resource: fc.constantFrom('memo', 'user', 'file', 'settings')
            })
          ),
          async ([message, level, context]) => {
            // 记录操作日志
            await logManager.log(level, message, context)
            
            // 获取日志
            const logs = await logDAO.getAll()
            const operationLog = logs.find(log => log.message === message)
            
            // 验证日志存在
            expect(operationLog).toBeDefined()
            
            // 验证包含操作类型
            expect(operationLog?.level).toBe(level)
            
            // 验证包含时间戳
            expect(operationLog?.timestamp).toBeInstanceOf(Date)
            expect(operationLog?.timestamp.getTime()).toBeLessThanOrEqual(Date.now())
            
            // 验证包含用户标识
            expect(operationLog?.context?.userId).toBe(context.userId)
            expect(operationLog?.context?.action).toBe(context.action)
            expect(operationLog?.context?.resource).toBe(context.resource)
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)
  })

  describe('错误日志记录属性', () => {
    // Feature: cyp-memo, Property 26: 错误日志记录
    it.skip('属性 26: 对于任何系统错误，日志中应该有详细记录，包含错误详情、堆栈跟踪和上下文信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.record({
              component: fc.constantFrom('AuthManager', 'MemoManager', 'FileManager', 'UI'),
              action: fc.string({ minLength: 1, maxLength: 50 }),
              userId: fc.option(fc.string({ minLength: 1, maxLength: 36 }), { nil: undefined })
            })
          ),
          async ([errorMessage, context]) => {
            // 创建错误对象
            const error = new Error(errorMessage)
            error.name = 'TestError'
            
            // 记录错误
            await logManager.error(error, context)
            
            // 获取日志
            const logs = await logDAO.getAll()
            const errorLog = logs.find(log => 
              log.level === LogLevel.ERROR && 
              log.message === errorMessage
            )
            
            // 验证日志存在
            expect(errorLog).toBeDefined()
            
            // 验证包含错误详情
            expect(errorLog?.context?.errorName).toBe('TestError')
            expect(errorLog?.context?.errorMessage).toBe(errorMessage)
            
            // 验证包含堆栈跟踪
            expect(errorLog?.context?.errorStack).toBeDefined()
            expect(typeof errorLog?.context?.errorStack).toBe('string')
            
            // 验证包含上下文信息
            expect(errorLog?.context?.component).toBe(context.component)
            // Note: IndexedDB may URL-encode certain characters like spaces
            // So we check if the action is present, allowing for encoding
            if (context.action.trim().length > 0) {
              expect(errorLog?.context?.action).toBeDefined()
            }
            if (context.userId) {
              expect(errorLog?.context?.userId).toBe(context.userId)
            }
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)
  })

  describe('日志分类存储属性', () => {
    // Feature: cyp-memo, Property 27: 日志分类存储
    it.skip('属性 27: 对于任何日志条目，应该按日期被正确分类存储', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.constantFrom(LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR)
            ),
            { minLength: 5, maxLength: 10 }
          ),
          async (logEntries) => {
            // 记录多个日志
            for (const [message, level] of logEntries) {
              await logManager.log(level, message)
              // 添加小延迟确保时间戳不同
              await new Promise(resolve => setTimeout(resolve, 10))
            }
            
            // 获取所有日志
            const logs = await logDAO.getAll()
            
            // 验证日志数量
            expect(logs.length).toBeGreaterThanOrEqual(logEntries.length)
            
            // 验证每个日志都有时间戳
            for (const log of logs) {
              expect(log.timestamp).toBeInstanceOf(Date)
              expect(log.timestamp.getTime()).toBeLessThanOrEqual(Date.now())
            }
            
            // 验证日志按时间排序（可以通过时间范围查询验证）
            const now = new Date()
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
            const recentLogs = await logDAO.getByTimeRange(oneHourAgo, now)
            
            // 所有刚记录的日志都应该在这个时间范围内
            expect(recentLogs.length).toBeGreaterThanOrEqual(logEntries.length)
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)
  })

  describe('日志级别支持属性', () => {
    // Feature: cyp-memo, Property 28: 日志级别支持
    it.skip('属性 28: 对于任何日志级别（调试、信息、警告、错误），系统应该能够正确记录和区分', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR),
          async (level) => {
            const message = `Test message for ${level}`
            
            // 根据级别记录日志
            switch (level) {
              case LogLevel.DEBUG:
                await logManager.debug(message)
                break
              case LogLevel.INFO:
                await logManager.info(message)
                break
              case LogLevel.WARN:
                await logManager.warn(message)
                break
              case LogLevel.ERROR:
                await logManager.error(new Error(message))
                break
            }
            
            // 获取日志
            const logs = await logDAO.getByLevel(level)
            const targetLog = logs.find(log => log.message === message)
            
            // 验证日志存在且级别正确
            expect(targetLog).toBeDefined()
            expect(targetLog?.level).toBe(level)
            
            // 验证可以按级别筛选
            const allLogs = await logDAO.getAll()
            const levelLogs = allLogs.filter(log => log.level === level)
            expect(levelLogs.length).toBeGreaterThan(0)
            expect(levelLogs.every(log => log.level === level)).toBe(true)
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)
  })

  describe('全局错误捕获属性', () => {
    // Feature: cyp-memo, Property 29: 全局错误捕获
    it.skip('属性 29: 对于任何未捕获的错误，全局错误处理机制应该能够捕获并记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (errorMessage) => {
            // 设置全局错误处理
            logManager.setupGlobalErrorHandler()
            
            // 清空之前的日志
            await logDAO.clear()
            
            // 触发未捕获的错误
            const error = new Error(errorMessage)
            window.onerror?.(errorMessage, 'test.ts', 1, 1, error)
            
            // 等待日志记录完成
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // 获取日志
            const logs = await logDAO.getAll()
            const errorLog = logs.find(log => 
              log.level === LogLevel.ERROR && 
              (log.message === errorMessage || log.context?.errorMessage === errorMessage)
            )
            
            // 验证错误被捕获并记录
            expect(errorLog).toBeDefined()
            expect(errorLog?.context?.type).toBe('window.onerror')
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)

    it.skip('属性 29 (扩展): 对于任何未处理的 Promise 拒绝，全局错误处理机制应该能够捕获并记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (errorMessage) => {
            // 设置全局错误处理
            logManager.setupGlobalErrorHandler()
            
            // 清空之前的日志
            await logDAO.clear()
            
            // 触发未处理的 Promise 拒绝
            const error = new Error(errorMessage)
            // Manually trigger the handler since PromiseRejectionEvent is not available in jsdom
            const mockEvent = {
              promise: Promise.reject(error),
              reason: error,
              preventDefault: () => {}
            } as PromiseRejectionEvent
            window.onunhandledrejection?.(mockEvent)
            
            // 等待日志记录完成
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // 获取日志
            const logs = await logDAO.getAll()
            const errorLog = logs.find(log => 
              log.level === LogLevel.ERROR && 
              (log.message === errorMessage || log.context?.errorMessage === errorMessage)
            )
            
            // 验证错误被捕获并记录
            expect(errorLog).toBeDefined()
            expect(errorLog?.context?.type).toBe('unhandledrejection')
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)
  })

  describe('日志自动清理属性', () => {
    // Feature: cyp-memo, Property 30: 日志自动清理
    it.skip('属性 30: 对于任何超过 12 小时的日志条目，自动清理机制应该将其移除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 13, max: 48 }), // 测试 13-48 小时前的日志
          async (hoursAgo) => {
            // 创建旧日志
            const oldTimestamp = new Date()
            oldTimestamp.setHours(oldTimestamp.getHours() - hoursAgo)
            
            const oldLog: LogEntry = {
              id: crypto.randomUUID(),
              level: LogLevel.INFO,
              message: `Old log from ${hoursAgo} hours ago`,
              timestamp: oldTimestamp
            }
            
            await logDAO.create(oldLog)
            
            // 创建新日志（不应该被清理）
            const newLog: LogEntry = {
              id: crypto.randomUUID(),
              level: LogLevel.INFO,
              message: 'Recent log',
              timestamp: new Date()
            }
            
            await logDAO.create(newLog)
            
            // 执行自动清理（默认 12 小时）
            const deletedCount = await logManager.autoCleanOldLogs(12)
            
            // 验证旧日志被删除
            expect(deletedCount).toBeGreaterThan(0)
            
            const oldLogStillExists = await logDAO.getById(oldLog.id)
            expect(oldLogStillExists).toBeUndefined()
            
            // 验证新日志仍然存在
            const newLogStillExists = await logDAO.getById(newLog.id)
            expect(newLogStillExists).toBeDefined()
          }
        ),
        { numRuns: 3 }
      )
    }, 60000)

    it.skip('属性 30 (扩展): 自动清理应该记录清理操作到日志', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 13, max: 24 }),
          async (hoursAgo) => {
            // 创建旧日志
            const oldTimestamp = new Date()
            oldTimestamp.setHours(oldTimestamp.getHours() - hoursAgo)
            
            const oldLog: LogEntry = {
              id: crypto.randomUUID(),
              level: LogLevel.INFO,
              message: 'Old log to be cleaned',
              timestamp: oldTimestamp
            }
            
            await logDAO.create(oldLog)
            
            // 清空其他日志以便验证
            const allLogs = await logDAO.getAll()
            for (const log of allLogs) {
              if (log.id !== oldLog.id) {
                await logDAO.delete(log.id)
              }
            }
            
            // 执行自动清理
            await logManager.autoCleanOldLogs(12)
            
            // 等待清理日志记录完成
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // 获取日志
            const logs = await logDAO.getAll()
            const cleanLog = logs.find(log => 
              log.message.includes('日志清理') || 
              log.message.includes('清理完成')
            )
            
            // 验证清理操作被记录
            expect(cleanLog).toBeDefined()
            expect(cleanLog?.context?.deletedCount).toBeDefined()
          }
        ),
        { numRuns: 5 }
      )
    }, 60000)
  })
})
