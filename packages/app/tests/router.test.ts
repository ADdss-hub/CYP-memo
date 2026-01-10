/**
 * CYP-memo 路由守卫单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../src/stores/auth'
import { useSettingsStore } from '../src/stores/settings'
import { Permission } from '@cyp-memo/shared'

// Mock the views to avoid loading actual components
vi.mock('../src/views/auth/LoginView.vue', () => ({ default: { name: 'LoginView' } }))
vi.mock('../src/views/auth/RegisterView.vue', () => ({ default: { name: 'RegisterView' } }))
vi.mock('../src/views/auth/ResetPasswordView.vue', () => ({ default: { name: 'ResetPasswordView' } }))
vi.mock('../src/views/WelcomeView.vue', () => ({ default: { name: 'WelcomeView' } }))
vi.mock('../src/views/memo/MemoListView.vue', () => ({ default: { name: 'MemoListView' } }))
vi.mock('../src/views/memo/MemoEditView.vue', () => ({ default: { name: 'MemoEditView' } }))
vi.mock('../src/views/memo/MemoDetailView.vue', () => ({ default: { name: 'MemoDetailView' } }))
vi.mock('../src/views/StatisticsView.vue', () => ({ default: { name: 'StatisticsView' } }))
vi.mock('../src/views/AttachmentsView.vue', () => ({ default: { name: 'AttachmentsView' } }))
vi.mock('../src/views/share/ShareManageView.vue', () => ({ default: { name: 'ShareManageView' } }))
vi.mock('../src/views/share/ShareView.vue', () => ({ default: { name: 'ShareView' } }))
vi.mock('../src/views/AccountsView.vue', () => ({ default: { name: 'AccountsView' } }))
vi.mock('../src/views/SettingsView.vue', () => ({ default: { name: 'SettingsView' } }))
vi.mock('../src/views/NotFoundView.vue', () => ({ default: { name: 'NotFoundView' } }))

/**
 * 创建测试路由实例
 */
function createTestRouter(): Router {
  const routes = [
    {
      path: '/login',
      name: 'login',
      component: { name: 'LoginView' },
      meta: { requiresGuest: true, title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: { name: 'RegisterView' },
      meta: { requiresGuest: true, title: '注册' },
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: { name: 'WelcomeView' },
      meta: { requiresAuth: true, title: '欢迎使用' },
    },
    {
      path: '/',
      name: 'home',
      redirect: '/memos',
      meta: { requiresAuth: true },
    },
    {
      path: '/memos',
      name: 'memos',
      component: { name: 'MemoListView' },
      meta: {
        requiresAuth: true,
        requiredPermissions: [Permission.MEMO_MANAGE],
        title: '备忘录',
      },
    },
    {
      path: '/statistics',
      name: 'statistics',
      component: { name: 'StatisticsView' },
      meta: {
        requiresAuth: true,
        requiredPermissions: [Permission.STATISTICS_VIEW],
        title: '数据统计',
      },
    },
    {
      path: '/attachments',
      name: 'attachments',
      component: { name: 'AttachmentsView' },
      meta: {
        requiresAuth: true,
        requiredPermissions: [Permission.ATTACHMENT_MANAGE],
        title: '附件管理',
      },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: { name: 'AccountsView' },
      meta: {
        requiresAuth: true,
        requiredPermissions: [Permission.ACCOUNT_MANAGE],
        title: '账号管理',
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: { name: 'SettingsView' },
      meta: {
        requiresAuth: true,
        requiredPermissions: [Permission.SETTINGS_MANAGE],
        title: '系统设置',
      },
    },
  ]

  const router = createRouter({
    history: createWebHistory(),
    routes,
  })

  // 添加路由守卫（复制自实际路由配置）
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()
    const settingsStore = useSettingsStore()

    // 设置页面标题
    if (to.meta.title) {
      document.title = `${to.meta.title} - CYP-memo`
    } else {
      document.title = 'CYP-memo'
    }

    // 尝试自动登录（仅在首次访问时）
    if (!authStore.isAuthenticated && !authStore.isLoading) {
      await authStore.autoLogin()
    }

    // 检查是否需要认证
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      next({
        name: 'login',
        query: { redirect: to.fullPath },
      })
      return
    }

    // 检查是否需要访客身份
    if (to.meta.requiresGuest && authStore.isAuthenticated) {
      next({ name: 'home' })
      return
    }

    // 检查首次使用引导
    if (
      authStore.isAuthenticated &&
      settingsStore.isFirstTime &&
      !settingsStore.welcomeCompleted &&
      to.name !== 'welcome' &&
      to.name !== 'login' &&
      to.name !== 'register'
    ) {
      next({ name: 'welcome' })
      return
    }

    // 检查权限
    if (to.meta.requiredPermissions && to.meta.requiredPermissions.length > 0) {
      const hasPermission = to.meta.requiredPermissions.every((permission) =>
        authStore.permissions.includes(permission)
      )

      if (!hasPermission) {
        console.warn(`权限不足，无法访问 ${to.path}`)
        next({
          name: 'memos',
          query: { error: 'permission_denied' },
        })
        return
      }
    }

    next()
  })

  return router
}

