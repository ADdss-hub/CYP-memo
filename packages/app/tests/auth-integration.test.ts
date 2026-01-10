/**
 * CYP-memo 认证界面集成测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../src/views/auth/LoginView.vue'
import RegisterView from '../src/views/auth/RegisterView.vue'
import { useAuthStore } from '../src/stores/auth'
import { db } from '@cyp-memo/shared'

// Mock Element Plus icons
vi.mock('@element-plus/icons-vue', () => ({
  View: { name: 'View' },
  Hide: { name: 'Hide' },
  SuccessFilled: { name: 'SuccessFilled' },
  WarningFilled: { name: 'WarningFilled' },
  DocumentCopy: { name: 'DocumentCopy' }
}))

// Mock toast composable
vi.mock('../src/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  })
}))

/**
 * 创建测试路由
 */
function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/register', name: 'register', component: RegisterView },
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } }
    ]
  })
}

describe('认证界面集成测试 - 登录流程', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 创建路由实例
    router = createTestRouter()
  })

  it('应该成功完成账号密码登录流程', async () => {
    const authStore = useAuthStore()

    // 先注册一个用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
    await authStore.logout()

    // 挂载登录组件
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写登录表单
    const usernameInput = wrapper.find('#username')
    const passwordInput = wrapper.find('#password')

    await usernameInput.setValue('testuser')
    await passwordInput.setValue('Test1234')
    await flushPromises()

    // 点击登录按钮 - 直接调用组件实例的方法
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.username).toBe('testuser')
  })

  it('应该在账号密码登录失败时显示错误信息', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写错误的登录信息
    const usernameInput = wrapper.find('#username')
    const passwordInput = wrapper.find('#password')

    await usernameInput.setValue('nonexistent')
    await passwordInput.setValue('wrongpass')
    await flushPromises()

    // 调用登录方法
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
    expect(errorMessage.text()).toContain('用户名或密码错误')
  })

  it('应该支持记住密码功能', async () => {
    const authStore = useAuthStore()

    // 先注册一个用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
    await authStore.logout()

    // 挂载登录组件
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写登录表单并勾选记住密码
    await wrapper.find('#username').setValue('testuser')
    await wrapper.find('#password').setValue('Test1234')
    await wrapper.find('.checkbox-input').setValue(true)
    await flushPromises()

    // 调用登录方法
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('应该成功完成个人令牌登录流程', async () => {
    const authStore = useAuthStore()

    // 先注册一个令牌用户
    const result = await authStore.registerWithToken()
    const token = result.token
    await authStore.logout()

    // 挂载登录组件
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 切换到个人令牌登录标签页
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    // 填写令牌
    const tokenInput = wrapper.find('#token')
    await tokenInput.setValue(token)
    await flushPromises()

    // 调用令牌登录方法
    await (wrapper.vm as any).handleTokenLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('应该在个人令牌登录失败时显示错误信息', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 切换到个人令牌登录标签页
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    // 填写无效的令牌
    const tokenInput = wrapper.find('#token')
    await tokenInput.setValue('invalid-token-12345')
    await flushPromises()

    // 调用令牌登录方法
    await (wrapper.vm as any).handleTokenLogin()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
  })

  it('应该支持在登录类型之间切换', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })

    // 默认应该显示账号密码登录表单
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)

    // 切换到个人令牌登录
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    // 应该显示令牌输入框
    expect(wrapper.find('#token').exists()).toBe(true)
    expect(wrapper.find('#username').exists()).toBe(false)

    // 切换回账号密码登录
    const passwordTab = wrapper.findAll('.tab-button')[0]
    await passwordTab.trigger('click')
    await flushPromises()

    // 应该显示账号密码表单
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('应该支持显示/隐藏密码', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })

    const passwordInput = wrapper.find('#password')
    const toggleButton = wrapper.find('.password-toggle')

    // 默认应该是密码类型
    expect(passwordInput.attributes('type')).toBe('password')

    // 点击切换按钮
    await toggleButton.trigger('click')
    await flushPromises()

    // 应该变为文本类型
    expect(passwordInput.attributes('type')).toBe('text')

    // 再次点击
    await toggleButton.trigger('click')
    await flushPromises()

    // 应该变回密码类型
    expect(passwordInput.attributes('type')).toBe('password')
  })
})

