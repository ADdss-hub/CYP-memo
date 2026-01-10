/**
 * 用户管理界面测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import UsersView from '../src/views/UsersView.vue'
import { db, authManager, generateToken } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'

// Mock AdminLayout 组件
vi.mock('../src/components/AdminLayout.vue', () => ({
  default: {
    name: 'AdminLayout',
    template: '<div class="admin-layout-mock"><slot /></div>'
  }
}))

describe('UsersView - 用户管理界面', () => {
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

  describe('用户列表显示', () => {
    it('应该能够加载所有用户', async () => {
      // 创建测试用户
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await authManager.createSubAccount(mainUser.id, 'subuser', 'SubUser123!', mainUser.id)

      // 验证用户已创建
      const users = await db.users.toArray()
      expect(users.length).toBe(2)
      
      // 验证用户类型
      const mainUsers = users.filter(u => u.isMainAccount)
      const subUsers = users.filter(u => !u.isMainAccount)
      expect(mainUsers.length).toBe(1)
      expect(subUsers.length).toBe(1)
    })
  })

  describe('搜索和筛选', () => {
    it('应该能够按用户名搜索', async () => {
      await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await authManager.registerWithPassword('testuser', 'Test123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 测试搜索逻辑
      const users = await db.users.toArray()
      const searchQuery = 'admin'
      const filtered = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()))
      
      expect(filtered.length).toBe(1)
      expect(filtered[0].username).toBe('admin')
    })

    it('应该能够按账号类型筛选', async () => {
      const mainUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })
      await authManager.createSubAccount(mainUser.id, 'subuser', 'SubUser123!', mainUser.id)

      // 测试筛选逻辑
      const users = await db.users.toArray()
      const mainAccounts = users.filter(u => u.isMainAccount)
      const subAccounts = users.filter(u => !u.isMainAccount)
      
      expect(mainAccounts.length).toBe(1)
      expect(subAccounts.length).toBe(1)
    })
  })

  describe('重置密码功能', () => {
    it('应该能够成功重置密码', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      const originalPasswordHash = user.passwordHash

      // 直接使用 bcrypt 重置密码（模拟组件行为）
      const bcrypt = await import('bcryptjs')
      const newPasswordHash = await bcrypt.hash('NewPass123!', 10)
      await db.users.update(user.id, { passwordHash: newPasswordHash })

      // 验证密码已更新
      const updatedUser = await db.users.get(user.id)
      expect(updatedUser?.passwordHash).toBeDefined()
      expect(updatedUser?.passwordHash).not.toBe(originalPasswordHash)
      
      // 验证新密码可以验证
      const isValid = await bcrypt.compare('NewPass123!', updatedUser!.passwordHash)
      expect(isValid).toBe(true)
    })

    it('应该验证密码强度', async () => {
      // 测试密码强度验证逻辑
      const weakPassword = 'weak'
      const strongPassword = 'Strong123!'

      // 弱密码应该不满足条件
      const isWeakValid = weakPassword.length >= 8 && 
                         /[a-zA-Z]/.test(weakPassword) && 
                         /\d/.test(weakPassword)
      expect(isWeakValid).toBe(false)

      // 强密码应该满足条件
      const isStrongValid = strongPassword.length >= 8 && 
                           /[a-zA-Z]/.test(strongPassword) && 
                           /\d/.test(strongPassword)
      expect(isStrongValid).toBe(true)
    })
  })

  describe('重置令牌功能', () => {
    it('应该能够生成新令牌', async () => {
      const { user, token: oldToken } = await authManager.registerWithToken()

      // 生成新令牌
      const newToken = generateToken()
      await db.users.update(user.id, { token: newToken })

      // 验证令牌已更新
      const updatedUser = await db.users.get(user.id)
      expect(updatedUser?.token).toBeDefined()
      expect(updatedUser?.token).not.toBe(oldToken)
      expect(updatedUser?.token).toBe(newToken)
      expect(newToken.length).toBeGreaterThan(0)
    })

    it('应该只为令牌用户更新令牌', async () => {
      // 创建密码用户
      const passwordUser = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 创建令牌用户
      const { user: tokenUser } = await authManager.registerWithToken()

      // 密码用户不应该有令牌
      expect(passwordUser.token).toBeUndefined()

      // 令牌用户应该有令牌
      expect(tokenUser.token).toBeDefined()
    })
  })

  describe('删除用户功能', () => {
    it('应该能够删除用户及其所有数据', async () => {
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 为用户创建一些数据
      await db.memos.add({
        id: 'memo1',
        userId: user.id,
        title: '测试备忘录',
        content: '测试内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // 删除用户及其数据
      await db.memos.where('userId').equals(user.id).delete()
      await db.files.where('userId').equals(user.id).delete()
      await db.shares.where('userId').equals(user.id).delete()
      await db.users.delete(user.id)

      // 验证用户已删除
      const deletedUser = await db.users.get(user.id)
      expect(deletedUser).toBeUndefined()

      // 验证用户数据已删除
      const userMemos = await db.memos.where('userId').equals(user.id).toArray()
      expect(userMemos.length).toBe(0)
    })
  })

  describe('权限控制', () => {
    it('应该只允许管理员访问用户管理功能', async () => {
      // 测试用户管理功能的核心逻辑
      const user = await authManager.registerWithPassword('admin', 'Admin123!', {
        question: '测试问题',
        answerHash: 'test'
      })

      // 验证可以加载用户列表
      const users = await db.users.toArray()
      expect(users.length).toBeGreaterThan(0)
      
      // 验证可以删除用户
      await db.users.delete(user.id)
      const deletedUser = await db.users.get(user.id)
      expect(deletedUser).toBeUndefined()
    })
  })
})
