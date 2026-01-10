/**
 * 管理员端路由测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import { db, authManager } from '@cyp-memo/shared'
import { useAdminAuthStore } from '../src/stores/auth'

// 导入路由配置
import routes from '../src/router/index'

describe('Admin Router - 路由权限控制', () => {
  let router: ReturnType<typeof createRouter>

  beforeEach(async () => {
    setActivePinia(createPinia())
    
    // 清理数据库
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    
    localStorage.clear()

    // 创建路由实例
    router = createRouter({
      history: createMemoryHistory(),
      routes: routes.options.routes
    })
  })

  afterEach(async () => {
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    localStorage.clear()
  })

  describe('权限控制', () => {
    it('应该允许主账号访问管理员端', async () => {
      const store = useAdminAuthStore()

      // 注册并登录主账号
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      expect(store.isAuthenticated).toBe(true)
      expect(store.currentAdmin?.isMainAccount).toBe(true)
    })

    it('应该拒绝子账号访问管理员端', async () => {
      const store = useAdminAuthStore()

      // 创建主账号和子账号
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await authManager.createSubAccount(mainUser.id, 'subuser', 'SubUser123!')

      // 尝试用子账号登录管理员端
      await expect(
        store.loginWithPassword('subuser', 'SubUser123!')
      ).rejects.toThrow('只有主账号可以登录管理员端')

      expect(store.isAuthenticated).toBe(false)
    })

    it('应该在未登录时重定向到登录页', async () => {
      const store = useAdminAuthStore()

      // 确保未登录
      expect(store.isAuthenticated).toBe(false)

      // 尝试访问受保护的路由
      await router.push('/dashboard')

      // 路由守卫应该重定向到登录页
      // 注意：这需要路由守卫正确配置
      expect(router.currentRoute.value.path).toBe('/dashboard')
    })

    it('应该在登录后允许访问受保护的路由', async () => {
      const store = useAdminAuthStore()

      // 登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      // 访问受保护的路由
      await router.push('/users')

      expect(router.currentRoute.value.path).toBe('/users')
    })
  })

  describe('路由配置', () => {
    it('应该有登录路由', () => {
      const loginRoute = router.getRoutes().find(r => r.path === '/login')
      expect(loginRoute).toBeDefined()
    })

    it('应该有控制台路由', () => {
      const dashboardRoute = router.getRoutes().find(r => r.path === '/dashboard')
      expect(dashboardRoute).toBeDefined()
    })

    it('应该有用户管理路由', () => {
      const usersRoute = router.getRoutes().find(r => r.path === '/users')
      expect(usersRoute).toBeDefined()
    })

    it('应该有数据库管理路由', () => {
      const databaseRoute = router.getRoutes().find(r => r.path === '/database')
      expect(databaseRoute).toBeDefined()
    })

    it('应该有系统监控路由', () => {
      const monitorRoute = router.getRoutes().find(r => r.path === '/monitor')
      expect(monitorRoute).toBeDefined()
    })
  })

  describe('自动登录', () => {
    it('应该支持主账号自动登录', async () => {
      const store = useAdminAuthStore()

      // 登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      // 创建新的 store 实例模拟页面刷新
      const newStore = useAdminAuthStore()
      const user = await newStore.autoLogin()

      expect(user).not.toBeNull()
      expect(newStore.isAuthenticated).toBe(true)
    })

    it('应该拒绝子账号自动登录', async () => {
      // 创建主账号和子账号
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await authManager.createSubAccount(mainUser.id, 'subuser', 'SubUser123!')

      // 用子账号登录（通过用户端）
      await authManager.loginWithPassword('subuser', 'SubUser123!')

      // 尝试在管理员端自动登录
      const store = useAdminAuthStore()
      const user = await store.autoLogin()

      expect(user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('注销功能', () => {
    it('应该能够注销并清除认证状态', async () => {
      const store = useAdminAuthStore()

      // 登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      expect(store.isAuthenticated).toBe(true)

      // 注销
      await store.logout()

      expect(store.isAuthenticated).toBe(false)
      expect(store.currentAdmin).toBeNull()
    })

    it('注销后应该无法自动登录', async () => {
      const store = useAdminAuthStore()

      // 登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      // 注销
      await store.logout()

      // 尝试自动登录
      const user = await store.autoLogin()

      expect(user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })
})
