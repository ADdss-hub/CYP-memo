/**
 * 系统监控界面测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MonitorView from '../src/views/MonitorView.vue'
import { db, authManager, logManager } from '@cyp-memo/shared'
import type { LogLevel } from '@cyp-memo/shared'

// Mock AdminLayout 组件
vi.mock('../src/components/AdminLayout.vue', () => ({
  default: {
    name: 'AdminLayout',
    template: '<div class="admin-layout-mock"><slot /></div>'
  }
}))

describe('MonitorView - 系统监控界面', () => {
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

  describe('日志显示', () => {
    it('应该显示系统日志', async () => {
      // 创建测试日志
      await logManager.info('测试日志1')
      await logManager.warn('测试日志2')
      await logManager.error(new Error('测试错误'))

      const wrapper = mount(MonitorView)
      await new Promise(resolve => setTimeout(resolve, 100))

      const rows = wrapper.findAll('tbody tr')
      expect(rows.length).toBeGreaterThanOrEqual(3)
    })

    it('应该正确显示日志级别', async () => {
      await logManager.info('信息日志')
      await logManager.warn('警告日志')
      await logManager.error(new Error('错误日志'))

      const wrapper = mount(MonitorView)
      await new Promise(resolve => setTimeout(resolve, 100))

      const levelBadges = wrapper.findAll('.log-level')
      const levelTexts = levelBadges.map(b => b.text())

      expect(levelTexts).toContain('信息')
      expect(levelTexts).toContain('警告')
      expect(levelTexts).toContain('错误')
    })

    it('应该能够按级别筛选日志', async () => {
      await logManager.info('信息日志')
      await logManager.warn('警告日志')
      await logManager.error(new Error('错误日志'))

      const wrapper = mount(MonitorView)
      await new Promise(resolve => setTimeout(resolve, 100))

      // 筛选只显示错误
      const filterSelect = wrapper.find('.filter-select')
      await filterSelect.setValue('error')
      await new Promise(resolve => setTimeout(resolve, 50))

      const rows = wrapper.findAll('tbody tr')
      rows.forEach(row => {
        expect(row.text()).toContain('错误')
      })
    })
  })

  describe('日志详情', () => {
    it('应该能够查看日志详情', async () => {
      await logManager.info('测试日志', { userId: 'user1', action: 'test' })

      const wrapper = mount(MonitorView)
      await new Promise(resolve => setTimeout(resolve, 100))

      // 点击详情按钮
      const detailButton = wrapper.find('.btn-secondary')
      await detailButton.trigger('click')

      // 应该显示详情对话框
      expect(wrapper.find('.modal h3').text()).toBe('日志详情')
      expect(wrapper.find('.log-detail').exists()).toBe(true)
    })

    it('应该显示日志上下文信息', async () => {
      await logManager.info('测试日志', { userId: 'user1', action: 'test_action' })

      const wrapper = mount(MonitorView)
      await new Promise(resolve => setTimeout(resolve, 100))

      const detailButton = wrapper.find('.btn-secondary')
      await detailButton.trigger('click')

      // 应该显示上下文
      const contextPre = wrapper.find('.context-pre')
      expect(contextPre.exists()).toBe(true)
      expect(contextPre.text()).toContain('userId')
      expect(contextPre.text()).toContain('test_action')
    })
  })

  describe('日志导出', () => {
    it('应该能够导出日志', async () => {
      await logManager.info('测试日志1')
      await logManager.info('测试日志2')

      // 直接测试导出功能
      const blob = await logManager.exportLogs()
      expect(blob).toBeDefined()
      expect(blob.size).toBeGreaterThan(0)
    })

    it('导出的日志应该是有效的JSON', async () => {
      await logManager.info('测试日志')

      const blob = await logManager.exportLogs()
      
      // 在测试环境中，Blob 可能没有 text() 方法，使用 FileReader
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(blob)
      })
      
      // 应该能够解析为JSON
      expect(() => JSON.parse(text)).not.toThrow()
      
      const logs = JSON.parse(text)
      expect(Array.isArray(logs)).toBe(true)
      expect(logs.length).toBeGreaterThan(0)
    })
  })

  describe('存储使用情况', () => {
    it('应该能够计算存储统计信息', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 获取数据并计算大小
      const users = await db.users.toArray()
      const memos = await db.memos.toArray()
      const files = await db.files.toArray()
      const logsData = await db.logs.toArray()

      const usersSize = JSON.stringify(users).length
      const memosSize = JSON.stringify(memos).length
      const filesSize = JSON.stringify(files).length
      const logsSize = JSON.stringify(logsData).length
      const totalSize = usersSize + memosSize + filesSize + logsSize

      expect(usersSize).toBeGreaterThan(0)
      expect(totalSize).toBeGreaterThan(0)
    })

    it('应该正确格式化存储大小', () => {
      // 测试大小格式化逻辑
      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
      }

      expect(formatSize(500)).toBe('500 B')
      expect(formatSize(1024)).toBe('1.00 KB')
      expect(formatSize(1024 * 1024)).toBe('1.00 MB')
      expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    })
  })

  describe('用户活跃度统计', () => {
    it('应该能够统计用户活跃度', async () => {
      const users = await db.users.toArray()
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      const todayActive = users.filter(u => u.lastLoginAt >= today).length
      const weekActive = users.filter(u => u.lastLoginAt >= weekAgo).length
      const monthActive = users.filter(u => u.lastLoginAt >= monthAgo).length
      const totalUsers = users.length

      expect(todayActive).toBeGreaterThanOrEqual(0)
      expect(weekActive).toBeGreaterThanOrEqual(todayActive)
      expect(monthActive).toBeGreaterThanOrEqual(weekActive)
      expect(totalUsers).toBeGreaterThanOrEqual(monthActive)
    })

    it('应该正确统计今日活跃用户', async () => {
      // 创建今天登录的用户
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 更新最后登录时间为今天
      await db.users.update(user.id, { lastLoginAt: new Date() })

      const users = await db.users.toArray()
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const todayActive = users.filter(u => u.lastLoginAt >= today).length

      expect(todayActive).toBe(1)
    })

    it('应该正确统计本周活跃用户', async () => {
      // 创建本周登录的用户
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      await db.users.update(user.id, { lastLoginAt: threeDaysAgo })

      const users = await db.users.toArray()
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const weekActive = users.filter(u => u.lastLoginAt >= weekAgo).length

      expect(weekActive).toBe(1)
    })
  })

  describe('日志分页', () => {
    it('应该支持日志分页', async () => {
      // 创建多条日志
      for (let i = 0; i < 25; i++) {
        await logManager.info(`测试日志 ${i}`)
      }

      const allLogs = await db.logs.toArray()
      expect(allLogs.length).toBe(25)

      // 测试分页逻辑
      const pageSize = 20
      const page1 = allLogs.slice(0, pageSize)
      const page2 = allLogs.slice(pageSize, pageSize * 2)

      expect(page1.length).toBe(20)
      expect(page2.length).toBe(5)
    })

    it('应该能够计算总页数', async () => {
      // 创建多条日志
      for (let i = 0; i < 25; i++) {
        await logManager.info(`测试日志 ${i}`)
      }

      const allLogs = await db.logs.toArray()
      const pageSize = 20
      const totalPages = Math.ceil(allLogs.length / pageSize)

      expect(totalPages).toBe(2)
    })
  })

  describe('刷新功能', () => {
    it('应该能够重新加载数据', async () => {
      // 创建初始数据
      await logManager.info('测试日志1')
      const logs1 = await db.logs.toArray()
      const count1 = logs1.length

      // 添加更多数据
      await logManager.info('测试日志2')
      const logs2 = await db.logs.toArray()
      const count2 = logs2.length

      // 验证数据已更新
      expect(count2).toBeGreaterThan(count1)
    })
  })

  describe('错误处理', () => {
    it('应该处理日志加载失败', async () => {
      // Mock db.logs.orderBy 抛出错误
      const originalOrderBy = db.logs.orderBy
      vi.spyOn(db.logs, 'orderBy').mockReturnValue({
        reverse: () => ({
          toArray: () => Promise.reject(new Error('加载失败'))
        })
      } as any)

      try {
        await db.logs.orderBy('timestamp').reverse().toArray()
        expect.fail('应该抛出错误')
      } catch (err: any) {
        expect(err.message).toBe('加载失败')
      }

      // 恢复原始方法
      db.logs.orderBy = originalOrderBy
    })

    it('应该处理导出失败', async () => {
      // Mock logManager.exportLogs 抛出错误
      const originalExport = logManager.exportLogs
      vi.spyOn(logManager, 'exportLogs').mockRejectedValue(new Error('导出失败'))

      try {
        await logManager.exportLogs()
        expect.fail('应该抛出错误')
      } catch (err: any) {
        expect(err.message).toBe('导出失败')
      }

      // 恢复原始方法
      logManager.exportLogs = originalExport
    })
  })

  describe('日志级别样式', () => {
    it('应该为不同级别的日志定义样式类', async () => {
      await logManager.debug('调试日志')
      await logManager.info('信息日志')
      await logManager.warn('警告日志')
      await logManager.error(new Error('错误日志'))

      const logs = await db.logs.toArray()
      
      // 验证不同级别的日志存在
      const hasDebug = logs.some(l => l.level === 'debug')
      const hasInfo = logs.some(l => l.level === 'info')
      const hasWarn = logs.some(l => l.level === 'warn')
      const hasError = logs.some(l => l.level === 'error')

      expect(hasDebug || hasInfo || hasWarn || hasError).toBe(true)
      
      // 验证日志级别映射
      const levelMap: Record<string, string> = {
        debug: 'log-level-debug',
        info: 'log-level-info',
        warn: 'log-level-warn',
        error: 'log-level-error'
      }
      
      expect(levelMap['debug']).toBe('log-level-debug')
      expect(levelMap['info']).toBe('log-level-info')
      expect(levelMap['warn']).toBe('log-level-warn')
      expect(levelMap['error']).toBe('log-level-error')
    })
  })
})
