/**
 * CYP-memo MemoDAO 单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../src/database/db'
import { MemoDAO } from '../src/database/MemoDAO'
import type { Memo, MemoHistory } from '../src/types'

describe('MemoDAO', () => {
  let memoDAO: MemoDAO

  beforeEach(async () => {
    memoDAO = new MemoDAO()
    // Clear all data before each test
    await db.memos.clear()
    await db.memoHistory.clear()
  })

  afterEach(async () => {
    // Clean up after each test
    await db.memos.clear()
    await db.memoHistory.clear()
  })

  describe('CRUD 操作', () => {
    it('应该创建新备忘录', async () => {
      const memo: Memo = {
        id: 'memo1',
        userId: 'user1',
        title: '测试备忘录',
        content: '这是测试内容',
        tags: ['测试', '工作'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const id = await memoDAO.create(memo)
      expect(id).toBe('memo1')

      const retrieved = await memoDAO.getById('memo1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.title).toBe('测试备忘录')
      expect(retrieved?.content).toBe('这是测试内容')
    })

    it('应该根据 ID 获取备忘录', async () => {
      const memo: Memo = {
        id: 'memo2',
        userId: 'user1',
        title: '获取测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await memoDAO.create(memo)
      const retrieved = await memoDAO.getById('memo2')

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('memo2')
      expect(retrieved?.title).toBe('获取测试')
    })

    it('应该更新备忘录', async () => {
      const memo: Memo = {
        id: 'memo3',
        userId: 'user1',
        title: '原标题',
        content: '原内容',
        tags: ['原标签'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await memoDAO.create(memo)
      const updateCount = await memoDAO.update('memo3', {
        title: '新标题',
        content: '新内容',
        tags: ['新标签'],
      })

      expect(updateCount).toBe(1)

      const updated = await memoDAO.getById('memo3')
      expect(updated?.title).toBe('新标题')
      expect(updated?.content).toBe('新内容')
      expect(updated?.tags).toContain('新标签')
    })

    it('应该软删除备忘录', async () => {
      const memo: Memo = {
        id: 'memo4',
        userId: 'user1',
        title: '待删除',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await memoDAO.create(memo)
      await memoDAO.softDelete('memo4')

      const retrieved = await memoDAO.getById('memo4')
      expect(retrieved).toBeDefined()
      expect(retrieved?.deletedAt).toBeDefined()
    })

    it('应该永久删除备忘录', async () => {
      const memo: Memo = {
        id: 'memo5',
        userId: 'user1',
        title: '永久删除',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await memoDAO.create(memo)
      await memoDAO.delete('memo5')

      const retrieved = await memoDAO.getById('memo5')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('查询和筛选', () => {
    beforeEach(async () => {
      // 创建测试数据
      const memos: Memo[] = [
        {
          id: 'memo10',
          userId: 'user1',
          title: 'Vue 学习笔记',
          content: 'Vue 3 组合式 API 很强大',
          tags: ['前端', 'Vue'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'memo11',
          userId: 'user1',
          title: 'TypeScript 指南',
          content: 'TypeScript 提供类型安全',
          tags: ['前端', 'TypeScript'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'memo12',
          userId: 'user2',
          title: '其他用户的备忘录',
          content: '这是另一个用户的内容',
          tags: ['其他'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'memo13',
          userId: 'user1',
          title: '已删除的备忘录',
          content: '这个已被删除',
          tags: ['删除'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: new Date(),
        },
      ]

      for (const memo of memos) {
        await memoDAO.create(memo)
      }
    })

    it('应该获取用户的所有备忘录（不包括已删除）', async () => {
      const memos = await memoDAO.getByUserId('user1')

      expect(memos.length).toBe(2)
      expect(memos.every((m) => m.userId === 'user1')).toBe(true)
      expect(memos.every((m) => !m.deletedAt)).toBe(true)
    })

    it('应该根据标签搜索备忘录', async () => {
      const memos = await memoDAO.getByTag('user1', '前端')

      expect(memos.length).toBe(2)
      expect(memos.every((m) => m.tags.includes('前端'))).toBe(true)
      expect(memos.every((m) => m.userId === 'user1')).toBe(true)
    })

    it('应该搜索备忘录内容', async () => {
      const memos = await memoDAO.search('user1', 'TypeScript')

      expect(memos.length).toBe(1)
      expect(memos[0].id).toBe('memo11')
    })

    it('应该按标签筛选搜索', async () => {
      const memos = await memoDAO.searchByTags('user1', ['Vue', 'TypeScript'])

      expect(memos.length).toBe(2)
      expect(memos.map((m) => m.id)).toContain('memo10')
      expect(memos.map((m) => m.id)).toContain('memo11')
    })

    it('应该获取已删除的备忘录', async () => {
      const deleted = await memoDAO.getDeleted('user1')

      expect(deleted.length).toBe(1)
      expect(deleted[0].id).toBe('memo13')
      expect(deleted[0].deletedAt).toBeDefined()
    })

    it('应该获取用户使用的所有标签', async () => {
      const tags = await memoDAO.getAllTags('user1')

      expect(tags).toContain('前端')
      expect(tags).toContain('Vue')
      expect(tags).toContain('TypeScript')
      expect(tags).not.toContain('删除') // 已删除的备忘录标签不应包含
    })

    it('应该获取所有备忘录（包括已删除）', async () => {
      const allMemos = await memoDAO.getAll()

      expect(allMemos.length).toBe(4)
    })
  })

  describe('备忘录历史', () => {
    it('应该创建备忘录历史记录', async () => {
      const history: MemoHistory = {
        id: 'history1',
        memoId: 'memo1',
        content: '历史内容',
        timestamp: new Date(),
      }

      const id = await memoDAO.createHistory(history)
      expect(id).toBe('history1')
    })

    it('应该获取备忘录的历史记录', async () => {
      const histories: MemoHistory[] = [
        {
          id: 'history2',
          memoId: 'memo2',
          content: '第一次修改',
          timestamp: new Date(Date.now() - 2000),
        },
        {
          id: 'history3',
          memoId: 'memo2',
          content: '第二次修改',
          timestamp: new Date(Date.now() - 1000),
        },
        {
          id: 'history4',
          memoId: 'memo2',
          content: '第三次修改',
          timestamp: new Date(),
        },
      ]

      for (const history of histories) {
        await memoDAO.createHistory(history)
      }

      const retrieved = await memoDAO.getHistory('memo2')

      expect(retrieved.length).toBe(3)
      expect(retrieved[0].content).toBe('第一次修改')
      expect(retrieved[2].content).toBe('第三次修改')
    })

    it('应该删除备忘录的历史记录', async () => {
      const history: MemoHistory = {
        id: 'history5',
        memoId: 'memo3',
        content: '待删除的历史',
        timestamp: new Date(),
      }

      await memoDAO.createHistory(history)
      await memoDAO.deleteHistory('memo3')

      const retrieved = await memoDAO.getHistory('memo3')
      expect(retrieved.length).toBe(0)
    })
  })
})
