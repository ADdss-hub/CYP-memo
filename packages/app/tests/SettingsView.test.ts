/**
 * 设置界面单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '../src/views/SettingsView.vue'
import { useAuthStore } from '../src/stores/auth'
import { useSettingsStore } from '../src/stores/settings'
import { dataManager, db } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'

// Mock toast composable
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn()
}

vi.mock('../src/composables/useToast', () => ({
  useToast: () => mockToast
}))

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn()
  }
})

describe('SettingsView - 设置保存测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let settingsStore: ReturnType<typeof useSettingsStore>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()
    settingsStore = useSettingsStore()

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该成功保存主题设置', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 获取初始主题
    const initialTheme = settingsStore.settings.theme

    // 切换主题
    wrapper.vm.localTheme = 'dark'
    await wrapper.vm.handleThemeChange()
    await flushPromises()

    // 验证主题已更新
    expect(settingsStore.settings.theme).toBe('dark')
    expect(mockToast.success).toHaveBeenCalledWith('主题已更新')
    expect(document.body.getAttribute('data-theme')).toBe('dark')
  })

  it('应该成功保存字体大小设置', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 切换字体大小
    wrapper.vm.localFontSize = 'large'
    await wrapper.vm.handleFontSizeChange()
    await flushPromises()

    // 验证字体大小已更新
    expect(settingsStore.settings.fontSize).toBe('large')
    expect(mockToast.success).toHaveBeenCalledWith('字体大小已更新')
    expect(document.body.getAttribute('data-font-size')).toBe('large')
  })

  it('应该成功保存语言设置', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 切换语言
    wrapper.vm.localLanguage = 'en-US'
    await wrapper.vm.handleLanguageChange()
    await flushPromises()

    // 验证语言已更新
    expect(settingsStore.settings.language).toBe('en-US')
    expect(mockToast.success).toHaveBeenCalledWith('语言已更新')
  })

  it('应该在设置保存失败时显示错误', async () => {
    // Mock saveSettings 抛出错误
    vi.spyOn(settingsStore, 'setTheme').mockRejectedValue(new Error('保存失败'))

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试切换主题
    wrapper.vm.localTheme = 'dark'
    await wrapper.vm.handleThemeChange()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('主题更新失败')
  })

  it('应该在组件挂载时应用当前设置', async () => {
    // 设置初始值
    settingsStore.settings.theme = 'dark'
    settingsStore.settings.fontSize = 'large'

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 验证设置已应用到 body
    expect(document.body.getAttribute('data-theme')).toBe('dark')
    expect(document.body.getAttribute('data-font-size')).toBe('large')
  })
})

describe('SettingsView - 令牌管理测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(async () => {
    await db.delete()
    await db.open()

    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    vi.clearAllMocks()
  })

  it('应该正确切换令牌可见性', async () => {
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      token: 'test-token-12345',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 初始状态应该隐藏
    expect(wrapper.vm.showToken).toBe(false)

    // 切换显示
    wrapper.vm.toggleTokenVisibility()
    expect(wrapper.vm.showToken).toBe(true)

    // 再次切换隐藏
    wrapper.vm.toggleTokenVisibility()
    expect(wrapper.vm.showToken).toBe(false)
  })

  it('应该成功复制令牌到剪贴板', async () => {
    const testToken = 'test-token-12345'
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      token: testToken,
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 复制令牌
    await wrapper.vm.copyToken()
    await flushPromises()

    // 验证复制成功
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testToken)
    expect(mockToast.success).toHaveBeenCalledWith('令牌已复制到剪贴板')
  })

  it('应该在没有令牌时显示错误', async () => {
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      passwordHash: 'hash',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试复制令牌
    await wrapper.vm.copyToken()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('没有可复制的令牌')
  })

  it('应该在复制失败时显示错误', async () => {
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      token: 'test-token-12345',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    // Mock clipboard 失败
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('复制失败'))

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试复制令牌
    await wrapper.vm.copyToken()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('复制失败，请手动复制')
  })
})

describe('SettingsView - 安全问题更新测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(async () => {
    await db.delete()
    await db.open()

    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    vi.clearAllMocks()
  })

  it('应该在用户未登录时显示错误', async () => {
    authStore.currentUser = null

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试更新安全问题
    await wrapper.vm.handleUpdateSecurityQuestion()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('用户未登录')
  })
})

describe('SettingsView - 数据管理测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(async () => {
    await db.delete()
    await db.open()

    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    vi.clearAllMocks()
  })

  it('应该成功清除缓存', async () => {
    // 设置一些缓存数据
    localStorage.setItem('cyp-memo-auth', JSON.stringify({ test: 'auth' }))
    localStorage.setItem('cyp-memo-settings', JSON.stringify({ test: 'settings' }))
    localStorage.setItem('some-cache', 'cache-data')

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 清除缓存
    await wrapper.vm.handleClearCache()
    await flushPromises()

    // 验证缓存已清除，但认证和设置保留
    expect(localStorage.getItem('cyp-memo-auth')).toBeTruthy()
    expect(localStorage.getItem('cyp-memo-settings')).toBeTruthy()
    expect(localStorage.getItem('some-cache')).toBeNull()
    expect(mockToast.success).toHaveBeenCalledWith('缓存已清除')
  })

  it('应该在导出失败时显示错误', async () => {
    // Mock dataManager.exportToJSON 失败
    vi.spyOn(dataManager, 'exportToJSON').mockRejectedValue(new Error('导出失败'))

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试导出数据
    await wrapper.vm.handleExportData()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('数据导出失败')
  })

  it('应该在没有待导入数据时显示错误', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 尝试确认导入
    await wrapper.vm.confirmImport()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalledWith('没有待导入的数据')
  })

  it('应该成功确认导入数据', async () => {
    // Mock dataManager.importFromJSON
    vi.spyOn(dataManager, 'importFromJSON').mockResolvedValue(undefined)
    vi.spyOn(authStore, 'logout').mockResolvedValue(undefined)

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 设置待导入数据
    wrapper.vm.pendingImportData = '{"test": "data"}'

    // 确认导入
    await wrapper.vm.confirmImport()
    await flushPromises()

    // 验证导入成功
    expect(dataManager.importFromJSON).toHaveBeenCalledWith('{"test": "data"}', false)
    expect(mockToast.success).toHaveBeenCalledWith('数据导入成功，请重新登录')
    expect(authStore.logout).toHaveBeenCalled()
    expect(wrapper.vm.showImportConfirm).toBe(false)
    expect(wrapper.vm.pendingImportData).toBeNull()
  })

  it('应该在导入失败时显示错误', async () => {
    // Mock dataManager.importFromJSON 失败
    vi.spyOn(dataManager, 'importFromJSON').mockRejectedValue(new Error('导入失败'))

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
            emits: ['click']
          },
          Modal: true
        }
      }
    })
    await flushPromises()

    // 设置待导入数据
    wrapper.vm.pendingImportData = '{"test": "data"}'

    // 尝试确认导入
    await wrapper.vm.confirmImport()
    await flushPromises()

    // 验证显示错误
    expect(mockToast.error).toHaveBeenCalled()
    expect(mockToast.error.mock.calls[0][0]).toContain('数据导入失败')
  })
})

describe('SettingsView - 系统信息显示测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(async () => {
    await db.delete()
    await db.open()

    pinia = createPinia()
    setActivePinia(pinia)
    authStore = useAuthStore()

    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    vi.clearAllMocks()
  })

  it('应该正确显示版本信息', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: true,
          Modal: true
        }
      }
    })
    await flushPromises()

    // 验证版本信息存在
    expect(wrapper.vm.version).toBeTruthy()
    expect(wrapper.vm.author).toBeTruthy()
    expect(wrapper.vm.email).toBeTruthy()
    expect(wrapper.vm.copyright).toBeTruthy()
  })

  it('应该正确显示账号信息', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: true,
          Modal: true
        }
      }
    })
    await flushPromises()

    // 验证用户名显示
    expect(authStore.username).toBe('testuser')
  })

  it('应该在有令牌时显示令牌信息', async () => {
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      token: 'test-token-12345',
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: true,
          Modal: true
        }
      }
    })
    await flushPromises()

    // 验证令牌存在
    expect(authStore.currentUser.token).toBe('test-token-12345')
  })

  it('应该在有安全问题时显示安全问题', async () => {
    authStore.currentUser = {
      id: 'test-user-id',
      username: 'testuser',
      passwordHash: 'hash',
      securityQuestion: {
        question: '测试问题',
        answerHash: 'hash'
      },
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false
    }

    const wrapper = mount(SettingsView, {
      global: {
        plugins: [pinia],
        stubs: {
          AppLayout: {
            template: '<div><slot /></div>'
          },
          Button: true,
          Modal: true
        }
      }
    })
    await flushPromises()

    // 验证安全问题存在
    expect(authStore.currentUser.securityQuestion?.question).toBe('测试问题')
  })
})
