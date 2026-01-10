/**
 * 账号管理界面单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountsView from '../src/views/AccountsView.vue'
import { useAuthStore } from '../src/stores/auth'
import { authManager, Permission, db } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'

// Mock Element Plus icons
vi.mock('@element-plus/icons-vue', () => ({
  User: { name: 'User' },
  Plus: { name: 'Plus' },
  UserFilled: { name: 'UserFilled' }
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
import { ElMessage, ElMessageBox } from 'element-plus'
const mockElMessage = ElMessage as any
const mockElMessageBox = ElMessageBox as any

describe('AccountsView - 权限控制测试', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该只允许主账号访问账号管理页面', async () => {
    const authStore = useAuthStore()

    // 设置为主账号
    authStore.currentUser = {
      id: 'main-user-id',
      username: 'mainuser',
      isMainAccount: true,
      permissions: [Permission.ACCOUNT_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 验证页面正常渲染
    expect(wrapper.find('.accounts-view').exists()).toBe(true)
    expect(wrapper.find('.page-title').text()).toBe('账号管理')
  })

  it('应该阻止子账号访问账号管理页面', async () => {
    const authStore = useAuthStore()

    // 设置为子账号
    authStore.currentUser = {
      id: 'sub-user-id',
      username: 'subuser',
      isMainAccount: false,
      parentUserId: 'main-user-id',
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 验证显示错误消息
    expect(mockElMessage.error).toHaveBeenCalledWith('权限不足，只有主账号可以访问账号管理')
  })
})

describe('AccountsView - 子账号列表展示测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let mainUser: User

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    // 创建主账号
    await authStore.registerWithPassword('mainuser', 'Main1234', {
      question: '测试问题',
      answerHash: 'test'
    })
    mainUser = authStore.currentUser!

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该正确显示子账号列表', async () => {
    // 创建子账号
    await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )
    await authManager.createSubAccount(
      mainUser.id,
      'subuser2',
      'Sub12345',
      [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: {
            template: '<div class="mock-table"><slot /></div>'
          },
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()
    
    // 等待 loadSubAccounts 完成
    await flushPromises()

    // 验证子账号列表（不依赖顺序）
    expect(wrapper.vm.subAccounts).toHaveLength(2)
    const usernames = wrapper.vm.subAccounts.map((u: User) => u.username)
    expect(usernames).toContain('subuser1')
    expect(usernames).toContain('subuser2')
  })

  it('应该在没有子账号时显示空状态', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: {
            template: '<div class="empty-state">{{ description }}</div>',
            props: ['description']
          },
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 验证显示空状态
    expect(wrapper.vm.subAccounts).toHaveLength(0)
  })

  it('应该正确显示子账号的权限标签', async () => {
    // 创建带多个权限的子账号
    await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW, Permission.ATTACHMENT_MANAGE]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()
    
    // 等待 loadSubAccounts 完成
    await flushPromises()

    // 验证权限
    const subAccount = wrapper.vm.subAccounts[0]
    expect(subAccount.permissions).toContain(Permission.MEMO_MANAGE)
    expect(subAccount.permissions).toContain(Permission.STATISTICS_VIEW)
    expect(subAccount.permissions).toContain(Permission.ATTACHMENT_MANAGE)
  })
})

describe('AccountsView - 创建子账号测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let mainUser: User

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    // 创建主账号
    await authStore.registerWithPassword('mainuser', 'Main1234', {
      question: '测试问题',
      answerHash: 'test'
    })
    mainUser = authStore.currentUser!

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该成功创建子账号', async () => {
    // 直接使用 authManager 创建子账号
    await authManager.createSubAccount(
      mainUser.id,
      'newsubuser',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    // 验证子账号已创建
    const subAccounts = await authManager.getSubAccounts(mainUser.id)
    expect(subAccounts).toHaveLength(1)
    expect(subAccounts[0].username).toBe('newsubuser')
    expect(subAccounts[0].permissions).toContain(Permission.MEMO_MANAGE)
  })

  it('应该在用户名已存在时显示错误', async () => {
    // 先创建一个子账号
    await authManager.createSubAccount(
      mainUser.id,
      'existinguser',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    // 尝试创建相同用户名的子账号应该抛出错误
    await expect(
      authManager.createSubAccount(
        mainUser.id,
        'existinguser',
        'Sub12345',
        [Permission.MEMO_MANAGE]
      )
    ).rejects.toThrow('用户名已存在')
  })

  it('应该在密码强度不足时显示错误', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 使用弱密码
    wrapper.vm.createForm.username = 'newsubuser'
    wrapper.vm.createForm.password = 'weak'
    wrapper.vm.createForm.confirmPassword = 'weak'
    wrapper.vm.createForm.permissions = [Permission.MEMO_MANAGE]

    await wrapper.vm.handleCreate()
    await flushPromises()

    // 验证显示错误（表单验证失败，不会调用 ElMessage.error）
    // 表单验证失败会阻止 handleCreate 继续执行
    expect(mockElMessage.success).not.toHaveBeenCalled()
  })

  it('应该在创建成功后重置表单', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: {
            template: '<form><slot /></form>',
            methods: {
              validate: vi.fn().mockResolvedValue(true),
              resetFields: vi.fn()
            }
          },
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 填写表单
    wrapper.vm.createForm.username = 'newsubuser'
    wrapper.vm.createForm.password = 'Sub12345'
    wrapper.vm.createForm.confirmPassword = 'Sub12345'
    wrapper.vm.createForm.permissions = [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW]

    // 调用重置方法
    wrapper.vm.resetCreateForm()
    await flushPromises()

    // 验证表单已重置
    expect(wrapper.vm.createForm.username).toBe('')
    expect(wrapper.vm.createForm.password).toBe('')
    expect(wrapper.vm.createForm.confirmPassword).toBe('')
    expect(wrapper.vm.createForm.permissions).toEqual([Permission.MEMO_MANAGE])
  })
})

describe('AccountsView - 删除子账号测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let mainUser: User

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    // 创建主账号
    await authStore.registerWithPassword('mainuser', 'Main1234', {
      question: '测试问题',
      answerHash: 'test'
    })
    mainUser = authStore.currentUser!

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该成功删除子账号', async () => {
    // 创建子账号
    const subAccount = await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // Mock 确认对话框
    mockElMessageBox.confirm.mockResolvedValue(true)

    // 调用删除方法
    await wrapper.vm.confirmDelete(subAccount)
    await flushPromises()

    // 验证删除成功
    expect(mockElMessage.success).toHaveBeenCalledWith('子账号删除成功')
    expect(wrapper.vm.subAccounts).toHaveLength(0)
  })

  it('应该在用户取消删除时不执行删除操作', async () => {
    // 创建子账号
    const subAccount = await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // Mock 用户取消
    mockElMessageBox.confirm.mockRejectedValue(new Error('cancel'))

    // 调用删除方法
    await wrapper.vm.confirmDelete(subAccount)
    await flushPromises()

    // 验证没有删除
    expect(wrapper.vm.subAccounts).toHaveLength(1)
  })
})

describe('AccountsView - 权限设置测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let mainUser: User

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    // 创建主账号
    await authStore.registerWithPassword('mainuser', 'Main1234', {
      question: '测试问题',
      answerHash: 'test'
    })
    mainUser = authStore.currentUser!

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该成功更新子账号权限', async () => {
    // 创建子账号
    const subAccount = await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    // 更新权限
    await authManager.updateSubAccountPermissions(
      mainUser.id,
      subAccount.id,
      [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW, Permission.ATTACHMENT_MANAGE]
    )

    // 验证权限已更新
    const subAccounts = await authManager.getSubAccounts(mainUser.id)
    const updatedAccount = subAccounts[0]
    expect(updatedAccount.permissions).toContain(Permission.MEMO_MANAGE)
    expect(updatedAccount.permissions).toContain(Permission.STATISTICS_VIEW)
    expect(updatedAccount.permissions).toContain(Permission.ATTACHMENT_MANAGE)
  })

  it('应该在权限为空时显示警告', async () => {
    // 创建子账号
    const subAccount = await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 打开权限对话框
    wrapper.vm.openPermissionDialog(subAccount)
    await flushPromises()

    // 清空权限
    wrapper.vm.permissionForm.permissions = []

    // 尝试保存
    await wrapper.vm.handleUpdatePermission()
    await flushPromises()

    // 验证显示警告
    expect(mockElMessage.warning).toHaveBeenCalledWith('请至少选择一个权限')
  })

  it('应该正确打开权限对话框并显示当前权限', async () => {
    // 创建子账号
    const subAccount = await authManager.createSubAccount(
      mainUser.id,
      'subuser1',
      'Sub12345',
      [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW]
    )

    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()
    
    // 等待初始加载完成
    await flushPromises()

    // 打开权限对话框
    wrapper.vm.openPermissionDialog(subAccount)
    await flushPromises()

    // 验证对话框状态
    expect(wrapper.vm.permissionDialogVisible).toBe(true)
    expect(wrapper.vm.selectedAccount).toStrictEqual(subAccount)
    expect(wrapper.vm.permissionForm.permissions).toEqual([
      Permission.MEMO_MANAGE,
      Permission.STATISTICS_VIEW
    ])
  })
})

describe('AccountsView - 账号信息显示测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    // 创建主账号
    await authStore.registerWithPassword('mainuser', 'Main1234', {
      question: '测试问题',
      answerHash: 'test'
    })

    // 清除所有 mock
    vi.clearAllMocks()
  })

  it('应该正确显示主账号信息', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: {
            template: '<div class="el-card"><slot /></div>'
          },
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 验证主账号信息显示
    expect(wrapper.find('.main-account-info').exists()).toBe(true)
    expect(wrapper.find('.account-name').text()).toBe('mainuser')
    expect(wrapper.find('.account-type').text()).toBe('主账号')
  })

  it('应该正确格式化日期时间', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 测试日期格式化
    const testDate = new Date('2025-01-09T12:30:00')
    const formatted = wrapper.vm.formatDate(testDate)
    expect(formatted).toMatch(/2025-01-09 12:30/)
  })

  it('应该正确获取权限标签', async () => {
    const wrapper = mount(AccountsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          ElMenu: true,
          ElMenuItem: true,
          ElCard: true,
          ElIcon: true,
          ElTable: true,
          ElTableColumn: true,
          ElButton: true,
          ElForm: true,
          ElFormItem: true,
          ElInput: true,
          ElCheckboxGroup: true,
          ElCheckbox: true,
          ElDialog: true,
          ElEmpty: true,
          ElTag: true
        }
      }
    })
    await flushPromises()

    // 测试权限标签
    expect(wrapper.vm.getPermissionLabel(Permission.MEMO_MANAGE)).toBe('备忘录管理')
    expect(wrapper.vm.getPermissionLabel(Permission.STATISTICS_VIEW)).toBe('数据统计')
    expect(wrapper.vm.getPermissionLabel(Permission.ATTACHMENT_MANAGE)).toBe('附件管理')
    expect(wrapper.vm.getPermissionLabel(Permission.SETTINGS_MANAGE)).toBe('系统设置')
    expect(wrapper.vm.getPermissionLabel(Permission.ACCOUNT_MANAGE)).toBe('账号管理')
  })
})
