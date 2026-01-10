/**
 * CYP-memo 备忘录管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { memoManager } from '../src/managers/MemoManager'
import { memoDAO } from '../src/database/MemoDAO'

describe('备忘录管理器单元测试', () => {
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

  describe('标签管理测试', () => {
    it('应该正确验证标签名称', async () => {
      const userId = 'test-user'
      
      // 空标签应该被拒绝
      await expect(
        memoManager.createMemo(userId, '测试', '内容', [''])
      ).rejects.toThrow('标签名称无效')
      
      // 只有空格的标签应该被拒绝
      await expect(
        memoManager.createMemo(userId, '测试', '内容', ['   '])
      ).rejects.toThrow('标签名称无效')
      
      // 超过20个字符的标签应该被拒绝
      await expect(
        memoManager.createMemo(userId, '测试', '内容', ['这是一个超过二十个字符限制的非常长的标签名称'])
      ).rejects.toThrow('标签名称无效')
    })

    it('应该正确处理多个标签', async () => {
      const userId = 'test-user'
      const tags = ['工作', '重要', '待办']
      
      const memo = await memoManager.createMemo(userId, '测试备忘录', '内容', tags)
      
      expect(memo.tags).toEqual(tags)
      expect(memo.tags.length).toBe(3)
    })

    it('应该正确获取用户的所有标签', async () => {
      const userId = 'test-user'
      
      // 创建多个备忘录，使用不同的标签
      await memoManager.createMemo(userId, '备忘录1', '内容1', ['工作', '重要'])
      await memoManager.createMemo(userId, '备忘录2', '内容2', ['个人', '重要'])
      await memoManager.createMemo(userId, '备忘录3', '内容3', ['学习'])
      
      const allTags = await memoManager.getAllTags(userId)
      
      // 应该包含所有唯一的标签
      expect(allTags).toContain('工作')
      expect(allTags).toContain('重要')
      expect(allTags).toContain('个人')
      expect(allTags).toContain('学习')
      expect(allTags.length).toBe(4)
    })

    it('应该正确按标签获取备忘录', async () => {
      const userId = 'test-user'
      
      // 创建多个备忘录
      const memo1 = await memoManager.createMemo(userId, '备忘录1', '内容1', ['工作'])
      const memo2 = await memoManager.createMemo(userId, '备忘录2', '内容2', ['工作', '重要'])
      await memoManager.createMemo(userId, '备忘录3', '内容3', ['个人'])
      
      const workMemos = await memoManager.getMemosByTag(userId, '工作')
      
      expect(workMemos.length).toBe(2)
      expect(workMemos.some(m => m.id === memo1.id)).toBe(true)
      expect(workMemos.some(m => m.id === memo2.id)).toBe(true)
    })


    it('应该在删除备忘录后更新标签列表', async () => {
      const userId = 'test-user'
      
      // 创建使用唯一标签的备忘录
      const memo = await memoManager.createMemo(userId, '测试', '内容', ['唯一标签'])
      
      // 验证标签存在
      let tags = await memoManager.getAllTags(userId)
      expect(tags).toContain('唯一标签')
      
      // 删除备忘录
      await memoManager.deleteMemo(memo.id)
      
      // 验证标签不再存在
      tags = await memoManager.getAllTags(userId)
      expect(tags).not.toContain('唯一标签')
    })

    it('应该在更新备忘录时正确处理标签变化', async () => {
      const userId = 'test-user'
      
      // 创建备忘录
      const memo = await memoManager.createMemo(userId, '测试', '内容', ['旧标签'])
      
      // 更新标签
      await memoManager.updateMemo(memo.id, '测试', '内容', ['新标签'])
      
      // 验证新标签存在
      const tags = await memoManager.getAllTags(userId)
      expect(tags).toContain('新标签')
      expect(tags).not.toContain('旧标签')
    })

    it('应该在有多个备忘录使用同一标签时保留该标签', async () => {
      const userId = 'test-user'
      
      // 创建两个使用相同标签的备忘录
      const memo1 = await memoManager.createMemo(userId, '备忘录1', '内容1', ['共享标签'])
      await memoManager.createMemo(userId, '备忘录2', '内容2', ['共享标签'])
      
      // 删除第一个备忘录
      await memoManager.deleteMemo(memo1.id)
      
      // 标签应该仍然存在（因为第二个备忘录还在使用）
      const tags = await memoManager.getAllTags(userId)
      expect(tags).toContain('共享标签')
    })

    it('应该正确处理标签名称的前后空格', async () => {
      const userId = 'test-user'
      
      // 创建带有前后空格的标签
      const memo = await memoManager.createMemo(userId, '测试', '内容', ['  标签  '])
      
      // 标签应该保留空格（由验证函数处理）
      expect(memo.tags[0]).toBe('  标签  ')
    })
  })


  describe('搜索边界情况测试', () => {
    it('应该处理空搜索查询', async () => {
      const userId = 'test-user'
      
      // 创建一些备忘录
      await memoManager.createMemo(userId, '备忘录1', '内容1', [])
      await memoManager.createMemo(userId, '备忘录2', '内容2', [])
      
      // 空查询应该返回所有备忘录
      const results = await memoManager.searchMemos(userId, '')
      expect(results.length).toBe(2)
    })

    it('应该处理只有空格的搜索查询', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', [])
      await memoManager.createMemo(userId, '备忘录2', '内容2', [])
      
      // 只有空格的查询应该返回所有备忘录
      const results = await memoManager.searchMemos(userId, '   ')
      expect(results.length).toBe(2)
    })

    it('应该处理未定义的搜索查询', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', [])
      await memoManager.createMemo(userId, '备忘录2', '内容2', [])
      
      // 未定义的查询应该返回所有备忘录
      const results = await memoManager.searchMemos(userId, undefined)
      expect(results.length).toBe(2)
    })

    it('应该正确处理大小写不敏感的搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, 'Important Task', 'This is IMPORTANT', [])
      
      // 小写搜索应该匹配大写内容
      const results1 = await memoManager.searchMemos(userId, 'important')
      expect(results1.length).toBe(1)
      
      // 大写搜索应该匹配小写内容
      const results2 = await memoManager.searchMemos(userId, 'TASK')
      expect(results2.length).toBe(1)
    })

    it('应该在标题和内容中都进行搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '包含关键词的标题', '普通内容', [])
      await memoManager.createMemo(userId, '普通标题', '包含关键词的内容', [])
      await memoManager.createMemo(userId, '其他标题', '其他内容', [])
      
      const results = await memoManager.searchMemos(userId, '关键词')
      expect(results.length).toBe(2)
    })


    it('应该处理没有匹配结果的搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', [])
      await memoManager.createMemo(userId, '备忘录2', '内容2', [])
      
      const results = await memoManager.searchMemos(userId, '不存在的关键词')
      expect(results.length).toBe(0)
    })

    it('应该正确处理特殊字符的搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '测试@#$%', '内容!@#', [])
      
      const results = await memoManager.searchMemos(userId, '@#$')
      expect(results.length).toBe(1)
    })

    it('应该正确处理中文搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '中文标题', '中文内容', [])
      await memoManager.createMemo(userId, 'English Title', 'English Content', [])
      
      const results = await memoManager.searchMemos(userId, '中文')
      expect(results.length).toBe(1)
      expect(results[0].title).toBe('中文标题')
    })

    it('应该正确处理部分匹配的搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录管理系统', '内容', [])
      
      // 部分匹配应该成功
      const results1 = await memoManager.searchMemos(userId, '备忘录')
      expect(results1.length).toBe(1)
      
      const results2 = await memoManager.searchMemos(userId, '管理')
      expect(results2.length).toBe(1)
      
      const results3 = await memoManager.searchMemos(userId, '系统')
      expect(results3.length).toBe(1)
    })

    it('应该正确处理同时使用搜索查询和标签筛选', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '工作备忘录', '关于工作的内容', ['工作'])
      await memoManager.createMemo(userId, '个人备忘录', '关于个人的内容', ['个人'])
      await memoManager.createMemo(userId, '工作计划', '其他内容', ['工作'])
      
      // 搜索"工作"并筛选"工作"标签
      const results = await memoManager.searchMemos(userId, '工作', ['工作'])
      expect(results.length).toBe(2)
      
      // 所有结果都应该包含"工作"标签
      results.forEach(memo => {
        expect(memo.tags).toContain('工作')
      })
    })


    it('应该在标签筛选时处理空标签数组', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', ['标签1'])
      await memoManager.createMemo(userId, '备忘录2', '内容2', ['标签2'])
      
      // 空标签数组应该返回所有备忘录
      const results = await memoManager.searchMemos(userId, undefined, [])
      expect(results.length).toBe(2)
    })

    it('应该正确处理多个标签的OR筛选', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', ['工作'])
      await memoManager.createMemo(userId, '备忘录2', '内容2', ['个人'])
      await memoManager.createMemo(userId, '备忘录3', '内容3', ['学习'])
      await memoManager.createMemo(userId, '备忘录4', '内容4', ['其他'])
      
      // 筛选包含"工作"或"个人"标签的备忘录
      const results = await memoManager.searchMemos(userId, undefined, ['工作', '个人'])
      expect(results.length).toBe(2)
    })

    it('应该不返回已删除的备忘录', async () => {
      const userId = 'test-user'
      
      const memo1 = await memoManager.createMemo(userId, '备忘录1', '内容1', [])
      await memoManager.createMemo(userId, '备忘录2', '内容2', [])
      
      // 删除第一个备忘录
      await memoManager.deleteMemo(memo1.id)
      
      // 搜索应该只返回未删除的备忘录
      const results = await memoManager.searchMemos(userId, '备忘录')
      expect(results.length).toBe(1)
      expect(results[0].id).not.toBe(memo1.id)
    })

    it('应该正确处理不同用户的搜索隔离', async () => {
      const user1 = 'user1'
      const user2 = 'user2'
      
      await memoManager.createMemo(user1, '用户1的备忘录', '内容', [])
      await memoManager.createMemo(user2, '用户2的备忘录', '内容', [])
      
      // 用户1的搜索应该只返回用户1的备忘录
      const results1 = await memoManager.searchMemos(user1, '备忘录')
      expect(results1.length).toBe(1)
      expect(results1[0].userId).toBe(user1)
      
      // 用户2的搜索应该只返回用户2的备忘录
      const results2 = await memoManager.searchMemos(user2, '备忘录')
      expect(results2.length).toBe(1)
      expect(results2[0].userId).toBe(user2)
    })


    it('应该正确处理长搜索查询', async () => {
      const userId = 'test-user'
      const longQuery = '这是一个非常非常非常非常非常非常非常非常非常非常长的搜索查询'
      
      await memoManager.createMemo(userId, '备忘录', longQuery, [])
      
      const results = await memoManager.searchMemos(userId, longQuery)
      expect(results.length).toBe(1)
    })

    it('应该正确处理包含换行符的内容搜索', async () => {
      const userId = 'test-user'
      const contentWithNewlines = '第一行\n第二行\n第三行'
      
      await memoManager.createMemo(userId, '备忘录', contentWithNewlines, [])
      
      const results = await memoManager.searchMemos(userId, '第二行')
      expect(results.length).toBe(1)
    })

    it('应该正确处理数字搜索', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录123', '内容456', [])
      
      const results1 = await memoManager.searchMemos(userId, '123')
      expect(results1.length).toBe(1)
      
      const results2 = await memoManager.searchMemos(userId, '456')
      expect(results2.length).toBe(1)
    })

    it('应该正确处理标签筛选时不存在的标签', async () => {
      const userId = 'test-user'
      
      await memoManager.createMemo(userId, '备忘录1', '内容1', ['存在的标签'])
      
      const results = await memoManager.searchMemos(userId, undefined, ['不存在的标签'])
      expect(results.length).toBe(0)
    })
  })

  describe('草稿管理边界情况测试', () => {
    it('应该在没有草稿时返回 null', async () => {
      const draft = await memoManager.getDraft()
      expect(draft).toBeNull()
    })

    it('应该正确保存和获取空字符串草稿', async () => {
      await memoManager.saveDraft('')
      const draft = await memoManager.getDraft()
      expect(draft).toBe('')
    })

    it('应该正确保存和获取包含特殊字符的草稿', async () => {
      const content = '特殊字符: @#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
      await memoManager.saveDraft(content)
      const draft = await memoManager.getDraft()
      expect(draft).toBe(content)
    })


    it('应该正确保存和获取包含换行符的草稿', async () => {
      const content = '第一行\n第二行\n第三行'
      await memoManager.saveDraft(content)
      const draft = await memoManager.getDraft()
      expect(draft).toBe(content)
    })

    it('应该正确覆盖之前的草稿', async () => {
      await memoManager.saveDraft('第一个草稿')
      await memoManager.saveDraft('第二个草稿')
      
      const draft = await memoManager.getDraft()
      expect(draft).toBe('第二个草稿')
    })

    it('应该在清除后返回 null', async () => {
      await memoManager.saveDraft('测试草稿')
      await memoManager.clearDraft()
      
      const draft = await memoManager.getDraft()
      expect(draft).toBeNull()
    })

    it('应该正确处理多次清除草稿', async () => {
      await memoManager.saveDraft('测试草稿')
      await memoManager.clearDraft()
      await memoManager.clearDraft() // 第二次清除
      
      const draft = await memoManager.getDraft()
      expect(draft).toBeNull()
    })

    it('应该正确保存和获取长草稿内容', async () => {
      const longContent = 'a'.repeat(10000)
      await memoManager.saveDraft(longContent)
      const draft = await memoManager.getDraft()
      expect(draft).toBe(longContent)
    })
  })

  describe('备忘录恢复测试', () => {
    it('应该能够恢复已删除的备忘录', async () => {
      const userId = 'test-user'
      const memo = await memoManager.createMemo(userId, '测试', '内容', [])
      
      // 删除备忘录
      await memoManager.deleteMemo(memo.id)
      
      // 验证备忘录在已删除列表中
      const deletedMemos = await memoManager.getDeletedMemos(userId)
      expect(deletedMemos.length).toBe(1)
      expect(deletedMemos[0].id).toBe(memo.id)
      
      // 恢复备忘录
      await memoManager.restoreMemo(memo.id)
      
      // 验证备忘录可以被正常访问
      const restored = await memoManager.getMemo(memo.id)
      expect(restored.id).toBe(memo.id)
      expect(restored.deletedAt).toBeUndefined()
    })


    it('应该拒绝恢复不存在的备忘录', async () => {
      await expect(
        memoManager.restoreMemo('non-existent-id')
      ).rejects.toThrow('备忘录不存在')
    })

    it('应该拒绝恢复未被删除的备忘录', async () => {
      const userId = 'test-user'
      const memo = await memoManager.createMemo(userId, '测试', '内容', [])
      
      await expect(
        memoManager.restoreMemo(memo.id)
      ).rejects.toThrow('备忘录未被删除')
    })
  })

  describe('永久删除测试', () => {
    it('应该能够永久删除备忘录', async () => {
      const userId = 'test-user'
      const memo = await memoManager.createMemo(userId, '测试', '内容', [])
      
      // 永久删除
      await memoManager.permanentlyDeleteMemo(memo.id)
      
      // 验证备忘录完全不存在
      const retrieved = await memoDAO.getById(memo.id)
      expect(retrieved).toBeUndefined()
    })

    it('应该在永久删除时同时删除历史记录', async () => {
      const userId = 'test-user'
      const memo = await memoManager.createMemo(userId, '测试', '内容', [])
      
      // 更新备忘录以创建历史记录
      await memoManager.updateMemo(memo.id, '更新', '新内容', [])
      
      // 验证历史记录存在
      let history = await memoManager.getMemoHistory(memo.id)
      expect(history.length).toBeGreaterThan(0)
      
      // 永久删除
      await memoManager.permanentlyDeleteMemo(memo.id)
      
      // 验证历史记录也被删除
      history = await memoManager.getMemoHistory(memo.id)
      expect(history.length).toBe(0)
    })

    it('应该拒绝永久删除不存在的备忘录', async () => {
      await expect(
        memoManager.permanentlyDeleteMemo('non-existent-id')
      ).rejects.toThrow('备忘录不存在')
    })
  })
})
