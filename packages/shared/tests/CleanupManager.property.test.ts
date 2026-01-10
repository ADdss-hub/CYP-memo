/**
 * CYP-memo 自动清理管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { cleanupManager } from '../src/managers/CleanupManager'
import { db } from '../src/database/db'
import type { User, Memo, FileMetadata } from '../src/types'

describe('自动清理管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
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

  describe('数据清理属性', () => {
    // Feature: cyp-memo, Property 37: 已删除数据清理
    it('属性 37: 对于任何超过保留期限的已删除备忘录，自动清理后应该无法被恢复', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.integer({ min: 1, max: 5 }), // 旧备忘录数量
            fc.integer({ min: 1, max: 5 }), // 新备忘录数量
            fc.integer({ min: 31, max: 60 }) // 旧备忘录删除天数（超过30天保留期）
          ),
          async ([userId, oldMemoCount, newMemoCount, oldDays]) => {
            // 创建用户
            const user: User = {
              id: userId,
              username: 'testuser_' + userId,
              passwordHash: 'hash123',
              rememberPassword: false,
              isMainAccount: true,
              permissions: [],
              createdAt: new Date(),
              lastLoginAt: new Date(),
            }
            await db.users.add(user)
            
            // 创建旧的已删除备忘录（超过保留期）
            const oldDeletedDate = new Date()
            oldDeletedDate.setDate(oldDeletedDate.getDate() - oldDays)
            
            const oldMemoIds: string[] = []
            for (let i = 0; i < oldMemoCount; i++) {
              const memo: Memo = {
                id: `old_memo_${userId}_${i}`,
                userId,
                title: `旧备忘录 ${i}`,
                content: `内容 ${i}`,
                tags: [],
                attachments: [],
                createdAt: oldDeletedDate,
                updatedAt: oldDeletedDate,
                deletedAt: oldDeletedDate,
              }
              await db.memos.add(memo)
              oldMemoIds.push(memo.id)
            }
            
            // 创建新的已删除备忘录（在保留期内）
            const recentDeletedDate = new Date()
            recentDeletedDate.setDate(recentDeletedDate.getDate() - 10) // 10天前，在30天保留期内
            
            const newMemoIds: string[] = []
            for (let i = 0; i < newMemoCount; i++) {
              const memo: Memo = {
                id: `new_memo_${userId}_${i}`,
                userId,
                title: `新备忘录 ${i}`,
                content: `内容 ${i}`,
                tags: [],
                attachments: [],
                createdAt: recentDeletedDate,
                updatedAt: recentDeletedDate,
                deletedAt: recentDeletedDate,
              }
              await db.memos.add(memo)
              newMemoIds.push(memo.id)
            }
            
            // 验证清理前所有备忘录都存在
            const memosBeforeClean = await db.memos.toArray()
            expect(memosBeforeClean.length).toBe(oldMemoCount + newMemoCount)
            
            // 执行清理（使用默认30天保留期）
            const removedCount = await cleanupManager.cleanDeletedMemos(30)
            
            // 验证清理了正确数量的旧备忘录
            expect(removedCount).toBe(oldMemoCount)
            
            // 验证旧备忘录已被删除且无法恢复
            for (const oldMemoId of oldMemoIds) {
              const memo = await db.memos.get(oldMemoId)
              expect(memo).toBeUndefined()
            }
            
            // 验证新备忘录仍然存在
            for (const newMemoId of newMemoIds) {
              const memo = await db.memos.get(newMemoId)
              expect(memo).toBeDefined()
              expect(memo?.deletedAt).toBeDefined()
            }
            
            // 验证清理后的总数
            const memosAfterClean = await db.memos.toArray()
            expect(memosAfterClean.length).toBe(newMemoCount)
            
            // 清理
            await db.users.delete(userId)
            for (const memoId of newMemoIds) {
              await db.memos.delete(memoId)
            }
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 39: 清理操作日志记录
    it('属性 39: 对于任何自动清理操作，日志中应该有详细记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.integer({ min: 1, max: 3 }), // 已删除备忘录数量
            fc.integer({ min: 1, max: 3 }), // 孤立文件数量
            fc.integer({ min: 35, max: 60 }) // 删除天数
          ),
          async ([userId, deletedMemoCount, orphanedFileCount, deletedDays]) => {
            // 清空日志以便验证
            await db.logs.clear()
            
            // 创建用户
            const user: User = {
              id: userId,
              username: 'testuser_' + userId,
              passwordHash: 'hash123',
              rememberPassword: false,
              isMainAccount: true,
              permissions: [],
              createdAt: new Date(),
              lastLoginAt: new Date(),
            }
            await db.users.add(user)
            
            // 创建旧的已删除备忘录
            const oldDate = new Date()
            oldDate.setDate(oldDate.getDate() - deletedDays)
            
            for (let i = 0; i < deletedMemoCount; i++) {
              const memo: Memo = {
                id: `memo_${userId}_${i}`,
                userId,
                title: `备忘录 ${i}`,
                content: `内容 ${i}`,
                tags: [],
                attachments: [],
                createdAt: oldDate,
                updatedAt: oldDate,
                deletedAt: oldDate,
              }
              await db.memos.add(memo)
            }
            
            // 创建孤立文件（未被任何备忘录引用）
            for (let i = 0; i < orphanedFileCount; i++) {
              const file: FileMetadata = {
                id: `orphaned_file_${userId}_${i}`,
                userId,
                filename: `orphaned_${i}.txt`,
                size: 100,
                type: 'text/plain',
                uploadedAt: new Date(),
              }
              await db.files.add(file)
            }
            
            // 记录清理前的日志数量
            const logsBeforeClean = await db.logs.toArray()
            const logCountBefore = logsBeforeClean.length
            
            // 执行完整清理
            const result = await cleanupManager.performCleanup()
            
            // 验证清理结果
            expect(result.deletedMemosRemoved).toBe(deletedMemoCount)
            expect(result.orphanedFilesRemoved).toBe(orphanedFileCount)
            
            // 验证日志中有清理操作记录
            const logsAfterClean = await db.logs.toArray()
            const newLogs = logsAfterClean.slice(logCountBefore)
            
            // 应该至少有以下日志：
            // 1. 开始执行自动清理任务
            // 2. 已删除备忘录清理完成（如果有删除）
            // 3. 未使用附件清理完成（如果有删除）
            // 4. 自动清理任务完成
            expect(newLogs.length).toBeGreaterThan(0)
            
            // 验证有"开始执行自动清理任务"日志
            const startLog = newLogs.find(log => 
              log.message.includes('开始执行自动清理任务') ||
              (log.context && typeof log.context === 'object' && 'action' in log.context && log.context.action === 'cleanup_start')
            )
            expect(startLog).toBeDefined()
            
            // 验证有"自动清理任务完成"日志
            const completeLog = newLogs.find(log => 
              log.message.includes('自动清理任务完成') ||
              (log.context && typeof log.context === 'object' && 'action' in log.context && log.context.action === 'cleanup_complete')
            )
            expect(completeLog).toBeDefined()
            
            // 如果有删除备忘录，验证有相应日志
            if (deletedMemoCount > 0) {
              const memoCleanLog = newLogs.find(log => 
                log.message.includes('已删除备忘录清理完成') ||
                (log.context && typeof log.context === 'object' && 'action' in log.context && log.context.action === 'cleanup_deleted_memos')
              )
              expect(memoCleanLog).toBeDefined()
              
              // 验证日志包含清理数量信息
              if (memoCleanLog && memoCleanLog.context && typeof memoCleanLog.context === 'object' && 'removedCount' in memoCleanLog.context) {
                expect(memoCleanLog.context.removedCount).toBe(deletedMemoCount)
              }
            }
            
            // 如果有删除孤立文件，验证有相应日志
            if (orphanedFileCount > 0) {
              const fileCleanLog = newLogs.find(log => 
                log.message.includes('未使用附件清理完成') ||
                (log.context && typeof log.context === 'object' && 'action' in log.context && log.context.action === 'cleanup_orphaned_files')
              )
              expect(fileCleanLog).toBeDefined()
              
              // 验证日志包含清理数量信息
              if (fileCleanLog && fileCleanLog.context && typeof fileCleanLog.context === 'object' && 'removedCount' in fileCleanLog.context) {
                expect(fileCleanLog.context.removedCount).toBe(orphanedFileCount)
              }
            }
            
            // 清理
            await db.users.delete(userId)
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)
  })
})