describe('认证界面集成测试 - 注册流程', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 创建路由实例
    router = createTestRouter()
  })

  it('应该成功完成账号密码注册流程', async () => {
    const authStore = useAuthStore()

    // 挂载注册组件
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写注册表单
    await wrapper.find('#username').setValue('newuser')
    await wrapper.find('#password').setValue('Test1234')
    await wrapper.find('#confirmPassword').setValue('Test1234')
    await wrapper.find('#securityQuestion').setValue('您的出生地是？')
    await wrapper.find('#securityAnswer').setValue('北京')
    await flushPromises()

    // 调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证注册成功
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.username).toBe('newuser')
    expect(authStore.isMainAccount).toBe(true)
  })

  it('应该在密码不匹配时显示错误信息', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写注册表单，但密码不匹配
    await wrapper.find('#username').setValue('newuser')
    await wrapper.find('#password').setValue('Test1234')
    await wrapper.find('#confirmPassword').setValue('Different123')
    await wrapper.find('#securityQuestion').setValue('您的出生地是？')
    await wrapper.find('#securityAnswer').setValue('北京')
    await flushPromises()

    // 调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
    expect(errorMessage.text()).toContain('两次输入的密码不一致')
  })

  it('应该在密码强度不足时显示错误信息', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写注册表单，但密码强度不足
    await wrapper.find('#username').setValue('newuser')
    await wrapper.find('#password').setValue('weak')
    await wrapper.find('#confirmPassword').setValue('weak')
    await wrapper.find('#securityQuestion').setValue('您的出生地是？')
    await wrapper.find('#securityAnswer').setValue('北京')
    await flushPromises()

    // 调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
  })

  it('应该在用户名已存在时显示错误信息', async () => {
    const authStore = useAuthStore()

    // 先注册一个用户
    await authStore.registerWithPassword('existinguser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
    await authStore.logout()

    // 挂载注册组件
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 尝试注册相同的用户名
    await wrapper.find('#username').setValue('existinguser')
    await wrapper.find('#password').setValue('Test1234')
    await wrapper.find('#confirmPassword').setValue('Test1234')
    await wrapper.find('#securityQuestion').setValue('您的出生地是？')
    await wrapper.find('#securityAnswer').setValue('北京')
    await flushPromises()

    // 调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
    expect(errorMessage.text()).toContain('用户名已存在')
  })

  it('应该成功完成个人令牌注册流程', async () => {
    const authStore = useAuthStore()

    // 挂载注册组件
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 切换到个人令牌注册标签页
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    // 调用令牌注册方法
    await (wrapper.vm as any).handleTokenRegister()
    await flushPromises()

    // 验证注册成功并显示令牌
    expect(authStore.isAuthenticated).toBe(true)
    expect(wrapper.find('.token-result').exists()).toBe(true)
    expect(wrapper.find('.token-text').exists()).toBe(true)
    expect(wrapper.find('.token-text').text()).not.toBe('')
  })

  it('应该支持复制生成的令牌', async () => {
    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    })

    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 切换到个人令牌注册并生成令牌
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    await (wrapper.vm as any).handleTokenRegister()
    await flushPromises()

    // 点击复制按钮
    const copyButton = wrapper.find('.btn-default')
    await copyButton.trigger('click')
    await flushPromises()

    // 验证调用了 clipboard API
    expect(writeTextMock).toHaveBeenCalled()
  })

  it('应该支持在注册类型之间切换', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })

    // 默认应该显示账号密码注册表单
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)

    // 切换到个人令牌注册
    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    // 应该显示令牌注册信息
    expect(wrapper.find('.token-info').exists()).toBe(true)
    expect(wrapper.find('#username').exists()).toBe(false)

    // 切换回账号密码注册
    const passwordTab = wrapper.findAll('.tab-button')[0]
    await passwordTab.trigger('click')
    await flushPromises()

    // 应该显示账号密码表单
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('应该支持显示/隐藏密码', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })

    const passwordInput = wrapper.find('#password')
    const toggleButtons = wrapper.findAll('.password-toggle')

    // 默认应该是密码类型
    expect(passwordInput.attributes('type')).toBe('password')

    // 点击第一个切换按钮（密码字段）
    await toggleButtons[0].trigger('click')
    await flushPromises()

    // 应该变为文本类型
    expect(passwordInput.attributes('type')).toBe('text')

    // 再次点击
    await toggleButtons[0].trigger('click')
    await flushPromises()

    // 应该变回密码类型
    expect(passwordInput.attributes('type')).toBe('password')
  })

  it('应该验证所有必填字段', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 不填写任何字段，直接调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
    expect(errorMessage.text()).toContain('请填写所有必填项')
  })

  it('应该验证安全问题和答案', async () => {
    const wrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 填写表单但不填写安全问题
    await wrapper.find('#username').setValue('newuser')
    await wrapper.find('#password').setValue('Test1234')
    await wrapper.find('#confirmPassword').setValue('Test1234')
    await flushPromises()

    // 调用注册方法
    await (wrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证显示错误信息
    const errorMessage = wrapper.find('.error-message')
    expect(errorMessage.exists()).toBe(true)
    expect(errorMessage.text()).toContain('请设置安全问题和答案')
  })
})

