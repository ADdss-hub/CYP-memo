/**
 * CYP-memo 数据持久化管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { dataManager } from '../src/managers/DataManager'
import { db } from '../src/database/db'
import type { User, Memo } from '../src/types'

describe('DataManager', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.shares.clear()
    await db.logs.clear()
  })

  describe('exportToJSON', () => {
    it('应该导出所有数据为 JSON 字符串', async () => {
      // 创建测试数据
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '测试备忘录',
        content: '测试内容',
        tags: ['测试'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      // 导出数据
      const jsonString = await dataManager.exportToJSON()

      // 验证
      expect(jsonString).toBeTruthy()
      const data = JSON.parse(jsonString)
      expect(data.version).toBe('1.0.0')
      expect(data.users).toHaveLength(1)
      expect(data.memos).toHaveLength(1)
      expect(data.users[0].username).toBe('testuser')
      expect(data.memos[0].title).toBe('测试备忘录')
    })

    it('应该正确序列化和反序列化日期对象', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date('2025-01-01T00:00:00Z'),
        lastLoginAt: new Date('2025-01-02T00:00:00Z'),
      }
      await db.users.add(user)

      // 导出数据
      const jsonString = await dataManager.exportToJSON()
      
      // 验证 JSON 字符串包含日期的 ISO 格式
      expect(jsonString).toContain('2025-01-01T00:00:00.000Z')
      expect(jsonString).toContain('2025-01-02T00:00:00.000Z')
      
      // 清空数据库
      await db.users.clear()
      
      // 导入数据
      await dataManager.importFromJSON(jsonString, false)
      
      // 验证日期被正确恢复为 Date 对象
      const users = await db.users.toArray()
      expect(users[0].createdAt).toBeInstanceOf(Date)
      expect(users[0].lastLoginAt).toBeInstanceOf(Date)
      expect(users[0].createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z')
      expect(users[0].lastLoginAt.toISOString()).toBe('2025-01-02T00:00:00.000Z')
    })
  })

  describe('importFromJSON', () => {
    it('应该从 JSON 导入数据（覆盖模式）', async () => {
      // 创建现有数据
      const existingUser: User = {
        id: 'existing',
        username: 'existing',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(existingUser)

      // 准备导入数据
      const importData = {
        version: '1.0.0',
        exportedAt: '2025-01-01T00:00:00.000Z',
        users: [
          {
            id: 'user1',
            username: 'imported',
            passwordHash: 'hash123',
            rememberPassword: false,
            isMainAccount: true,
            permissions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            lastLoginAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        memos: [],
        files: [],
        shares: [],
        logs: [],
      }

      // 导入数据（覆盖模式）
      await dataManager.importFromJSON(JSON.stringify(importData), false)

      // 验证
      const users = await db.users.toArray()
      expect(users).toHaveLength(1)
      expect(users[0].username).toBe('imported')
    })

    it('应该从 JSON 导入数据（合并模式）', async () => {
      // 创建现有数据
      const existingUser: User = {
        id: 'existing',
        username: 'existing',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(existingUser)

      // 准备导入数据
      const importData = {
        version: '1.0.0',
        exportedAt: '2025-01-01T00:00:00.000Z',
        users: [
          {
            id: 'user1',
            username: 'imported',
            passwordHash: 'hash123',
            rememberPassword: false,
            isMainAccount: true,
            permissions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            lastLoginAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        memos: [],
        files: [],
        shares: [],
        logs: [],
      }

      // 导入数据（合并模式）
      await dataManager.importFromJSON(JSON.stringify(importData), true)

      // 验证
      const users = await db.users.toArray()
      expect(users).toHaveLength(2)
    })

    it('应该正确反序列化日期对象', async () => {
      const importData = {
        version: '1.0.0',
        exportedAt: '2025-01-03T00:00:00.000Z',
        users: [
          {
            id: 'user1',
            username: 'testuser',
            passwordHash: 'hash123',
            rememberPassword: false,
            isMainAccount: true,
            permissions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            lastLoginAt: '2025-01-02T00:00:00.000Z',
          },
        ],
        memos: [],
        files: [],
        shares: [],
        logs: [],
      }

      await dataManager.importFromJSON(JSON.stringify(importData), false)

      const users = await db.users.toArray()
      expect(users[0].createdAt).toBeInstanceOf(Date)
      expect(users[0].createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    })

    it('应该拒绝无效的 JSON 格式', async () => {
      await expect(
        dataManager.importFromJSON('invalid json', false)
      ).rejects.toThrow()
    })

    it('应该拒绝缺少版本信息的数据', async () => {
      const invalidData = {
        users: [],
        memos: [],
      }

      await expect(
        dataManager.importFromJSON(JSON.stringify(invalidData), false)
      ).rejects.toThrow('无效的数据格式')
    })
  })

  describe('recoverData', () => {
    it('应该恢复数据', async () => {
      const importData = {
        version: '1.0.0',
        exportedAt: '2025-01-01T00:00:00.000Z',
        users: [
          {
            id: 'user1',
            username: 'recovered',
            passwordHash: 'hash123',
            rememberPassword: false,
            isMainAccount: true,
            permissions: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            lastLoginAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        memos: [],
        files: [],
        shares: [],
        logs: [],
      }

      await dataManager.recoverData(JSON.stringify(importData))

      const users = await db.users.toArray()
      expect(users).toHaveLength(1)
      expect(users[0].username).toBe('recovered')
    })
  })

  describe('clearAllData', () => {
    it('应该清空所有数据', async () => {
      // 创建测试数据
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      // 清空数据
      await dataManager.clearAllData()

      // 验证
      const userCount = await db.users.count()
      const memoCount = await db.memos.count()
      expect(userCount).toBe(0)
      expect(memoCount).toBe(0)
    })
  })

  describe('validateDataIntegrity', () => {
    it('应该验证数据完整性（正常情况）', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      const isValid = await dataManager.validateDataIntegrity()
      expect(isValid).toBe(true)
    })

    it('应该检测孤立的备忘录', async () => {
      // 创建没有对应用户的备忘录
      const memo: Memo = {
        id: 'memo1',
        userId: 'nonexistent',
        title: '孤立备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      const isValid = await dataManager.validateDataIntegrity()
      expect(isValid).toBe(false)
    })
  })

  describe('getStatistics', () => {
    it('应该返回数据库统计信息', async () => {
      // 创建测试数据
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      const stats = await dataManager.getStatistics()
      expect(stats.userCount).toBe(1)
      expect(stats.memoCount).toBe(1)
      expect(stats.fileCount).toBe(0)
      expect(stats.shareCount).toBe(0)
    })
  })
})
