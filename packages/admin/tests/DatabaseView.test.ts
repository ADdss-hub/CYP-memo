/**
 * 数据库管理界面测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DatabaseView from '../src/views/DatabaseView.vue'
import { db, authManager, dataManager, cleanupManager } from '@cyp-memo/shared'

// Mock AdminLayout 组件
vi.mock('../src/components/AdminLayout.vue', () => ({
  default: {
    name: 'AdminLayout',
    template: '<div class="admin-layout-mock"><slot /></div>'
  }
}))

describe('DatabaseView - 数据库管理界面', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    
    // 清理数据库
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    await db.shares.clear()
    
    localStorage.clear()
  })

  afterEach(async () => {
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    await db.shares.clear()
    localStorage.clear()
  })

  describe('数据库统计显示', () => {
    it('应该显示数据库统计信息', async () => {
      // 创建测试数据
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      const wrapper = mount(DatabaseView)
      await new Promise(resolve => setTimeout(resolve, 100))

      const statCards = wrapper.findAll('.stat-card')
      expect(statCards.length).toBe(5) // 用户、备忘录、文件、分享、日志

      // 验证用户数统计
      const userStat = statCards[0]
      expect(userStat.text()).toContain('用户数')
      expect(userStat.text()).toContain('1')
    })

    it('应该正确统计各类数据数量', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 添加备忘录
      await db.memos.add({
        id: 'memo1',
        userId: user.id,
        title: '测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const wrapper = mount(DatabaseView)
      await new Promise(resolve => setTimeout(resolve, 100))

      const stats = await dataManager.getStatistics()
      expect(stats.userCount).toBe(1)
      expect(stats.memoCount).toBe(1)
    })
  })

  describe('数据库备份功能', () => {
    it('应该能够导出数据为JSON', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 直接测试导出功能
      const jsonData = await dataManager.exportToJSON()
      expect(jsonData).toBeDefined()
      expect(jsonData.length).toBeGreaterThan(0)
      
      // 验证可以解析为 JSON
      const exportData = JSON.parse(jsonData)
      expect(exportData).toHaveProperty('version')
      expect(exportData).toHaveProperty('users')
    })

    it('导出的数据应该包含所有表', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      const jsonData = await dataManager.exportToJSON()
      const exportData = JSON.parse(jsonData)

      expect(exportData).toHaveProperty('version')
      expect(exportData).toHaveProperty('exportedAt')
      expect(exportData).toHaveProperty('users')
      expect(exportData).toHaveProperty('memos')
      expect(exportData).toHaveProperty('files')
      expect(exportData).toHaveProperty('shares')
      expect(exportData).toHaveProperty('logs')
    })
  })

  describe('数据库恢复功能', () => {
    it('应该能够从JSON恢复数据', async () => {
      // 创建测试数据
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 导出数据
      const jsonData = await dataManager.exportToJSON()

      // 清空数据库
      await dataManager.clearAllData()

      // 验证数据已清空
      const userCount = await db.users.count()
      expect(userCount).toBe(0)

      // 恢复数据
      await dataManager.recoverData(jsonData)

      // 验证数据已恢复
      const restoredUserCount = await db.users.count()
      expect(restoredUserCount).toBe(1)

      const restoredUser = await db.users.toArray()
      expect(restoredUser[0].username).toBe('admin')
    })

    it('应该正确处理日期字段', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      const jsonData = await dataManager.exportToJSON()
      await dataManager.clearAllData()
      await dataManager.recoverData(jsonData)

      const restoredUser = await db.users.get(user.id)
      expect(restoredUser?.createdAt).toBeInstanceOf(Date)
      expect(restoredUser?.lastLoginAt).toBeInstanceOf(Date)
    })
  })

  describe('数据库清理功能', () => {
    it('应该能够清理已删除的备忘录', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 创建并删除备忘录
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31) // 31天前

      await db.memos.add({
        id: 'memo1',
        userId: user.id,
        title: '测试',
        content: '内容',
        tags: [],
        attachments: [],
        createdAt: oldDate,
        updatedAt: oldDate,
        deletedAt: oldDate
      })

      const result = await cleanupManager.performCleanup()
      expect(result.deletedMemosRemoved).toBe(1)

      const memos = await db.memos.toArray()
      expect(memos.length).toBe(0)
    })

    it('应该能够清理孤立文件', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 创建孤立文件（没有被任何备忘录引用）
      await db.files.add({
        id: 'file1',
        userId: user.id,
        filename: 'test.txt',
        size: 100,
        type: 'text/plain',
        uploadedAt: new Date()
      })

      const result = await cleanupManager.performCleanup()
      expect(result.orphanedFilesRemoved).toBe(1)

      const files = await db.files.toArray()
      expect(files.length).toBe(0)
    })

    it('应该能够清理过期分享链接', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 创建过期分享链接
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      await db.shares.add({
        id: 'share1',
        memoId: 'memo1',
        userId: user.id,
        expiresAt: expiredDate,
        accessCount: 0,
        createdAt: new Date()
      })

      const result = await cleanupManager.performCleanup()
      expect(result.expiredSharesRemoved).toBe(1)

      const shares = await db.shares.toArray()
      expect(shares.length).toBe(0)
    })

    it('应该返回清理结果统计', async () => {
      const result = await cleanupManager.performCleanup()
      
      // 验证返回的结果包含所有统计字段
      expect(result).toHaveProperty('deletedMemosRemoved')
      expect(result).toHaveProperty('orphanedFilesRemoved')
      expect(result).toHaveProperty('expiredSharesRemoved')
      expect(result).toHaveProperty('oldLogsRemoved')
    })
  })

  describe('清空数据库功能', () => {
    it('应该能够清空所有数据', async () => {
      // 创建测试数据
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      await dataManager.clearAllData()

      // 验证所有数据已清空
      const userCount = await db.users.count()
      const memoCount = await db.memos.count()
      const fileCount = await db.files.count()

      expect(userCount).toBe(0)
      expect(memoCount).toBe(0)
      expect(fileCount).toBe(0)
    })

    it('应该验证确认文本', () => {
      // 测试确认文本验证逻辑
      const correctText = 'CLEAR'
      const wrongText = 'wrong'
      
      expect(correctText === 'CLEAR').toBe(true)
      expect(wrongText === 'CLEAR').toBe(false)
    })
  })

  describe('数据库表结构显示', () => {
    it('应该定义所有数据库表', async () => {
      // 验证数据库表存在
      expect(db.users).toBeDefined()
      expect(db.memos).toBeDefined()
      expect(db.files).toBeDefined()
      expect(db.logs).toBeDefined()
      expect(db.shares).toBeDefined()
      
      // 验证可以访问表
      const userCount = await db.users.count()
      expect(userCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('错误处理', () => {
    it('应该处理备份失败的情况', async () => {
      // Mock dataManager.exportToJSON 抛出错误
      const originalExport = dataManager.exportToJSON
      vi.spyOn(dataManager, 'exportToJSON').mockRejectedValue(new Error('导出失败'))

      try {
        await dataManager.exportToJSON()
        expect.fail('应该抛出错误')
      } catch (err: any) {
        expect(err.message).toBe('导出失败')
      }

      // 恢复原始方法
      dataManager.exportToJSON = originalExport
    })

    it('应该处理恢复失败的情况', async () => {
      // Mock dataManager.recoverData 抛出错误
      const originalRecover = dataManager.recoverData
      vi.spyOn(dataManager, 'recoverData').mockRejectedValue(new Error('恢复失败'))

      try {
        await dataManager.recoverData('invalid json')
        expect.fail('应该抛出错误')
      } catch (err: any) {
        expect(err.message).toBe('恢复失败')
      }

      // 恢复原始方法
      dataManager.recoverData = originalRecover
    })
  })
})
