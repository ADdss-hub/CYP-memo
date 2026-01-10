/**
 * 管理员认证状态管理测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAdminAuthStore } from '../src/stores/auth'
import { authManager } from '@cyp-memo/shared'
import { db } from '@cyp-memo/shared'

describe('Admin Auth Store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    
    // 清理数据库
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    
    // 清理本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    await db.users.clear()
    await db.memos.clear()
    await db.files.clear()
    await db.logs.clear()
    localStorage.clear()
  })

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      const store = useAdminAuthStore()

      expect(store.currentAdmin).toBeNull()
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.username).toBe('')
      expect(store.adminId).toBe('')
    })
  })

  describe('账号密码登录', () => {
    it('应该允许主账号登录', async () => {
      const store = useAdminAuthStore()

      // 先注册一个主账号
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '你的宠物叫什么？',
        answerHash: 'fluffy'
      })

      // 登录
      const user = await store.loginWithPassword('admin', 'Admin123!')

      expect(store.isAuthenticated).toBe(true)
      expect(store.currentAdmin).not.toBeNull()
      expect(store.currentAdmin?.username).toBe('admin')
      expect(store.currentAdmin?.isMainAccount).toBe(true)
      expect(user.isMainAccount).toBe(true)
    })

    it('应该拒绝子账号登录', async () => {
      const store = useAdminAuthStore()

      // 先注册一个主账号
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '你的宠物叫什么？',
        answerHash: 'fluffy'
      })

      // 创建一个子账号
      const subUser = await authManager.createSubAccount(mainUser.id, 'subuser', 'SubUser123!')

      // 尝试用子账号登录管理员端
      await expect(
        store.loginWithPassword('subuser', 'SubUser123!')
      ).rejects.toThrow('只有主账号可以登录管理员端')

      expect(store.isAuthenticated).toBe(false)
      expect(store.currentAdmin).toBeNull()
    })

    it('应该在登录失败时设置错误信息', async () => {
      const store = useAdminAuthStore()

      await expect(
        store.loginWithPassword('nonexistent', 'wrongpass')
      ).rejects.toThrow()

      expect(store.isAuthenticated).toBe(false)
      expect(store.error).not.toBeNull()
    })
  })

  describe('个人令牌登录', () => {
    it('应该允许主账号通过令牌登录', async () => {
      const store = useAdminAuthStore()

      // 注册一个令牌用户（自动是主账号）
      const { user, token } = await authManager.registerWithToken()

      // 注销
      await authManager.logout()

      // 用令牌登录管理员端
      const loginUser = await store.loginWithToken(token)

      expect(store.isAuthenticated).toBe(true)
      expect(store.currentAdmin).not.toBeNull()
      expect(store.currentAdmin?.id).toBe(user.id)
      expect(loginUser.isMainAccount).toBe(true)
    })

    it('应该在令牌无效时拒绝登录', async () => {
      const store = useAdminAuthStore()

      await expect(
        store.loginWithToken('invalid-token')
      ).rejects.toThrow()

      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('注销', () => {
    it('应该能够注销', async () => {
      const store = useAdminAuthStore()

      // 先登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '你的宠物叫什么？',
        answerHash: 'fluffy'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      expect(store.isAuthenticated).toBe(true)

      // 注销
      await store.logout()

      expect(store.isAuthenticated).toBe(false)
      expect(store.currentAdmin).toBeNull()
    })
  })

  describe('自动登录', () => {
    it('应该能够自动登录主账号', async () => {
      const store = useAdminAuthStore()

      // 先登录
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '你的宠物叫什么？',
        answerHash: 'fluffy'
      })
      await store.loginWithPassword('admin', 'Admin123!')

      // 创建新的 store 实例模拟页面刷新
      const newStore = useAdminAuthStore()
      const user = await newStore.autoLogin()

      expect(user).not.toBeNull()
      expect(newStore.isAuthenticated).toBe(true)
      expect(newStore.currentAdmin?.username).toBe('admin')
    })

    it('应该拒绝自动登录子账号', async () => {
      // 先注册一个主账号
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '你的宠物叫什么？',
        answerHash: 'fluffy'
      })

      // 创建一个子账号
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

  describe('错误处理', () => {
    it('应该能够清除错误', async () => {
      const store = useAdminAuthStore()

      // 触发一个错误
      await expect(
        store.loginWithPassword('nonexistent', 'wrongpass')
      ).rejects.toThrow()

      expect(store.error).not.toBeNull()

      // 清除错误
      store.clearError()

      expect(store.error).toBeNull()
    })
  })
})
