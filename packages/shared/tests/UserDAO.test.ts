/**
 * CYP-memo UserDAO 单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../src/database/db'
import { UserDAO } from '../src/database/UserDAO'
import type { User } from '../src/types'
import { Permission } from '../src/types'

describe('UserDAO', () => {
  let userDAO: UserDAO

  beforeEach(async () => {
    userDAO = new UserDAO()
    // Clear all data before each test
    await db.users.clear()
  })

  afterEach(async () => {
    // Clean up after each test
    await db.users.clear()
  })

  describe('CRUD 操作', () => {
    it('应该创建新用户', async () => {
      const user: User = {
        id: 'user1',
        username: 'testuser',
        passwordHash: 'hash123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const id = await userDAO.create(user)
      expect(id).toBe('user1')

      const retrieved = await userDAO.getById('user1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.username).toBe('testuser')
    })

    it('应该根据 ID 获取用户', async () => {
      const user: User = {
        id: 'user2',
        username: 'getbyid',
        token: 'token123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)
      const retrieved = await userDAO.getById('user2')

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('user2')
      expect(retrieved?.username).toBe('getbyid')
      expect(retrieved?.token).toBe('token123')
    })

    it('应该在用户不存在时返回 undefined', async () => {
      const retrieved = await userDAO.getById('nonexistent')
      expect(retrieved).toBeUndefined()
    })

    it('应该更新用户信息', async () => {
      const user: User = {
        id: 'user3',
        username: 'updatetest',
        passwordHash: 'oldhash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)
      const updateCount = await userDAO.update('user3', {
        passwordHash: 'newhash',
        lastLoginAt: new Date(),
      })

      expect(updateCount).toBe(1)

      const updated = await userDAO.getById('user3')
      expect(updated?.passwordHash).toBe('newhash')
    })

    it('应该删除用户', async () => {
      const user: User = {
        id: 'user4',
        username: 'deletetest',
        token: 'token456',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)
      await userDAO.delete('user4')

      const retrieved = await userDAO.getById('user4')
      expect(retrieved).toBeUndefined()
    })

    it('应该获取所有用户', async () => {
      const users: User[] = [
        {
          id: 'user5',
          username: 'user5',
          token: 'token5',
          rememberPassword: false,
          isMainAccount: true,
          permissions: [],
          createdAt: new Date(),
          lastLoginAt: new Date(),
        },
        {
          id: 'user6',
          username: 'user6',
          token: 'token6',
          rememberPassword: false,
          isMainAccount: true,
          permissions: [],
          createdAt: new Date(),
          lastLoginAt: new Date(),
        },
      ]

      await userDAO.create(users[0])
      await userDAO.create(users[1])

      const allUsers = await userDAO.getAll()
      expect(allUsers.length).toBe(2)
      expect(allUsers.map((u) => u.id)).toContain('user5')
      expect(allUsers.map((u) => u.id)).toContain('user6')
    })
  })

  describe('查询和筛选', () => {
    it('应该根据用户名查找用户', async () => {
      const user: User = {
        id: 'user7',
        username: 'findbyname',
        passwordHash: 'hash789',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)
      const found = await userDAO.getByUsername('findbyname')

      expect(found).toBeDefined()
      expect(found?.id).toBe('user7')
      expect(found?.username).toBe('findbyname')
    })

    it('应该根据令牌查找用户', async () => {
      const user: User = {
        id: 'user8',
        username: 'tokenuser',
        token: 'uniquetoken123',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)
      const found = await userDAO.getByToken('uniquetoken123')

      expect(found).toBeDefined()
      expect(found?.id).toBe('user8')
      expect(found?.token).toBe('uniquetoken123')
    })

    it('应该获取子账号列表', async () => {
      const mainUser: User = {
        id: 'main1',
        username: 'mainuser',
        passwordHash: 'mainhash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [Permission.ACCOUNT_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const subUser1: User = {
        id: 'sub1',
        username: 'subuser1',
        passwordHash: 'subhash1',
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: 'main1',
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const subUser2: User = {
        id: 'sub2',
        username: 'subuser2',
        passwordHash: 'subhash2',
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: 'main1',
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(mainUser)
      await userDAO.create(subUser1)
      await userDAO.create(subUser2)

      const subAccounts = await userDAO.getSubAccounts('main1')
      expect(subAccounts.length).toBe(2)
      expect(subAccounts.map((u) => u.id)).toContain('sub1')
      expect(subAccounts.map((u) => u.id)).toContain('sub2')
      expect(subAccounts.every((u) => u.parentUserId === 'main1')).toBe(true)
    })

    it('应该检查用户名是否存在', async () => {
      const user: User = {
        id: 'user9',
        username: 'existinguser',
        passwordHash: 'hash',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)

      const exists = await userDAO.usernameExists('existinguser')
      const notExists = await userDAO.usernameExists('nonexistentuser')

      expect(exists).toBe(true)
      expect(notExists).toBe(false)
    })

    it('应该检查令牌是否存在', async () => {
      const user: User = {
        id: 'user10',
        username: 'tokenuser2',
        token: 'existingtoken',
        rememberPassword: false,
        isMainAccount: true,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      await userDAO.create(user)

      const exists = await userDAO.tokenExists('existingtoken')
      const notExists = await userDAO.tokenExists('nonexistenttoken')

      expect(exists).toBe(true)
      expect(notExists).toBe(false)
    })
  })
})
