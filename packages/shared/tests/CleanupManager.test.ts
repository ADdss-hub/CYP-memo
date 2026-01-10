/**
 * CYP-memo 自动清理管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanupManager } from '../src/managers/CleanupManager'
import { db } from '../src/database/db'
import type { Memo, FileMetadata, ShareLink, User } from '../src/types'

describe('CleanupManager', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.users.clear()
    await db.memos.clear()
    await db.memoHistory.clear()
    await db.files.clear()
    await db.fileBlobs.clear()
    await db.shares.clear()
    await db.logs.clear()

    // 停止自动清理
    cleanupManager.stopAutoCleanup()
  })

  afterEach(() => {
    // 确保停止自动清理
    cleanupManager.stopAutoCleanup()
  })

  describe('setConfig and getConfig', () => {
    it('应该设置和获取配置', () => {
      cleanupManager.setConfig({
        deletedMemoRetentionDays: 7,
        logRetentionHours: 24,
      })

      const config = cleanupManager.getConfig()
      expect(config.deletedMemoRetentionDays).toBe(7)
      expect(config.logRetentionHours).toBe(24)
    })
  })

  describe('cleanDeletedMemos', () => {
    it('应该清理超过保留期的已删除备忘录', async () => {
      // 创建用户
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      // 创建旧的已删除备忘录（35 天前）
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 35)

      const oldMemo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '旧备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: oldDate,
        updatedAt: oldDate,
        deletedAt: oldDate,
      }
      await db.memos.add(oldMemo)

      // 创建新的已删除备忘录（10 天前）
      const recentDate = new Date()
      recentDate.setDate(recentDate.getDate() - 10)

      const recentMemo: Memo = {
        id: 'memo2',
        userId: 'user1',
        title: '新备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: recentDate,
        updatedAt: recentDate,
        deletedAt: recentDate,
      }
      await db.memos.add(recentMemo)

      // 执行清理（保留 30 天，所以只有 35 天前的会被删除）
      const removedCount = await cleanupManager.cleanDeletedMemos(30)

      // 验证
      expect(removedCount).toBe(1)
      const remainingMemos = await db.memos.toArray()
      expect(remainingMemos).toHaveLength(1)
      expect(remainingMemos[0].id).toBe('memo2')
    })

    it('应该不清理未删除的备忘录', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
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
        title: '正常备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      const removedCount = await cleanupManager.cleanDeletedMemos()

      expect(removedCount).toBe(0)
      const memos = await db.memos.toArray()
      expect(memos).toHaveLength(1)
    })
  })

  describe('cleanOrphanedFiles', () => {
    it('应该清理未被引用的文件', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      // 创建备忘录
      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '备忘录',
        content: '内容',
        tags: [],
        attachments: ['file1'], // 只引用 file1
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      // 创建被引用的文件
      const referencedFile: FileMetadata = {
        id: 'file1',
        userId: 'user1',
        filename: 'referenced.txt',
        size: 100,
        type: 'text/plain',
        memoId: 'memo1',
        uploadedAt: new Date(),
      }
      await db.files.add(referencedFile)

      // 创建孤立文件
      const orphanedFile: FileMetadata = {
        id: 'file2',
        userId: 'user1',
        filename: 'orphaned.txt',
        size: 100,
        type: 'text/plain',
        uploadedAt: new Date(),
      }
      await db.files.add(orphanedFile)

      // 执行清理
      const removedCount = await cleanupManager.cleanOrphanedFiles()

      // 验证
      expect(removedCount).toBe(1)
      const remainingFiles = await db.files.toArray()
      expect(remainingFiles).toHaveLength(1)
      expect(remainingFiles[0].id).toBe('file1')
    })

    it('应该不清理被引用的文件', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
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
        title: '备忘录',
        content: '内容',
        tags: [],
        attachments: ['file1', 'file2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.memos.add(memo)

      const file1: FileMetadata = {
        id: 'file1',
        userId: 'user1',
        filename: 'file1.txt',
        size: 100,
        type: 'text/plain',
        memoId: 'memo1',
        uploadedAt: new Date(),
      }
      await db.files.add(file1)

      const file2: FileMetadata = {
        id: 'file2',
        userId: 'user1',
        filename: 'file2.txt',
        size: 100,
        type: 'text/plain',
        memoId: 'memo1',
        uploadedAt: new Date(),
      }
      await db.files.add(file2)

      const removedCount = await cleanupManager.cleanOrphanedFiles()

      expect(removedCount).toBe(0)
      const files = await db.files.toArray()
      expect(files).toHaveLength(2)
    })
  })

  describe('cleanExpiredShares', () => {
    it('应该清理过期的分享链接', async () => {
      // 创建过期的分享链接
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1) // 昨天过期

      const expiredShare: ShareLink = {
        id: 'share1',
        memoId: 'memo1',
        userId: 'user1',
        expiresAt: expiredDate,
        accessCount: 0,
        createdAt: new Date(),
      }
      await db.shares.add(expiredShare)

      // 创建未过期的分享链接
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7) // 7 天后过期

      const validShare: ShareLink = {
        id: 'share2',
        memoId: 'memo2',
        userId: 'user1',
        expiresAt: futureDate,
        accessCount: 0,
        createdAt: new Date(),
      }
      await db.shares.add(validShare)

      // 执行清理
      const removedCount = await cleanupManager.cleanExpiredShares()

      // 验证
      expect(removedCount).toBe(1)
      const remainingShares = await db.shares.toArray()
      expect(remainingShares).toHaveLength(1)
      expect(remainingShares[0].id).toBe('share2')
    })

    it('应该不清理永久分享链接', async () => {
      const permanentShare: ShareLink = {
        id: 'share1',
        memoId: 'memo1',
        userId: 'user1',
        // 没有 expiresAt，表示永久
        accessCount: 0,
        createdAt: new Date(),
      }
      await db.shares.add(permanentShare)

      const removedCount = await cleanupManager.cleanExpiredShares()

      expect(removedCount).toBe(0)
      const shares = await db.shares.toArray()
      expect(shares).toHaveLength(1)
    })
  })

  describe('performCleanup', () => {
    it('应该执行完整的清理任务', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      // 创建旧的已删除备忘录
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 35)

      const oldMemo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '旧备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: oldDate,
        updatedAt: oldDate,
        deletedAt: oldDate,
      }
      await db.memos.add(oldMemo)

      // 创建孤立文件
      const orphanedFile: FileMetadata = {
        id: 'file1',
        userId: 'user1',
        filename: 'orphaned.txt',
        size: 100,
        type: 'text/plain',
        uploadedAt: new Date(),
      }
      await db.files.add(orphanedFile)

      // 创建过期分享链接
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      const expiredShare: ShareLink = {
        id: 'share1',
        memoId: 'memo1',
        userId: 'user1',
        expiresAt: expiredDate,
        accessCount: 0,
        createdAt: new Date(),
      }
      await db.shares.add(expiredShare)

      // 执行清理
      const result = await cleanupManager.performCleanup()

      // 验证
      expect(result.deletedMemosRemoved).toBe(1)
      expect(result.orphanedFilesRemoved).toBe(1)
      expect(result.expiredSharesRemoved).toBe(1)
    })
  })

  describe('startAutoCleanup and stopAutoCleanup', () => {
    it('应该启动和停止自动清理', () => {
      expect(cleanupManager.isAutoCleanupRunning()).toBe(false)

      cleanupManager.startAutoCleanup()
      expect(cleanupManager.isAutoCleanupRunning()).toBe(true)

      cleanupManager.stopAutoCleanup()
      expect(cleanupManager.isAutoCleanupRunning()).toBe(false)
    })

    it('应该在已运行时重启自动清理', () => {
      cleanupManager.startAutoCleanup()
      expect(cleanupManager.isAutoCleanupRunning()).toBe(true)

      // 再次启动应该先停止再启动
      cleanupManager.startAutoCleanup()
      expect(cleanupManager.isAutoCleanupRunning()).toBe(true)

      cleanupManager.stopAutoCleanup()
    })
  })

  describe('getCleanupStatistics', () => {
    it('应该返回清理统计信息', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }
      await db.users.add(user)

      // 创建旧的已删除备忘录
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 35)

      const oldMemo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '旧备忘录',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: oldDate,
        updatedAt: oldDate,
        deletedAt: oldDate,
      }
      await db.memos.add(oldMemo)

      // 创建孤立文件
      const orphanedFile: FileMetadata = {
        id: 'file1',
        userId: 'user1',
        filename: 'orphaned.txt',
        size: 100,
        type: 'text/plain',
        uploadedAt: new Date(),
      }
      await db.files.add(orphanedFile)

      // 创建过期分享链接
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      const expiredShare: ShareLink = {
        id: 'share1',
        memoId: 'memo1',
        userId: 'user1',
        expiresAt: expiredDate,
        accessCount: 0,
        createdAt: new Date(),
      }
      await db.shares.add(expiredShare)

      // 获取统计信息
      const stats = await cleanupManager.getCleanupStatistics()

      // 验证
      expect(stats.deletedMemosCount).toBe(1)
      expect(stats.orphanedFilesCount).toBe(1)
      expect(stats.expiredSharesCount).toBe(1)
    })
  })
})
