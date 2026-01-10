/**
 * CYP-memo 备忘录管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { memoManager } from '../src/managers/MemoManager'
import { memoDAO } from '../src/database/MemoDAO'
import { logManager } from '../src/managers/LogManager'
import type { Memo } from '../src/types'

describe('备忘录管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空数据库
    const memos = await memoDAO.getAll()
    for (const memo of memos) {
      await memoDAO.delete(memo.id)
    }
    const histories = await memoDAO.getAll()
    for (const history of histories) {
      await memoDAO.deleteHistory(history.id)
    }
    
    // 清空本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    // 清空数据库
    const memos = await memoDAO.getAll()
    for (const memo of memos) {
      await memoDAO.delete(memo.id)
    }
    
    // 清空本地存储
    localStorage.clear()
  })

  describe('备忘录创建和管理属性', () => {
    // Feature: cyp-memo, Property 12: 备忘录创建唯一性
    it('属性 12: 对于任何备忘录内容，创建后应该被分配唯一的标识符，且内容应该被正确保存', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 100 }), // title
            fc.string({ minLength: 1, maxLength: 500 }), // content
            fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { maxLength: 5 }) // tags (valid)
          ),
          async ([userId, title, content, tags]) => {
            // 创建第一个备忘录
            const memo1 = await memoManager.createMemo(userId, title, content, tags)
            
            // 验证备忘录被创建
            expect(memo1).toBeDefined()
            expect(memo1.id).toBeDefined()
            expect(memo1.userId).toBe(userId)
            expect(memo1.title).toBe(title.trim())
            expect(memo1.content).toBe(content)
            expect(memo1.tags).toEqual(tags)
            
            // 创建第二个备忘录（相同内容）
            const memo2 = await memoManager.createMemo(userId, title, content, tags)
            
            // 验证两个备忘录有不同的 ID（唯一性）
            expect(memo2.id).toBeDefined()
            expect(memo2.id).not.toBe(memo1.id)
            
            // 验证两个备忘录都能被检索到
            const retrieved1 = await memoManager.getMemo(memo1.id)
            const retrieved2 = await memoManager.getMemo(memo2.id)
            
            expect(retrieved1.id).toBe(memo1.id)
            expect(retrieved2.id).toBe(memo2.id)
            expect(retrieved1.content).toBe(content)
            expect(retrieved2.content).toBe(content)
            
            // 清理
            await memoDAO.delete(memo1.id)
            await memoDAO.delete(memo2.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 13: 备忘录编辑历史保留
    it('属性 13: 对于任何备忘录编辑操作，编辑后内容应该更新，且修改历史应该被保留', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 100 }), // original title
            fc.string({ minLength: 1, maxLength: 500 }), // original content
            fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { maxLength: 5 }), // original tags
            fc.string({ minLength: 1, maxLength: 100 }), // new title
            fc.string({ minLength: 1, maxLength: 500 }), // new content
            fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { maxLength: 5 }) // new tags
          ),
          async ([userId, origTitle, origContent, origTags, newTitle, newContent, newTags]) => {
            // 创建备忘录
            const memo = await memoManager.createMemo(userId, origTitle, origContent, origTags)
            
            // 更新备忘录
            const updatedMemo = await memoManager.updateMemo(memo.id, newTitle, newContent, newTags)
            
            // 验证内容已更新
            expect(updatedMemo.title).toBe(newTitle.trim())
            expect(updatedMemo.content).toBe(newContent)
            expect(updatedMemo.tags).toEqual(newTags)
            
            // 验证历史记录被保留
            const history = await memoManager.getMemoHistory(memo.id)
            expect(history.length).toBeGreaterThan(0)
            
            // 验证历史记录包含原始内容
            const latestHistory = history[history.length - 1]
            expect(latestHistory.content).toBe(origContent)
            expect(latestHistory.memoId).toBe(memo.id)
            
            // 清理
            await memoDAO.delete(memo.id)
            await memoDAO.deleteHistory(memo.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 14: 备忘录删除完整性
    it('属性 14: 对于任何备忘录删除操作，删除后该备忘录应该无法被查询到，且日志中应该有删除记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 100 }), // title
            fc.string({ minLength: 1, maxLength: 500 }), // content
            fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { maxLength: 5 }) // tags (valid)
          ),
          async ([userId, title, content, tags]) => {
            // 创建备忘录
            const memo = await memoManager.createMemo(userId, title, content, tags)
            
            // 验证备忘录存在
            const retrieved = await memoManager.getMemo(memo.id)
            expect(retrieved).toBeDefined()
            
            // 删除备忘录
            await memoManager.deleteMemo(memo.id)
            
            // 验证备忘录无法被查询到（软删除）
            await expect(memoManager.getMemo(memo.id)).rejects.toThrow('备忘录已被删除')
            
            // 验证备忘录不在用户的备忘录列表中
            const userMemos = await memoManager.getAllMemos(userId)
            const foundInList = userMemos.some(m => m.id === memo.id)
            expect(foundInList).toBe(false)
            
            // 验证日志中有删除记录
            const logs = await logManager.getLogs({ level: 'info' })
            const deleteLog = logs.find(log => 
              log.message.includes('备忘录删除成功') && 
              log.context?.memoId === memo.id
            )
            expect(deleteLog).toBeDefined()
            
            // 清理
            await memoDAO.delete(memo.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('搜索和筛选属性', () => {
    // Feature: cyp-memo, Property 15: 搜索结果匹配性
    it('属性 15: 对于任何搜索条件，返回的所有备忘录都应该匹配该搜索条件', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.array(
              fc.tuple(
                fc.string({ minLength: 1, maxLength: 100 }), // title
                fc.string({ minLength: 1, maxLength: 500 }), // content
                fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { maxLength: 5 }) // tags
              ),
              { minLength: 3, maxLength: 10 }
            ),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0) // search query (non-empty after trim)
          ),
          async ([userId, memoData, query]) => {
            // 创建多个备忘录
            const createdMemos: Memo[] = []
            for (const [title, content, tags] of memoData) {
              const memo = await memoManager.createMemo(userId, title, content, tags)
              createdMemos.push(memo)
            }
            
            // 执行搜索
            const results = await memoManager.searchMemos(userId, query)
            
            // 验证所有结果都匹配搜索条件
            const lowerQuery = query.toLowerCase()
            for (const result of results) {
              const matchesTitle = result.title.toLowerCase().includes(lowerQuery)
              const matchesContent = result.content.toLowerCase().includes(lowerQuery)
              expect(matchesTitle || matchesContent).toBe(true)
            }
            
            // 清理
            for (const memo of createdMemos) {
              await memoDAO.delete(memo.id)
            }
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 22: 标签筛选正确性
    it('属性 22: 对于任何标签，点击后显示的所有备忘录都应该包含该标签', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), // target tag (valid)
            fc.array(
              fc.tuple(
                fc.string({ minLength: 1, maxLength: 100 }), // title
                fc.string({ minLength: 1, maxLength: 500 }), // content
                fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { minLength: 1, maxLength: 5 }) // tags (valid)
              ),
              { minLength: 3, maxLength: 10 }
            )
          ),
          async ([userId, targetTag, memoData]) => {
            // 创建多个备忘录，确保至少有一个包含目标标签
            const createdMemos: Memo[] = []
            let hasTargetTag = false
            
            for (let i = 0; i < memoData.length; i++) {
              const [title, content, tags] = memoData[i]
              // 确保至少第一个备忘录包含目标标签
              const finalTags = i === 0 ? [targetTag, ...tags] : tags
              if (finalTags.includes(targetTag)) {
                hasTargetTag = true
              }
              const memo = await memoManager.createMemo(userId, title, content, finalTags)
              createdMemos.push(memo)
            }
            
            // 如果没有备忘录包含目标标签，跳过此测试
            if (!hasTargetTag) {
              // 清理
              for (const memo of createdMemos) {
                await memoDAO.delete(memo.id)
              }
              return
            }
            
            // 按标签筛选
            const results = await memoManager.getMemosByTag(userId, targetTag)
            
            // 验证所有结果都包含该标签
            expect(results.length).toBeGreaterThan(0)
            for (const result of results) {
              expect(result.tags).toContain(targetTag)
            }
            
            // 清理
            for (const memo of createdMemos) {
              await memoDAO.delete(memo.id)
            }
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 24: 标签搜索筛选
    it('属性 24: 对于任何按标签筛选的搜索，返回的所有备忘录都应该包含指定的标签', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { minLength: 1, maxLength: 3 }), // filter tags (valid)
            fc.array(
              fc.tuple(
                fc.string({ minLength: 1, maxLength: 100 }), // title
                fc.string({ minLength: 1, maxLength: 500 }), // content
                fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), { minLength: 1, maxLength: 5 }) // tags (valid)
              ),
              { minLength: 3, maxLength: 10 }
            )
          ),
          async ([userId, filterTags, memoData]) => {
            // 创建多个备忘录，确保至少有一个包含所有筛选标签
            const createdMemos: Memo[] = []
            
            for (let i = 0; i < memoData.length; i++) {
              const [title, content, tags] = memoData[i]
              // 确保至少第一个备忘录包含所有筛选标签
              const finalTags = i === 0 ? [...filterTags, ...tags] : tags
              const memo = await memoManager.createMemo(userId, title, content, finalTags)
              createdMemos.push(memo)
            }
            
            // 按标签筛选搜索
            const results = await memoManager.searchMemos(userId, undefined, filterTags)
            
            // 验证所有结果都包含至少一个筛选标签
            for (const result of results) {
              const hasAnyTag = filterTags.some(tag => result.tags.includes(tag))
              expect(hasAnyTag).toBe(true)
            }
            
            // 清理
            for (const memo of createdMemos) {
              await memoDAO.delete(memo.id)
            }
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('标签管理属性', () => {
    // Feature: cyp-memo, Property 23: 未使用标签自动清理
    it('属性 23: 对于任何标签，当删除最后一个使用该标签的备忘录后，该标签应该从标签列表中移除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }), // userId
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && s.trim().length <= 20), // unique tag (valid)
            fc.string({ minLength: 1, maxLength: 100 }), // title
            fc.string({ minLength: 1, maxLength: 500 }) // content
          ),
          async ([userId, uniqueTag, title, content]) => {
            // 创建一个使用唯一标签的备忘录
            const memo = await memoManager.createMemo(userId, title, content, [uniqueTag])
            
            // 验证标签存在于标签列表中
            let allTags = await memoManager.getAllTags(userId)
            expect(allTags).toContain(uniqueTag)
            
            // 删除备忘录
            await memoManager.deleteMemo(memo.id)
            
            // 验证标签不再存在于标签列表中（因为没有备忘录使用它了）
            allTags = await memoManager.getAllTags(userId)
            expect(allTags).not.toContain(uniqueTag)
            
            // 清理
            await memoDAO.delete(memo.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('草稿管理属性', () => {
    // Feature: cyp-memo, Property 16: 草稿自动保存
    it('属性 16: 对于任何用户输入操作，草稿应该被自动保存并能够被恢复', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }), // draft content
          async (draftContent) => {
            // 保存草稿
            await memoManager.saveDraft(draftContent)
            
            // 验证草稿被保存
            const retrieved = await memoManager.getDraft()
            expect(retrieved).toBe(draftContent)
            
            // 清除草稿
            await memoManager.clearDraft()
            
            // 验证草稿被清除
            const afterClear = await memoManager.getDraft()
            expect(afterClear).toBeNull()
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })
})