describe('Router Guards - 认证重定向', () => {
  let router: Router
  let authStore: ReturnType<typeof useAuthStore>
  let settingsStore: ReturnType<typeof useSettingsStore>

  beforeEach(() => {
    // 创建新的 Pinia 实例
    const pinia = createPinia()
    setActivePinia(pinia)

    // 初始化 stores
    authStore = useAuthStore()
    settingsStore = useSettingsStore()

    // 创建路由实例
    router = createTestRouter()

    // Mock autoLogin to avoid actual authentication
    vi.spyOn(authStore, 'autoLogin').mockResolvedValue(null)
  })

  it('应该将未认证用户重定向到登录页', async () => {
    // 确保用户未登录
    authStore.currentUser = null

    // 尝试访问需要认证的页面
    await router.push('/memos')
    await router.isReady()

    // 应该被重定向到登录页
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/memos')
  })

  it('应该允许未认证用户访问登录页', async () => {
    // 确保用户未登录
    authStore.currentUser = null

    // 访问登录页
    await router.push('/login')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('应该允许未认证用户访问注册页', async () => {
    // 确保用户未登录
    authStore.currentUser = null

    // 访问注册页
    await router.push('/register')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('register')
  })

  it('应该将已认证用户从登录页重定向到首页', async () => {
    // 模拟已登录用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 设置欢迎已完成，避免重定向到欢迎页
    await settingsStore.updateSettings({
      isFirstTime: false,
      welcomeCompleted: true,
    })

    // 尝试访问登录页
    await router.push('/login')
    await router.isReady()

    // 应该被重定向到首页（home 会重定向到 memos）
    expect(['home', 'memos']).toContain(router.currentRoute.value.name)
  })

  it('应该将已认证用户从注册页重定向到首页', async () => {
    // 模拟已登录用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 设置欢迎已完成，避免重定向到欢迎页
    await settingsStore.updateSettings({
      isFirstTime: false,
      welcomeCompleted: true,
    })

    // 尝试访问注册页
    await router.push('/register')
    await router.isReady()

    // 应该被重定向到首页（home 会重定向到 memos）
    expect(['home', 'memos']).toContain(router.currentRoute.value.name)
  })

  it('应该允许已认证用户访问需要认证的页面', async () => {
    // 模拟已登录用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 设置欢迎已完成
    await settingsStore.setWelcomeCompleted(true)

    // 访问备忘录页面
    await router.push('/memos')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('memos')
  })

  it('应该在首次使用时重定向到欢迎页', async () => {
    // 模拟已登录用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 设置为首次使用且未完成欢迎
    await settingsStore.updateSettings({
      isFirstTime: true,
      welcomeCompleted: false,
    })

    // 尝试访问备忘录页面
    await router.push('/memos')
    await router.isReady()

    // 应该被重定向到欢迎页
    expect(router.currentRoute.value.name).toBe('welcome')
  })

  it('应该在完成欢迎后允许访问其他页面', async () => {
    // 模拟已登录用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 设置欢迎已完成
    await settingsStore.updateSettings({
      isFirstTime: false,
      welcomeCompleted: true,
    })

    // 访问备忘录页面
    await router.push('/memos')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('memos')
  })
})

describe('Router Guards - 权限检查', () => {
  let router: Router
  let authStore: ReturnType<typeof useAuthStore>
  let settingsStore: ReturnType<typeof useSettingsStore>

  beforeEach(() => {
    // 创建新的 Pinia 实例
    const pinia = createPinia()
    setActivePinia(pinia)

    // 初始化 stores
    authStore = useAuthStore()
    settingsStore = useSettingsStore()

    // 创建路由实例
    router = createTestRouter()

    // Mock autoLogin
    vi.spyOn(authStore, 'autoLogin').mockResolvedValue(null)

    // 设置欢迎已完成
    settingsStore.updateSettings({
      isFirstTime: false,
      welcomeCompleted: true,
    })
  })

  it('应该允许有权限的用户访问备忘录页面', async () => {
    // 模拟有备忘录管理权限的用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 访问备忘录页面
    await router.push('/memos')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('memos')
  })

  it('应该阻止无权限的用户访问统计页面', async () => {
    // 模拟只有备忘录管理权限的用户（无统计查看权限）
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: false,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 尝试访问统计页面
    await router.push('/statistics')
    await router.isReady()

    // 应该被重定向到备忘录页面
    expect(router.currentRoute.value.name).toBe('memos')
    expect(router.currentRoute.value.query.error).toBe('permission_denied')
  })

  it('应该允许有权限的用户访问统计页面', async () => {
    // 模拟有统计查看权限的用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 访问统计页面
    await router.push('/statistics')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('statistics')
  })

  it('应该阻止无权限的用户访问附件管理页面', async () => {
    // 模拟只有备忘录管理权限的用户（无附件管理权限）
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: false,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 尝试访问附件管理页面
    await router.push('/attachments')
    await router.isReady()

    // 应该被重定向到备忘录页面
    expect(router.currentRoute.value.name).toBe('memos')
    expect(router.currentRoute.value.query.error).toBe('permission_denied')
  })

  it('应该允许有权限的用户访问附件管理页面', async () => {
    // 模拟有附件管理权限的用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE, Permission.ATTACHMENT_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 访问附件管理页面
    await router.push('/attachments')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('attachments')
  })

  it('应该阻止子账号访问账号管理页面', async () => {
    // 模拟子账号用户（无账号管理权限）
    authStore.currentUser = {
      id: 'user1',
      username: 'subuser',
      isMainAccount: false,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 尝试访问账号管理页面
    await router.push('/accounts')
    await router.isReady()

    // 应该被重定向到备忘录页面
    expect(router.currentRoute.value.name).toBe('memos')
    expect(router.currentRoute.value.query.error).toBe('permission_denied')
  })

  it('应该允许主账号访问账号管理页面', async () => {
    // 模拟主账号用户
    authStore.currentUser = {
      id: 'user1',
      username: 'mainuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE, Permission.ACCOUNT_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 访问账号管理页面
    await router.push('/accounts')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('accounts')
  })

  it('应该阻止无权限的用户访问系统设置页面', async () => {
    // 模拟只有备忘录管理权限的用户（无系统设置权限）
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: false,
      permissions: [Permission.MEMO_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 尝试访问系统设置页面
    await router.push('/settings')
    await router.isReady()

    // 应该被重定向到备忘录页面
    expect(router.currentRoute.value.name).toBe('memos')
    expect(router.currentRoute.value.query.error).toBe('permission_denied')
  })

  it('应该允许有权限的用户访问系统设置页面', async () => {
    // 模拟有系统设置权限的用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [Permission.MEMO_MANAGE, Permission.SETTINGS_MANAGE],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 访问系统设置页面
    await router.push('/settings')
    await router.isReady()

    // 应该成功访问
    expect(router.currentRoute.value.name).toBe('settings')
  })

  it('应该允许有多个权限的用户访问所有对应页面', async () => {
    // 模拟有多个权限的用户
    authStore.currentUser = {
      id: 'user1',
      username: 'testuser',
      isMainAccount: true,
      permissions: [
        Permission.MEMO_MANAGE,
        Permission.STATISTICS_VIEW,
        Permission.ATTACHMENT_MANAGE,
        Permission.SETTINGS_MANAGE,
        Permission.ACCOUNT_MANAGE,
      ],
      createdAt: new Date(),
      lastLoginAt: new Date(),
      rememberPassword: false,
    }

    // 测试访问各个页面
    const pages = ['/memos', '/statistics', '/attachments', '/settings', '/accounts']

    for (const page of pages) {
      await router.push(page)
      await router.isReady()
      expect(router.currentRoute.value.path).toBe(page)
    }
  })
})
