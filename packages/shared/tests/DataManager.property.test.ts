/**
 * CYP-memo 数据持久化管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { dataManager } from '../src/managers/DataManager'
import { memoManager } from '../src/managers/MemoManager'
import { db } from '../src/database/db'
import type { User, Memo } from '../src/types'

describe('数据持久化管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    await db.users.clear()
    await db.memos.clear()
    await db.memoHistory.clear()
    await db.files.clear()
    await db.fileBlobs.clear()
    await db.shares.clear()
    await db.logs.clear()
  })

  describe('数据持久化属性', () => {
    // Feature: cyp-memo, Property 34: 数据立即持久化
    it('属性 34: 对于任何备忘录创建或修改操作，数据应该立即被持久化到存储', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 100 }), // title
            fc.string({ minLength: 1, maxLength: 500 }), // content
            fc.array(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20),
              { maxLength: 5 }
            ) // tags (valid)
          ),
          async ([userId, title, content, tags]) => {
            // 创建备忘录
            const memo = await memoManager.createMemo(userId, title, content, tags)
            
            // 立即从数据库读取，验证数据已持久化
            const persistedMemo = await db.memos.get(memo.id)
            expect(persistedMemo).toBeDefined()
            expect(persistedMemo?.id).toBe(memo.id)
            expect(persistedMemo?.userId).toBe(userId)
            expect(persistedMemo?.title).toBe(title.trim())
            expect(persistedMemo?.content).toBe(content)
            expect(persistedMemo?.tags).toEqual(tags)
            
            // 修改备忘录
            const newTitle = 'Updated ' + title
            const newContent = 'Updated ' + content
            await memoManager.updateMemo(memo.id, newTitle, newContent, tags)
            
            // 立即从数据库读取，验证修改已持久化
            const persistedUpdated = await db.memos.get(memo.id)
            expect(persistedUpdated).toBeDefined()
            expect(persistedUpdated?.title).toBe(newTitle.trim())
            expect(persistedUpdated?.content).toBe(newContent)
            expect(persistedUpdated?.updatedAt).toBeInstanceOf(Date)
            
            // 清理
            await db.memos.delete(memo.id)
            await db.memoHistory.where('memoId').equals(memo.id).delete()
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 35: 数据恢复完整性
    it('属性 35: 对于任何系统重启，所有之前保存的备忘录数据应该能够被完全恢复', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.array(
              fc.tuple(
                fc.string({ minLength: 1, maxLength: 100 }), // title
                fc.string({ minLength: 1, maxLength: 500 }), // content
                fc.array(
                  fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20),
                  { maxLength: 5 }
                ) // tags (valid)
              ),
              { minLength: 1, maxLength: 5 }
            )
          ),
          async ([userId, memoDataArray]) => {
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
            
            // 创建多个备忘录
            const createdMemos: Memo[] = []
            for (const [title, content, tags] of memoDataArray) {
              const memo = await memoManager.createMemo(userId, title, content, tags)
              createdMemos.push(memo)
            }
            
            // 导出所有数据（模拟系统重启前的状态）
            const exportedData = await dataManager.exportToJSON()
            
            // 清空数据库（模拟系统重启）
            await dataManager.clearAllData()
            
            // 验证数据已清空
            const memoCountAfterClear = await db.memos.count()
            expect(memoCountAfterClear).toBe(0)
            
            // 恢复数据（模拟系统重启后的恢复）
            await dataManager.recoverData(exportedData)
            
            // 验证所有备忘录都被恢复
            const recoveredMemos = await db.memos.where('userId').equals(userId).toArray()
            expect(recoveredMemos.length).toBe(createdMemos.length)
            
            // 验证每个备忘录的内容都正确恢复
            for (const originalMemo of createdMemos) {
              const recovered = recoveredMemos.find(m => m.id === originalMemo.id)
              expect(recovered).toBeDefined()
              expect(recovered?.title).toBe(originalMemo.title)
              expect(recovered?.content).toBe(originalMemo.content)
              expect(recovered?.tags).toEqual(originalMemo.tags)
              expect(recovered?.userId).toBe(originalMemo.userId)
            }
            
            // 清理
            await db.users.delete(userId)
            for (const memo of createdMemos) {
              await db.memos.delete(memo.id)
              await db.memoHistory.where('memoId').equals(memo.id).delete()
            }
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 36: JSON 序列化往返
    it('属性 36: 对于任何有效的备忘录对象，序列化为 JSON 后再反序列化应该得到等价的对象', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 100 }), // title
            fc.string({ minLength: 1, maxLength: 500 }), // content
            fc.array(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20),
              { maxLength: 5 }
            ), // tags (valid)
            fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }) // attachments
          ),
          async ([userId, title, content, tags, attachments]) => {
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
            
            // 创建备忘录
            const memo = await memoManager.createMemo(userId, title, content, tags)
            
            // 如果有附件，添加到备忘录
            if (attachments.length > 0) {
              await db.memos.update(memo.id, { attachments })
            }
            
            // 序列化：导出为 JSON
            const jsonString = await dataManager.exportToJSON()
            
            // 验证 JSON 是有效的
            expect(jsonString).toBeTruthy()
            expect(() => JSON.parse(jsonString)).not.toThrow()
            
            // 清空数据库
            await dataManager.clearAllData()
            
            // 反序列化：从 JSON 导入
            await dataManager.importFromJSON(jsonString, false)
            
            // 验证备忘录被正确恢复
            const recoveredMemo = await db.memos.get(memo.id)
            expect(recoveredMemo).toBeDefined()
            
            // 验证所有字段都相等（等价性）
            expect(recoveredMemo?.id).toBe(memo.id)
            expect(recoveredMemo?.userId).toBe(userId)
            expect(recoveredMemo?.title).toBe(title.trim())
            expect(recoveredMemo?.content).toBe(content)
            expect(recoveredMemo?.tags).toEqual(tags)
            if (attachments.length > 0) {
              expect(recoveredMemo?.attachments).toEqual(attachments)
            }
            
            // 验证日期对象被正确恢复
            expect(recoveredMemo?.createdAt).toBeInstanceOf(Date)
            expect(recoveredMemo?.updatedAt).toBeInstanceOf(Date)
            expect(recoveredMemo?.createdAt.getTime()).toBe(memo.createdAt.getTime())
            expect(recoveredMemo?.updatedAt.getTime()).toBe(memo.updatedAt.getTime())
            
            // 验证用户也被正确恢复
            const recoveredUser = await db.users.get(userId)
            expect(recoveredUser).toBeDefined()
            expect(recoveredUser?.username).toBe(user.username)
            expect(recoveredUser?.createdAt).toBeInstanceOf(Date)
            expect(recoveredUser?.lastLoginAt).toBeInstanceOf(Date)
            
            // 清理
            await db.users.delete(userId)
            await db.memos.delete(memo.id)
            await db.memoHistory.where('memoId').equals(memo.id).delete()
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)
  })
})
