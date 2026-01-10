/**
 * CYP-memo 权限管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { permissionManager } from '../src/managers/PermissionManager'
import { userDAO } from '../src/database/UserDAO'
import { Permission } from '../src/types'
import type { User } from '../src/types'
import { hashPassword } from '../src/utils/crypto'

describe('权限管理器单元测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
  })

  afterEach(async () => {
    // 清空数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
  })

  describe('权限继承测试', () => {
    it('应该正确识别主账号和子账号的关系', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号
      const mainUser: User = {
        id: 'main_user_1',
        username: 'mainuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 创建子账号
      const subUser: User = {
        id: 'sub_user_1',
        username: 'subuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser)
      
      // 验证主账号识别
      const isMain = await permissionManager.isMainAccount(mainUser.id)
      expect(isMain).toBe(true)
      
      const isMainSub = await permissionManager.isSubAccount(mainUser.id)
      expect(isMainSub).toBe(false)
      
      // 验证子账号识别
      const isSubMain = await permissionManager.isMainAccount(subUser.id)
      expect(isSubMain).toBe(false)
      
      const isSub = await permissionManager.isSubAccount(subUser.id)
      expect(isSub).toBe(true)
    })

    it('子账号应该有独立的权限，不继承主账号权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号（拥有所有权限）
      const mainUser: User = {
        id: 'main_user_2',
        username: 'mainuser2',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 创建子账号（只有备忘录管理权限）
      const subUser: User = {
        id: 'sub_user_2',
        username: 'subuser2',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser)
      
      // 验证主账号拥有所有权限
      for (const permission of Object.values(Permission)) {
        const hasPermission = await permissionManager.hasPermission(mainUser.id, permission)
        expect(hasPermission).toBe(true)
      }
      
      // 验证子账号只有备忘录管理权限
      const hasMemoPermission = await permissionManager.hasPermission(subUser.id, Permission.MEMO_MANAGE)
      expect(hasMemoPermission).toBe(true)
      
      // 验证子账号没有其他权限（不继承主账号权限）
      const hasStatisticsPermission = await permissionManager.hasPermission(subUser.id, Permission.STATISTICS_VIEW)
      expect(hasStatisticsPermission).toBe(false)
      
      const hasAttachmentPermission = await permissionManager.hasPermission(subUser.id, Permission.ATTACHMENT_MANAGE)
      expect(hasAttachmentPermission).toBe(false)
      
      const hasSettingsPermission = await permissionManager.hasPermission(subUser.id, Permission.SETTINGS_MANAGE)
      expect(hasSettingsPermission).toBe(false)
      
      const hasAccountPermission = await permissionManager.hasPermission(subUser.id, Permission.ACCOUNT_MANAGE)
      expect(hasAccountPermission).toBe(false)
    })

    it('应该支持多个子账号，每个子账号有独立的权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号
      const mainUser: User = {
        id: 'main_user_3',
        username: 'mainuser3',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 创建第一个子账号（只有备忘录管理权限）
      const subUser1: User = {
        id: 'sub_user_3_1',
        username: 'subuser3_1',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser1)
      
      // 创建第二个子账号（有备忘录和统计权限）
      const subUser2: User = {
        id: 'sub_user_3_2',
        username: 'subuser3_2',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser2)
      
      // 验证第一个子账号的权限
      const sub1HasMemo = await permissionManager.hasPermission(subUser1.id, Permission.MEMO_MANAGE)
      expect(sub1HasMemo).toBe(true)
      
      const sub1HasStatistics = await permissionManager.hasPermission(subUser1.id, Permission.STATISTICS_VIEW)
      expect(sub1HasStatistics).toBe(false)
      
      // 验证第二个子账号的权限
      const sub2HasMemo = await permissionManager.hasPermission(subUser2.id, Permission.MEMO_MANAGE)
      expect(sub2HasMemo).toBe(true)
      
      const sub2HasStatistics = await permissionManager.hasPermission(subUser2.id, Permission.STATISTICS_VIEW)
      expect(sub2HasStatistics).toBe(true)
      
      const sub2HasAttachment = await permissionManager.hasPermission(subUser2.id, Permission.ATTACHMENT_MANAGE)
      expect(sub2HasAttachment).toBe(false)
    })

    it('主账号可以动态修改子账号的权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号
      const mainUser: User = {
        id: 'main_user_4',
        username: 'mainuser4',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 创建子账号（初始只有备忘录管理权限）
      const subUser: User = {
        id: 'sub_user_4',
        username: 'subuser4',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser)
      
      // 验证初始权限
      let hasStatistics = await permissionManager.hasPermission(subUser.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(false)
      
      // 主账号授予子账号统计查看权限
      await permissionManager.setPermissions(subUser.id, [
        Permission.MEMO_MANAGE,
        Permission.STATISTICS_VIEW
      ])
      
      // 验证权限已更新
      hasStatistics = await permissionManager.hasPermission(subUser.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(true)
      
      // 验证其他权限仍然没有
      const hasAttachment = await permissionManager.hasPermission(subUser.id, Permission.ATTACHMENT_MANAGE)
      expect(hasAttachment).toBe(false)
    })
  })

  describe('权限冲突处理测试', () => {
    it('应该拒绝为不存在的用户设置权限', async () => {
      await expect(
        permissionManager.setPermissions('nonexistent_user', [Permission.MEMO_MANAGE])
      ).rejects.toThrow('用户不存在')
    })

    it('应该拒绝为不存在的用户检查权限', async () => {
      const hasPermission = await permissionManager.hasPermission('nonexistent_user', Permission.MEMO_MANAGE)
      expect(hasPermission).toBe(false)
    })

    it('应该拒绝为不存在的用户获取权限列表', async () => {
      await expect(
        permissionManager.getUserPermissions('nonexistent_user')
      ).rejects.toThrow('用户不存在')
    })

    it('应该正确处理空权限列表', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建用户（无权限）
      const user: User = {
        id: 'user_no_permissions',
        username: 'nopermuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        permissions: [],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(user)
      
      // 验证用户没有任何权限
      for (const permission of Object.values(Permission)) {
        const hasPermission = await permissionManager.hasPermission(user.id, permission)
        expect(hasPermission).toBe(false)
      }
      
      // 获取权限列表应该返回空数组
      const permissions = await permissionManager.getUserPermissions(user.id)
      expect(permissions).toEqual([])
    })

    it('应该正确处理重复的权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建用户
      const user: User = {
        id: 'user_duplicate_perms',
        username: 'dupuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(user)
      
      // 设置包含重复权限的权限列表
      await permissionManager.setPermissions(user.id, [
        Permission.MEMO_MANAGE,
        Permission.MEMO_MANAGE,
        Permission.STATISTICS_VIEW
      ])
      
      // 验证权限设置成功
      const hasMemo = await permissionManager.hasPermission(user.id, Permission.MEMO_MANAGE)
      expect(hasMemo).toBe(true)
      
      const hasStatistics = await permissionManager.hasPermission(user.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(true)
    })

    it('应该正确处理权限覆盖（完全替换而非追加）', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建用户（初始有多个权限）
      const user: User = {
        id: 'user_override',
        username: 'overrideuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        permissions: [
          Permission.MEMO_MANAGE,
          Permission.STATISTICS_VIEW,
          Permission.ATTACHMENT_MANAGE
        ],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(user)
      
      // 验证初始权限
      let hasMemo = await permissionManager.hasPermission(user.id, Permission.MEMO_MANAGE)
      expect(hasMemo).toBe(true)
      
      let hasStatistics = await permissionManager.hasPermission(user.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(true)
      
      let hasAttachment = await permissionManager.hasPermission(user.id, Permission.ATTACHMENT_MANAGE)
      expect(hasAttachment).toBe(true)
      
      // 设置新的权限列表（只包含备忘录管理）
      await permissionManager.setPermissions(user.id, [Permission.MEMO_MANAGE])
      
      // 验证权限被完全替换
      hasMemo = await permissionManager.hasPermission(user.id, Permission.MEMO_MANAGE)
      expect(hasMemo).toBe(true)
      
      hasStatistics = await permissionManager.hasPermission(user.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(false)
      
      hasAttachment = await permissionManager.hasPermission(user.id, Permission.ATTACHMENT_MANAGE)
      expect(hasAttachment).toBe(false)
    })

    it('应该允许清空用户的所有权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建用户（初始有权限）
      const user: User = {
        id: 'user_clear_perms',
        username: 'clearuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        permissions: [Permission.MEMO_MANAGE, Permission.STATISTICS_VIEW],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(user)
      
      // 验证初始有权限
      let hasMemo = await permissionManager.hasPermission(user.id, Permission.MEMO_MANAGE)
      expect(hasMemo).toBe(true)
      
      // 清空所有权限
      await permissionManager.setPermissions(user.id, [])
      
      // 验证所有权限都被清空
      hasMemo = await permissionManager.hasPermission(user.id, Permission.MEMO_MANAGE)
      expect(hasMemo).toBe(false)
      
      const hasStatistics = await permissionManager.hasPermission(user.id, Permission.STATISTICS_VIEW)
      expect(hasStatistics).toBe(false)
      
      const permissions = await permissionManager.getUserPermissions(user.id)
      expect(permissions).toEqual([])
    })

    it('应该正确处理主账号和子账号的权限冲突', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号（拥有所有权限）
      const mainUser: User = {
        id: 'main_conflict',
        username: 'mainconflict',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 创建子账号（只有备忘录权限）
      const subUser: User = {
        id: 'sub_conflict',
        username: 'subconflict',
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId: mainUser.id,
        permissions: [Permission.MEMO_MANAGE],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(subUser)
      
      // 尝试给子账号设置账号管理权限（通常只有主账号才有）
      await permissionManager.setPermissions(subUser.id, [
        Permission.MEMO_MANAGE,
        Permission.ACCOUNT_MANAGE
      ])
      
      // 验证权限设置成功（系统允许，但业务逻辑应该在更高层控制）
      const hasAccountManage = await permissionManager.hasPermission(subUser.id, Permission.ACCOUNT_MANAGE)
      expect(hasAccountManage).toBe(true)
      
      // 注意：这个测试验证了权限管理器本身不强制业务规则
      // 业务规则（如"子账号不能有账号管理权限"）应该在调用层实现
    })
  })

  describe('边界情况测试', () => {
    it('应该正确处理不存在的用户ID', async () => {
      const isMain = await permissionManager.isMainAccount('nonexistent')
      expect(isMain).toBe(false)
      
      const isSub = await permissionManager.isSubAccount('nonexistent')
      expect(isSub).toBe(false)
      
      const hasPermission = await permissionManager.hasPermission('nonexistent', Permission.MEMO_MANAGE)
      expect(hasPermission).toBe(false)
    })

    it('应该正确处理空字符串用户ID', async () => {
      const isMain = await permissionManager.isMainAccount('')
      expect(isMain).toBe(false)
      
      const isSub = await permissionManager.isSubAccount('')
      expect(isSub).toBe(false)
      
      const hasPermission = await permissionManager.hasPermission('', Permission.MEMO_MANAGE)
      expect(hasPermission).toBe(false)
    })

    it('应该正确获取用户的完整权限列表', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建用户（有多个权限）
      const user: User = {
        id: 'user_full_perms',
        username: 'fullpermsuser',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: [
          Permission.MEMO_MANAGE,
          Permission.STATISTICS_VIEW,
          Permission.ATTACHMENT_MANAGE
        ],
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(user)
      
      // 获取权限列表
      const permissions = await permissionManager.getUserPermissions(user.id)
      
      // 验证权限列表完整
      expect(permissions).toHaveLength(3)
      expect(permissions).toContain(Permission.MEMO_MANAGE)
      expect(permissions).toContain(Permission.STATISTICS_VIEW)
      expect(permissions).toContain(Permission.ATTACHMENT_MANAGE)
    })

    it('应该正确处理主账号的所有权限', async () => {
      const passwordHash = await hashPassword('testPassword123')
      
      // 创建主账号（拥有所有权限）
      const mainUser: User = {
        id: 'main_all_perms',
        username: 'mainallperms',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        permissions: Object.values(Permission),
        createdAt: new Date(),
        lastLoginAt: new Date()
      }
      await userDAO.create(mainUser)
      
      // 验证主账号拥有所有权限
      const permissions = await permissionManager.getUserPermissions(mainUser.id)
      expect(permissions).toHaveLength(Object.values(Permission).length)
      
      for (const permission of Object.values(Permission)) {
        expect(permissions).toContain(permission)
        
        const hasPermission = await permissionManager.hasPermission(mainUser.id, permission)
        expect(hasPermission).toBe(true)
      }
    })
  })
})
