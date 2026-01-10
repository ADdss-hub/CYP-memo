/**
 * CYP-memo 分享管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { shareManager } from '../src/managers/ShareManager'
import { userDAO } from '../src/database/UserDAO'
import { memoDAO } from '../src/database/MemoDAO'
import { logDAO } from '../src/database/LogDAO'
import { db } from '../src/database/db'
import { hashPassword } from '../src/utils/crypto'
import type { User, Memo, SecurityQuestion } from '../src/types'

// Mock LogManager with getInstance method
vi.mock('../src/managers/LogManager', async () => {
  const { logDAO } = await vi.importActual<typeof import('../src/database/LogDAO')>('../src/database/LogDAO')
  const { LogLevel } = await vi.importActual<typeof import('../src/types')>('../src/types')
  
  const generateId = () => `log-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  
  const mockInstance = {
    log: async (level: string, message: string, context?: Record<string, unknown>) => {
      const logLevel = level.toUpperCase() as keyof typeof LogLevel
      await logDAO.create({
        id: generateId(),
        level: LogLevel[logLevel],
        message,
        context,
        timestamp: new Date(),
      })
    },
    error: async (error: Error, context?: Record<string, unknown>) => {
      await logDAO.create({
        id: generateId(),
        level: LogLevel.ERROR,
        message: error.message,
        context: { ...context, stack: error.stack },
        timestamp: new Date(),
      })
    },
    info: async (message: string, context?: Record<string, unknown>) => {
      await logDAO.create({
        id: generateId(),
        level: LogLevel.INFO,
        message,
        context,
        timestamp: new Date(),
      })
    },
    warn: async (message: string, context?: Record<string, unknown>) => {
      await logDAO.create({
        id: generateId(),
        level: LogLevel.WARN,
        message,
        context,
        timestamp: new Date(),
      })
    },
    debug: async (message: string, context?: Record<string, unknown>) => {
      await logDAO.create({
        id: generateId(),
        level: LogLevel.DEBUG,
        message,
        context,
        timestamp: new Date(),
      })
    },
  }
  return {
    LogManager: {
      getInstance: () => mockInstance,
    },
    logManager: mockInstance,
  }
})

describe('分享管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空数据库
    await db.shares.clear()
    await db.memos.clear()
    await db.users.clear()
    await db.logs.clear()
  })

  afterEach(async () => {
    // 清空数据库
    await db.shares.clear()
    await db.memos.clear()
    await db.users.clear()
    await db.logs.clear()
  })

  // 辅助函数：创建测试用户
  async function createTestUser(username: string): Promise<User> {
    const passwordHash = await hashPassword('testpass123')
    const answerHash = await hashPassword('testanswer')
    const securityQuestion: SecurityQuestion = {
      question: 'test question',
      answerHash,
    }

    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      username,
      passwordHash,
      securityQuestion,
      rememberPassword: false,
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
    }

    await userDAO.create(user)
    return user
  }

  // 辅助函数：创建测试备忘录
  async function createTestMemo(userId: string, title: string, content: string): Promise<Memo> {
    const memo: Memo = {
      id: `memo_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId,
      title,
      content,
      tags: [],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await memoDAO.create(memo)
    return memo
  }

  describe('分享链接唯一性属性', () => {
    // Feature: cyp-memo, Property 43: 分享链接唯一性
    it('属性 43: 对于任何分享链接生成操作，生成的标识符应该是唯一的', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.integer({ min: 0, max: 30 }) // expiryDays
          ),
          async ([username, title, content, expiryDays]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建多个分享链接
            const shareLink1 = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays: expiryDays > 0 ? expiryDays : undefined,
            })

            const shareLink2 = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays: expiryDays > 0 ? expiryDays : undefined,
            })

            const shareLink3 = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays: expiryDays > 0 ? expiryDays : undefined,
            })

            // 验证所有分享链接 ID 都是唯一的
            expect(shareLink1.id).toBeDefined()
            expect(shareLink2.id).toBeDefined()
            expect(shareLink3.id).toBeDefined()
            expect(shareLink1.id).not.toBe(shareLink2.id)
            expect(shareLink1.id).not.toBe(shareLink3.id)
            expect(shareLink2.id).not.toBe(shareLink3.id)

            // 验证所有分享链接都能被独立检索
            const retrieved1 = await shareManager.getShareLink(shareLink1.id)
            const retrieved2 = await shareManager.getShareLink(shareLink2.id)
            const retrieved3 = await shareManager.getShareLink(shareLink3.id)

            expect(retrieved1).toBeDefined()
            expect(retrieved2).toBeDefined()
            expect(retrieved3).toBeDefined()
            expect(retrieved1!.id).toBe(shareLink1.id)
            expect(retrieved2!.id).toBe(shareLink2.id)
            expect(retrieved3!.id).toBe(shareLink3.id)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('分享链接过期验证属性', () => {
    // Feature: cyp-memo, Property 44: 分享链接过期验证
    it('属性 44: 对于任何过期的分享链接，访问时应该显示失效提示', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.option(fc.string({ minLength: 4, maxLength: 20 }), { nil: undefined }) // password
          ),
          async ([username, title, content, password]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建一个已过期的分享链接（设置过期时间为过去）
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              password,
              expiryDays: 1, // 先创建一个1天后过期的链接
            })

            // 手动修改过期时间为过去
            const pastDate = new Date()
            pastDate.setDate(pastDate.getDate() - 1) // 1天前
            await db.shares.update(shareLink.id, {
              expiresAt: pastDate,
            })

            // 尝试访问过期的分享链接
            const result = await shareManager.accessShareLink(shareLink.id, password)

            // 验证访问失败且提示过期
            expect(result.success).toBe(false)
            expect(result.error).toBe('分享链接已过期')
            expect(result.memo).toBeUndefined()

            // 验证 isShareLinkValid 也返回 false
            const updatedShareLink = await shareManager.getShareLink(shareLink.id)
            expect(updatedShareLink).toBeDefined()
            expect(shareManager.isShareLinkValid(updatedShareLink!)).toBe(false)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // 扩展测试：验证未过期的链接可以正常访问
    it('属性 44 (扩展): 对于任何未过期的分享链接，访问时应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.integer({ min: 1, max: 30 }) // expiryDays (未来)
          ),
          async ([username, title, content, expiryDays]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建一个未过期的分享链接
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays,
            })

            // 验证链接有效
            expect(shareManager.isShareLinkValid(shareLink)).toBe(true)

            // 尝试访问分享链接
            const result = await shareManager.accessShareLink(shareLink.id)

            // 验证访问成功
            expect(result.success).toBe(true)
            expect(result.memo).toBeDefined()
            expect(result.memo!.id).toBe(memo.id)
            expect(result.error).toBeUndefined()

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // 扩展测试：验证永久链接（无过期时间）始终有效
    it('属性 44 (扩展): 对于任何永久分享链接（无过期时间），访问时应该始终成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0)
          ),
          async ([username, title, content]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建一个永久分享链接（expiryDays = 0 或 undefined）
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays: 0, // 永久
            })

            // 验证链接有效
            expect(shareManager.isShareLinkValid(shareLink)).toBe(true)
            expect(shareLink.expiresAt).toBeUndefined()

            // 尝试访问分享链接
            const result = await shareManager.accessShareLink(shareLink.id)

            // 验证访问成功
            expect(result.success).toBe(true)
            expect(result.memo).toBeDefined()
            expect(result.memo!.id).toBe(memo.id)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('分享访问日志记录属性', () => {
    // Feature: cyp-memo, Property 45: 分享访问日志记录
    it('属性 45: 对于任何分享链接访问，日志中应该有访问记录，包含时间和访问者信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.option(fc.string({ minLength: 4, maxLength: 20 }), { nil: undefined }) // password
          ),
          async ([username, title, content, password]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建分享链接
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              password,
              expiryDays: 7,
            })

            // 记录访问前的日志数量
            const logsBefore = await logDAO.getAll()
            const logsBeforeCount = logsBefore.length

            // 访问分享链接
            const result = await shareManager.accessShareLink(shareLink.id, password)
            expect(result.success).toBe(true)

            // 等待日志写入
            await new Promise(resolve => setTimeout(resolve, 100))

            // 获取访问后的日志
            const logsAfter = await logDAO.getAll()
            expect(logsAfter.length).toBeGreaterThan(logsBeforeCount)

            // 查找访问日志
            const accessLog = logsAfter.find(log => 
              log.message.includes('访问分享链接') && 
              log.message.includes(shareLink.id)
            )

            // 验证日志存在
            expect(accessLog).toBeDefined()
            expect(accessLog!.level).toBe('info')
            
            // 验证日志包含必要信息
            expect(accessLog!.context).toBeDefined()
            expect(accessLog!.context!.shareId).toBe(shareLink.id)
            expect(accessLog!.context!.memoId).toBe(memo.id)
            expect(accessLog!.context!.timestamp).toBeDefined()
            expect(accessLog!.context!.accessCount).toBeDefined()

            // 验证访问计数增加
            const updatedShareLink = await shareManager.getShareLink(shareLink.id)
            expect(updatedShareLink!.accessCount).toBe(1)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // 扩展测试：验证多次访问都会记录日志
    it('属性 45 (扩展): 对于任何分享链接的多次访问，每次访问都应该有独立的日志记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.integer({ min: 2, max: 3 }) // 访问次数 (reduced from 5 to 3)
          ),
          async ([username, title, content, accessCount]) => {
            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建分享链接
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              expiryDays: 7,
            })

            // 多次访问分享链接
            for (let i = 0; i < accessCount; i++) {
              const result = await shareManager.accessShareLink(shareLink.id)
              expect(result.success).toBe(true)
              await new Promise(resolve => setTimeout(resolve, 50))
            }

            // 等待所有日志写入
            await new Promise(resolve => setTimeout(resolve, 200))

            // 获取所有日志
            const finalLogs = await logDAO.getAll()
            
            // 查找所有访问日志
            const accessLogs = finalLogs.filter(log => 
              log.message.includes('访问分享链接') && 
              log.message.includes(shareLink.id)
            )

            // 验证日志数量等于访问次数
            expect(accessLogs.length).toBe(accessCount)

            // 验证每个日志都有正确的访问计数
            accessLogs.forEach((log) => {
              expect(log.context).toBeDefined()
              expect(log.context!.shareId).toBe(shareLink.id)
              expect(log.context!.memoId).toBe(memo.id)
              expect(log.context!.accessCount).toBeGreaterThan(0)
            })

            // 验证最终访问计数
            const updatedShareLink = await shareManager.getShareLink(shareLink.id)
            expect(updatedShareLink!.accessCount).toBe(accessCount)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 } // Reduced from 100 to 20 to avoid timeout
      )
    }, 60000)

    // 扩展测试：验证密码错误的访问也会记录日志
    it('属性 45 (扩展): 对于任何密码错误的分享链接访问，日志中应该有警告记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 10, maxLength: 200 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 4, maxLength: 20 }), // correct password
            fc.string({ minLength: 4, maxLength: 20 })  // wrong password
          ),
          async ([username, title, content, correctPassword, wrongPassword]) => {
            // 确保密码不同
            if (correctPassword === wrongPassword) {
              wrongPassword = wrongPassword + 'x'
            }

            // 创建用户和备忘录
            const user = await createTestUser(username)
            const memo = await createTestMemo(user.id, title, content)

            // 创建带密码的分享链接
            const shareLink = await shareManager.createShareLink({
              memoId: memo.id,
              userId: user.id,
              password: correctPassword,
              expiryDays: 7,
            })

            // 记录访问前的日志数量
            const logsBefore = await logDAO.getAll()

            // 使用错误密码访问
            const result = await shareManager.accessShareLink(shareLink.id, wrongPassword)
            expect(result.success).toBe(false)
            expect(result.error).toBe('密码错误')

            // 等待日志写入
            await new Promise(resolve => setTimeout(resolve, 100))

            // 获取访问后的日志
            const logsAfter = await logDAO.getAll()
            expect(logsAfter.length).toBeGreaterThan(logsBefore.length)

            // 查找警告日志
            const warnLog = logsAfter.find(log => 
              log.level === 'warn' &&
              log.message.includes('分享链接密码错误') && 
              log.message.includes(shareLink.id)
            )

            // 验证警告日志存在
            expect(warnLog).toBeDefined()
            expect(warnLog!.context).toBeDefined()
            expect(warnLog!.context!.shareId).toBe(shareLink.id)
            expect(warnLog!.context!.timestamp).toBeDefined()

            // 验证访问计数没有增加（因为密码错误）
            const updatedShareLink = await shareManager.getShareLink(shareLink.id)
            expect(updatedShareLink!.accessCount).toBe(0)

            // 清理
            await memoDAO.delete(memo.id)
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })
})
