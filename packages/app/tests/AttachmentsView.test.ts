/**
 * 附件管理界面单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AttachmentsView from '../src/views/AttachmentsView.vue'
import { useAuthStore } from '../src/stores/auth'
import { fileManager } from '@cyp-memo/shared'
import type { FileMetadata } from '@cyp-memo/shared'

// Mock Element Plus icons
vi.mock('@element-plus/icons-vue', () => ({
  Files: { name: 'Files' },
  Picture: { name: 'Picture' },
  Document: { name: 'Document' },
  Folder: { name: 'Folder' },
  FolderOpened: { name: 'FolderOpened' },
  Delete: { name: 'Delete' },
  Download: { name: 'Download' },
  Clock: { name: 'Clock' },
  SuccessFilled: { name: 'SuccessFilled' },
  CircleCloseFilled: { name: 'CircleCloseFilled' },
  WarningFilled: { name: 'WarningFilled' },
  InfoFilled: { name: 'InfoFilled' },
  Close: { name: 'Close' }
}))

// Mock Element Plus message components
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    },
    ElMessageBox: {
      confirm: vi.fn()
    }
  }
})

// Import mocked functions after mock setup
import { ElMessageBox } from 'element-plus'
const mockElMessageBox = ElMessageBox as any

describe('AttachmentsView - 批量操作测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  // 创建测试文件数据
  const createTestFiles = (count: number): FileMetadata[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `file-${i}`,
      userId: 'test-user-id',
      filename: `test-file-${i}.txt`,
      size: 1024 * (i + 1),
      type: 'text/plain',
      uploadedAt: new Date(Date.now() - i * 86400000) // 每个文件相差一天
    }))
  }

  beforeEach(() => {
    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
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

  it('应该支持全选功能', async () => {
    const testFiles = createTestFiles(5)

    // Mock fileManager
    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 5120,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 验证初始状态
    expect(wrapper.vm.selectedFiles).toHaveLength(0)
    expect(wrapper.vm.selectAll).toBe(false)

    // 执行全选
    wrapper.vm.handleSelectAll(true)
    await flushPromises()

    // 验证全选结果
    expect(wrapper.vm.selectedFiles).toHaveLength(5)
    expect(wrapper.vm.selectAll).toBe(true)
    expect(wrapper.vm.selectedFiles).toEqual(testFiles.map(f => f.id))
  })

  it('应该支持取消全选功能', async () => {
    const testFiles = createTestFiles(3)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3072,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 先全选
    wrapper.vm.handleSelectAll(true)
    expect(wrapper.vm.selectedFiles).toHaveLength(3)

    // 取消全选
    wrapper.vm.handleSelectAll(false)
    await flushPromises()

    // 验证取消全选结果
    expect(wrapper.vm.selectedFiles).toHaveLength(0)
    expect(wrapper.vm.selectAll).toBe(false)
  })

  it('应该支持单个文件选择和取消选择', async () => {
    const testFiles = createTestFiles(3)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3072,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择第一个文件
    wrapper.vm.toggleFileSelection('file-0')
    expect(wrapper.vm.selectedFiles).toContain('file-0')
    expect(wrapper.vm.selectedFiles).toHaveLength(1)

    // 选择第二个文件
    wrapper.vm.toggleFileSelection('file-1')
    expect(wrapper.vm.selectedFiles).toContain('file-1')
    expect(wrapper.vm.selectedFiles).toHaveLength(2)

    // 取消选择第一个文件
    wrapper.vm.toggleFileSelection('file-0')
    expect(wrapper.vm.selectedFiles).not.toContain('file-0')
    expect(wrapper.vm.selectedFiles).toHaveLength(1)
  })

  it('应该正确显示半选状态', async () => {
    const testFiles = createTestFiles(5)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 5120,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择部分文件
    wrapper.vm.toggleFileSelection('file-0')
    wrapper.vm.toggleFileSelection('file-1')

    // 验证半选状态
    expect(wrapper.vm.isIndeterminate).toBe(true)
    expect(wrapper.vm.selectAll).toBe(false)
  })

  it('应该成功批量删除选中的文件', async () => {
    const testFiles = createTestFiles(5)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 5120,
      available: 1000000000,
      total: 1000000000
    })
    vi.spyOn(fileManager, 'deleteFiles').mockResolvedValue()

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择多个文件
    wrapper.vm.toggleFileSelection('file-0')
    wrapper.vm.toggleFileSelection('file-1')
    wrapper.vm.toggleFileSelection('file-2')

    // Mock 确认对话框
    mockElMessageBox.confirm.mockResolvedValue(true)

    // 执行批量删除
    await wrapper.vm.handleBatchDelete()
    await flushPromises()

    // 验证调用了批量删除方法
    expect(fileManager.deleteFiles).toHaveBeenCalledWith(['file-0', 'file-1', 'file-2'])
    
    // 验证选中列表已清空
    expect(wrapper.vm.selectedFiles).toHaveLength(0)
  })

  it('应该在用户取消批量删除时不执行删除操作', async () => {
    const testFiles = createTestFiles(3)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3072,
      available: 1000000000,
      total: 1000000000
    })
    vi.spyOn(fileManager, 'deleteFiles').mockResolvedValue()

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择文件
    wrapper.vm.toggleFileSelection('file-0')
    wrapper.vm.toggleFileSelection('file-1')

    // Mock 用户取消
    mockElMessageBox.confirm.mockRejectedValue('cancel')

    // 尝试批量删除
    await wrapper.vm.handleBatchDelete()
    await flushPromises()

    // 验证没有调用删除方法
    expect(fileManager.deleteFiles).not.toHaveBeenCalled()
    
    // 验证选中列表未清空
    expect(wrapper.vm.selectedFiles).toHaveLength(2)
  })

  it('应该在没有选中文件时不执行批量删除', async () => {
    const testFiles = createTestFiles(3)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3072,
      available: 1000000000,
      total: 1000000000
    })
    vi.spyOn(fileManager, 'deleteFiles').mockResolvedValue()

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 不选择任何文件，直接尝试批量删除
    await wrapper.vm.handleBatchDelete()
    await flushPromises()

    // 验证没有调用删除方法
    expect(fileManager.deleteFiles).not.toHaveBeenCalled()
    
    // 验证没有显示确认对话框
    expect(mockElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('应该在批量删除后重新加载附件列表', async () => {
    const testFiles = createTestFiles(5)
    const remainingFiles = createTestFiles(2)

    // 第一次加载返回5个文件
    vi.spyOn(fileManager, 'getFilesByUploadTime')
      .mockResolvedValueOnce(testFiles)
      .mockResolvedValueOnce(remainingFiles)
    
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 2048,
      available: 1000000000,
      total: 1000000000
    })
    vi.spyOn(fileManager, 'deleteFiles').mockResolvedValue()

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 验证初始加载
    expect(wrapper.vm.allFiles).toHaveLength(5)

    // 选择并删除文件
    wrapper.vm.toggleFileSelection('file-0')
    wrapper.vm.toggleFileSelection('file-1')
    wrapper.vm.toggleFileSelection('file-2')

    mockElMessageBox.confirm.mockResolvedValue(true)

    await wrapper.vm.handleBatchDelete()
    await flushPromises()

    // 验证重新加载后的文件列表
    expect(wrapper.vm.allFiles).toHaveLength(2)
  })

  it('应该正确处理批量删除错误', async () => {
    const testFiles = createTestFiles(3)

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3072,
      available: 1000000000,
      total: 1000000000
    })
    vi.spyOn(fileManager, 'deleteFiles').mockRejectedValue(new Error('删除失败'))

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择文件
    wrapper.vm.toggleFileSelection('file-0')

    mockElMessageBox.confirm.mockResolvedValue(true)

    // 执行批量删除
    await wrapper.vm.handleBatchDelete()
    await flushPromises()

    // 验证错误被正确处理（不会抛出未捕获的异常）
    expect(fileManager.deleteFiles).toHaveBeenCalled()
  })

  it('应该在筛选后正确处理全选', async () => {
    const testFiles: FileMetadata[] = [
      {
        id: 'file-0',
        userId: 'test-user-id',
        filename: 'image1.jpg',
        size: 1024,
        type: 'image/jpeg',
        uploadedAt: new Date()
      },
      {
        id: 'file-1',
        userId: 'test-user-id',
        filename: 'image2.png',
        size: 2048,
        type: 'image/png',
        uploadedAt: new Date()
      },
      {
        id: 'file-2',
        userId: 'test-user-id',
        filename: 'doc.txt',
        size: 512,
        type: 'text/plain',
        uploadedAt: new Date()
      }
    ]

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 3584,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 筛选图片类型
    wrapper.vm.filterByType('image')
    await flushPromises()

    // 验证筛选结果
    expect(wrapper.vm.filteredFiles).toHaveLength(2)

    // 全选筛选后的文件
    wrapper.vm.handleSelectAll(true)
    await flushPromises()

    // 验证只选中了筛选后的文件
    expect(wrapper.vm.selectedFiles).toHaveLength(2)
    expect(wrapper.vm.selectedFiles).toContain('file-0')
    expect(wrapper.vm.selectedFiles).toContain('file-1')
    expect(wrapper.vm.selectedFiles).not.toContain('file-2')
  })

  it('应该在切换筛选条件时清空选中列表', async () => {
    const testFiles: FileMetadata[] = [
      {
        id: 'file-0',
        userId: 'test-user-id',
        filename: 'image.jpg',
        size: 1024,
        type: 'image/jpeg',
        uploadedAt: new Date()
      },
      {
        id: 'file-1',
        userId: 'test-user-id',
        filename: 'doc.txt',
        size: 512,
        type: 'text/plain',
        uploadedAt: new Date()
      }
    ]

    vi.spyOn(fileManager, 'getFilesByUploadTime').mockResolvedValue(testFiles)
    vi.spyOn(fileManager, 'getStorageUsage').mockResolvedValue({
      used: 1536,
      available: 1000000000,
      total: 1000000000
    })

    const wrapper = mount(AttachmentsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /><slot name="sidebar" /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElCheckbox: true,
          ElButton: true,
          ElSelect: true,
          ElOption: true,
          ElProgress: true,
          ElDialog: true,
          ElEmpty: true,
          Loading: true
        }
      }
    })
    await flushPromises()

    // 选择文件
    wrapper.vm.toggleFileSelection('file-0')
    expect(wrapper.vm.selectedFiles).toHaveLength(1)

    // 切换筛选条件
    wrapper.vm.filterByType('text')
    await flushPromises()

    // 验证选中列表已清空
    expect(wrapper.vm.selectedFiles).toHaveLength(0)
  })
})
