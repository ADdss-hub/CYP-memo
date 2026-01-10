/**
 * CYP-memo 权限管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { permissionManager } from '../src/managers/PermissionManager'
import { userDAO } from '../src/database/UserDAO'
import { Permission } from '../src/types'
import type { User } from '../src/types'
import { hashPassword } from '../src/utils/crypto'

describe('权限管理器属性测试', () => {
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

  describe('权限验证属性', () => {
    // Feature: cyp-memo, Property 40: 权限验证正确性
    it('属性 40: 对于任何用户和权限，权限检查应该正确返回该用户是否拥有该权限', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // username
            fc.array(fc.constantFrom(...Object.values(Permission)), { minLength: 0, maxLength: 5 }), // user permissions
            fc.constantFrom(...Object.values(Permission)) // permission to check
          ),
          async ([username, userPermissions, permissionToCheck]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建用户
            const passwordHash = await hashPassword('testPassword123')
            const user: User = {
              id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              username: uniqueUsername,
              passwordHash,
              rememberPassword: false,
              isMainAccount: true,
              permissions: userPermissions,
              createdAt: new Date(),
              lastLoginAt: new Date()
            }
            
            await userDAO.create(user)
            
            // 测试权限检查
            const hasPermission = await permissionManager.hasPermission(user.id, permissionToCheck)
            
            // 验证结果正确性
            const shouldHavePermission = userPermissions.includes(permissionToCheck)
            expect(hasPermission).toBe(shouldHavePermission)
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)
  })

  describe('子账号权限限制属性', () => {
    // Feature: cyp-memo, Property 41: 子账号权限限制
    it('属性 41: 对于任何子账号用户，默认应该只能访问备忘录功能，其他功能应该被限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // username
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)  // parent username
          ),
          async ([username, parentUsername]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            const uniqueParentUsername = `${parentUsername}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建主账号
            const passwordHash = await hashPassword('testPassword123')
            const parentUser: User = {
              id: `parent_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              username: uniqueParentUsername,
              passwordHash,
              rememberPassword: false,
              isMainAccount: true,
              permissions: Object.values(Permission), // 主账号拥有所有权限
              createdAt: new Date(),
              lastLoginAt: new Date()
            }
            
            await userDAO.create(parentUser)
            
            // 创建子账号（默认只有备忘录管理权限）
            const subUser: User = {
              id: `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              username: uniqueUsername,
              passwordHash,
              rememberPassword: false,
              isMainAccount: false,
              parentUserId: parentUser.id,
              permissions: [Permission.MEMO_MANAGE], // 默认只有备忘录管理权限
              createdAt: new Date(),
              lastLoginAt: new Date()
            }
            
            await userDAO.create(subUser)
            
            // 验证子账号是子账号
            const isSubAccount = await permissionManager.isSubAccount(subUser.id)
            expect(isSubAccount).toBe(true)
            
            // 验证子账号不是主账号
            const isMainAccount = await permissionManager.isMainAccount(subUser.id)
            expect(isMainAccount).toBe(false)
            
            // 验证子账号有备忘录管理权限
            const hasMemoPermission = await permissionManager.hasPermission(subUser.id, Permission.MEMO_MANAGE)
            expect(hasMemoPermission).toBe(true)
            
            // 验证子账号没有其他权限
            const hasStatisticsPermission = await permissionManager.hasPermission(subUser.id, Permission.STATISTICS_VIEW)
            expect(hasStatisticsPermission).toBe(false)
            
            const hasAttachmentPermission = await permissionManager.hasPermission(subUser.id, Permission.ATTACHMENT_MANAGE)
            expect(hasAttachmentPermission).toBe(false)
            
            const hasSettingsPermission = await permissionManager.hasPermission(subUser.id, Permission.SETTINGS_MANAGE)
            expect(hasSettingsPermission).toBe(false)
            
            const hasAccountPermission = await permissionManager.hasPermission(subUser.id, Permission.ACCOUNT_MANAGE)
            expect(hasAccountPermission).toBe(false)
            
            // 清理
            await userDAO.delete(subUser.id)
            await userDAO.delete(parentUser.id)
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)
  })

  describe('权限授予属性', () => {
    // Feature: cyp-memo, Property 42: 权限授予生效
    it('属性 42: 对于任何权限授予操作，授予后用户应该能够访问对应的功能', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // username
            fc.array(fc.constantFrom(...Object.values(Permission)), { minLength: 1, maxLength: 5 }).filter(arr => arr.length > 0) // permissions to grant
          ),
          async ([username, permissionsToGrant]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建用户（初始无权限）
            const passwordHash = await hashPassword('testPassword123')
            const user: User = {
              id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              username: uniqueUsername,
              passwordHash,
              rememberPassword: false,
              isMainAccount: false,
              permissions: [], // 初始无权限
              createdAt: new Date(),
              lastLoginAt: new Date()
            }
            
            await userDAO.create(user)
            
            // 验证初始状态：用户没有这些权限
            for (const permission of permissionsToGrant) {
              const hasPermission = await permissionManager.hasPermission(user.id, permission)
              expect(hasPermission).toBe(false)
            }
            
            // 授予权限
            await permissionManager.setPermissions(user.id, permissionsToGrant)
            
            // 验证授予后：用户拥有这些权限
            for (const permission of permissionsToGrant) {
              const hasPermission = await permissionManager.hasPermission(user.id, permission)
              expect(hasPermission).toBe(true)
            }
            
            // 验证获取权限列表
            const userPermissions = await permissionManager.getUserPermissions(user.id)
            expect(userPermissions).toHaveLength(permissionsToGrant.length)
            for (const permission of permissionsToGrant) {
              expect(userPermissions).toContain(permission)
            }
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 100 }
      )
    }, 60000)
  })
})