describe('认证界面集成测试 - 端到端流程', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 创建路由实例
    router = createTestRouter()
  })

  it('应该完成完整的注册-登出-登录流程', async () => {
    const authStore = useAuthStore()

    // 1. 注册新用户
    await router.push('/register')
    const registerWrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    await registerWrapper.find('#username').setValue('testuser')
    await registerWrapper.find('#password').setValue('Test1234')
    await registerWrapper.find('#confirmPassword').setValue('Test1234')
    await registerWrapper.find('#securityQuestion').setValue('您的出生地是？')
    await registerWrapper.find('#securityAnswer').setValue('北京')
    await flushPromises()

    await (registerWrapper.vm as any).handlePasswordRegister()
    await flushPromises()

    // 验证注册成功
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.username).toBe('testuser')

    // 2. 注销
    await authStore.logout()
    expect(authStore.isAuthenticated).toBe(false)

    // 3. 重新登录
    await router.push('/login')
    const loginWrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    await loginWrapper.find('#username').setValue('testuser')
    await loginWrapper.find('#password').setValue('Test1234')
    await flushPromises()

    await (loginWrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.username).toBe('testuser')
  })

  it('应该完成令牌注册-登出-令牌登录流程', async () => {
    const authStore = useAuthStore()

    // 1. 令牌注册
    await router.push('/register')
    const registerWrapper = mount(RegisterView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    const tokenTab = registerWrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')
    await flushPromises()

    await (registerWrapper.vm as any).handleTokenRegister()
    await flushPromises()

    // 获取生成的令牌
    const tokenText = registerWrapper.find('.token-text').text()
    expect(tokenText).not.toBe('')

    // 验证注册成功
    expect(authStore.isAuthenticated).toBe(true)

    // 2. 注销
    await authStore.logout()
    expect(authStore.isAuthenticated).toBe(false)

    // 3. 使用令牌重新登录
    await router.push('/login')
    const loginWrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    const loginTokenTab = loginWrapper.findAll('.tab-button')[1]
    await loginTokenTab.trigger('click')
    await flushPromises()

    await loginWrapper.find('#token').setValue(tokenText)
    await flushPromises()

    await (loginWrapper.vm as any).handleTokenLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('应该在多次登录失败后仍能成功登录', async () => {
    const authStore = useAuthStore()

    // 先注册一个用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
    await authStore.logout()

    // 挂载登录组件
    await router.push('/login')
    const wrapper = mount(LoginView, {
      global: {
        plugins: [pinia, router]
      }
    })
    await flushPromises()

    // 第一次失败的登录尝试
    await wrapper.find('#username').setValue('testuser')
    await wrapper.find('#password').setValue('wrongpass')
    await flushPromises()
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    expect(wrapper.find('.error-message').exists()).toBe(true)

    // 第二次失败的登录尝试
    await wrapper.find('#password').setValue('wrongpass2')
    await flushPromises()
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    expect(wrapper.find('.error-message').exists()).toBe(true)

    // 第三次使用正确密码
    await wrapper.find('#password').setValue('Test1234')
    await flushPromises()
    await (wrapper.vm as any).handlePasswordLogin()
    await flushPromises()

    // 验证登录成功
    expect(authStore.isAuthenticated).toBe(true)
  })
})
