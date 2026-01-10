/**
 * 统计界面单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatisticsView from '../src/views/StatisticsView.vue'
import { useAuthStore } from '../src/stores/auth'
import { memoManager, fileManager } from '@cyp-memo/shared'
import type { Memo, FileMetadata } from '@cyp-memo/shared'

// Mock router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush
  })
}))

// Mock Chart.js components
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    template: '<div class="mock-line-chart"></div>'
  },
  Doughnut: {
    name: 'Doughnut',
    template: '<div class="mock-doughnut-chart"></div>'
  }
}))

// Mock Element Plus icons
vi.mock('@element-plus/icons-vue', () => ({
  Document: { name: 'Document' },
  CollectionTag: { name: 'CollectionTag' },
  Paperclip: { name: 'Paperclip' },
  FolderOpened: { name: 'FolderOpened' },
  DataAnalysis: { name: 'DataAnalysis' },
  TrendCharts: { name: 'TrendCharts' }
}))

describe('StatisticsView - 数据计算测试', () => {
  let authStore: ReturnType<typeof useAuthStore>

  // 辅助函数：创建包装器并加载数据
  async function createWrapperAndLoadData() {
    const wrapper = mount(StatisticsView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElEmpty: true,
          ElProgress: true,
          Line: true,
          Doughnut: true
        }
      }
    })

    // 确保 authStore 已设置
    const store = useAuthStore()
    store.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    // 手动调用 loadStatistics 方法
    await (wrapper.vm as any).loadStatistics()
    
    return wrapper
  }

  beforeEach(() => {
    // 创建新的 Pinia 实例
    setActivePinia(createPinia())
    authStore = useAuthStore()

    // 设置测试用户
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该正确计算备忘录总数', async () => {
    // 准备测试数据
    const testMemos: Memo[] = [
      {
        id: '1',
        userId: 'test-user-id',
        title: '备忘录1',
        content: '内容1',
        tags: ['标签1'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        userId: 'test-user-id',
        title: '备忘录2',
        content: '内容2',
        tags: ['标签2'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '3',
        userId: 'test-user-id',
        title: '备忘录3',
        content: '内容3',
        tags: ['标签1', '标签2'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    // Mock memoManager
    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue(testMemos)
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue(['标签1', '标签2'])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证备忘录总数
    expect(wrapper.vm.statistics.memoCount).toBe(3)
  })

  it('应该正确计算标签总数', async () => {
    const testMemos: Memo[] = [
      {
        id: '1',
        userId: 'test-user-id',
        title: '备忘录1',
        content: '内容1',
        tags: ['标签1', '标签2'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue(testMemos)
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue(['标签1', '标签2', '标签3'])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    expect(wrapper.vm.statistics.tagCount).toBe(3)
  })

  it('应该正确计算附件总数和总大小', async () => {
    const testFiles: FileMetadata[] = [
      {
        id: '1',
        userId: 'test-user-id',
        filename: 'file1.txt',
        size: 1024,
        type: 'text/plain',
        uploadedAt: new Date()
      },
      {
        id: '2',
        userId: 'test-user-id',
        filename: 'file2.jpg',
        size: 2048,
        type: 'image/jpeg',
        uploadedAt: new Date()
      },
      {
        id: '3',
        userId: 'test-user-id',
        filename: 'file3.pdf',
        size: 4096,
        type: 'application/pdf',
        uploadedAt: new Date()
      }
    ]

    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue([])
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue([])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 7168,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    expect(wrapper.vm.statistics.attachmentCount).toBe(3)
    expect(wrapper.vm.statistics.attachmentSize).toBe(7168) // 1024 + 2048 + 4096
  })

  it('应该正确计算标签排行', async () => {
    const testMemos: Memo[] = [
      {
        id: '1',
        userId: 'test-user-id',
        title: '备忘录1',
        content: '内容1',
        tags: ['标签A', '标签B'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        userId: 'test-user-id',
        title: '备忘录2',
        content: '内容2',
        tags: ['标签A', '标签C'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '3',
        userId: 'test-user-id',
        title: '备忘录3',
        content: '内容3',
        tags: ['标签A'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '4',
        userId: 'test-user-id',
        title: '备忘录4',
        content: '内容4',
        tags: ['标签B'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue(testMemos)
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue(['标签A', '标签B', '标签C'])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证标签排行：标签A(3次) > 标签B(2次) > 标签C(1次)
    expect(wrapper.vm.statistics.tagRanking).toHaveLength(3)
    expect(wrapper.vm.statistics.tagRanking[0]).toEqual({ tag: '标签A', count: 3 })
    expect(wrapper.vm.statistics.tagRanking[1]).toEqual({ tag: '标签B', count: 2 })
    expect(wrapper.vm.statistics.tagRanking[2]).toEqual({ tag: '标签C', count: 1 })
  })

  it('应该正确计算最近7天的趋势数据', async () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    const testMemos: Memo[] = [
      {
        id: '1',
        userId: 'test-user-id',
        title: '今天的备忘录1',
        content: '内容1',
        tags: [],
        attachments: [],
        createdAt: today,
        updatedAt: today
      },
      {
        id: '2',
        userId: 'test-user-id',
        title: '今天的备忘录2',
        content: '内容2',
        tags: [],
        attachments: [],
        createdAt: today,
        updatedAt: today
      },
      {
        id: '3',
        userId: 'test-user-id',
        title: '昨天的备忘录',
        content: '内容3',
        tags: [],
        attachments: [],
        createdAt: yesterday,
        updatedAt: yesterday
      },
      {
        id: '4',
        userId: 'test-user-id',
        title: '两天前的备忘录',
        content: '内容4',
        tags: [],
        attachments: [],
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo
      }
    ]

    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue(testMemos)
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue([])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证趋势数据应该有7天
    expect(wrapper.vm.statistics.trendData).toHaveLength(7)

    // 验证今天的数据
    const todayData = wrapper.vm.statistics.trendData[6]
    expect(todayData.count).toBe(2)

    // 验证昨天的数据
    const yesterdayData = wrapper.vm.statistics.trendData[5]
    expect(yesterdayData.count).toBe(1)

    // 验证两天前的数据
    const twoDaysAgoData = wrapper.vm.statistics.trendData[4]
    expect(twoDaysAgoData.count).toBe(1)
  })

  it('应该正确计算存储空间使用百分比', async () => {
    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue([])
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue([])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 500000000, // 500MB
      available: 500000000, // 500MB
      total: 1000000000 // 1GB
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证存储空间数据
    expect(wrapper.vm.statistics.storageUsed).toBe(500000000)
    expect(wrapper.vm.statistics.storageAvailable).toBe(500000000)
    expect(wrapper.vm.statistics.storageTotal).toBe(1000000000)

    // 验证百分比计算
    expect(wrapper.vm.storagePercentage).toBe(50)
  })

  it('应该正确处理空数据情况', async () => {
    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue([])
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue([])
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证所有统计数据为0
    expect(wrapper.vm.statistics.memoCount).toBe(0)
    expect(wrapper.vm.statistics.tagCount).toBe(0)
    expect(wrapper.vm.statistics.attachmentCount).toBe(0)
    expect(wrapper.vm.statistics.attachmentSize).toBe(0)
    expect(wrapper.vm.statistics.tagRanking).toHaveLength(0)
    expect(wrapper.vm.statistics.trendData).toHaveLength(7) // 仍然有7天数据，只是count为0
    expect(wrapper.vm.storagePercentage).toBe(0)
  })

  it('应该限制标签排行只显示前10个', async () => {
    // 创建15个标签的备忘录
    const testMemos: Memo[] = []
    for (let i = 0; i < 15; i++) {
      for (let j = 0; j <= i; j++) {
        testMemos.push({
          id: `memo-${i}-${j}`,
          userId: 'test-user-id',
          title: `备忘录${i}-${j}`,
          content: '内容',
          tags: [`标签${i}`],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
    }

    const allTags = Array.from({ length: 15 }, (_, i) => `标签${i}`)

    vi.spyOn(memoManager, 'getAllMemos').mockResolvedValue(testMemos)
    vi.spyOn(memoManager, 'getAllTags').mockResolvedValue(allTags)
    vi.spyOn(fileManager, 'getAllFiles').mockResolvedValue([])
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 0,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = await createWrapperAndLoadData()

    // 验证只显示前10个标签
    expect(wrapper.vm.statistics.tagRanking).toHaveLength(10)

    // 验证排序正确（标签14应该排第一，因为它有15个备忘录）
    expect(wrapper.vm.statistics.tagRanking[0].tag).toBe('标签14')
    expect(wrapper.vm.statistics.tagRanking[0].count).toBe(15)
  })
})
