/**
 * CYP-memo 子账号管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { userDAO } from '../../database/UserDAO'
import { hashPassword, generateUUID } from '../../utils/crypto'
import { logManager } from '../LogManager'
import { authValidator } from './AuthValidator'
import { Permission } from '../../types'
import type { User } from '../../types'

/**
 * 子账号管理器
 * 负责子账号的创建、删除和权限管理
 */
export class SubAccountManager {
  /**
   * 创建子账号
   * @param parentUserId 父账号 ID
   * @param username 用户名
   * @param password 密码
   * @param permissions 权限列表
   * @returns Promise<User> 创建的子账号对象
   * @throws Error 创建失败时抛出错误
   */
  async createSubAccount(
    parentUserId: string,
    username: string,
    password: string,
    permissions: Permission[]
  ): Promise<User> {
    try {
      // 验证父账号
      await authValidator.validateMainAccount(parentUserId)

      // 验证子账号用户名（只在同一主账号下检查唯一性）
      await authValidator.validateSubAccountUsername(username, parentUserId)

      // 验证密码强度
      authValidator.validatePassword(password)

      // 哈希密码（添加超时控制）
      let passwordHash: string
      try {
        const hashPromise = hashPassword(password)
        // 设置 30 秒超时
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('密码哈希超时')), 30000)
        )
        passwordHash = await Promise.race([hashPromise, timeoutPromise])
      } catch (error) {
        throw new Error(`密码处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
      }

      // 创建子账号对象
      const subAccount: User = {
        id: generateUUID(),
        username,
        passwordHash,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId,
        permissions,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 保存到数据库
      await userDAO.create(subAccount)

      // 记录日志
      await logManager.info('创建子账号', {
        parentUserId,
        subAccountId: subAccount.id,
        username,
        permissions,
      })

      return subAccount
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建子账号失败'
      await logManager.error(
        error instanceof Error ? error : new Error(errorMessage),
        {
          action: 'createSubAccount',
          parentUserId,
          username,
        }
      )
      throw error
    }
  }

  /**
   * 获取子账号列表
   * @param parentUserId 父账号 ID
   * @returns Promise<User[]> 子账号列表
   */
  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await userDAO.getSubAccounts(parentUserId)
  }

  /**
   * 删除子账号
   * @param parentUserId 父账号 ID
   * @param subAccountId 子账号 ID
   * @throws Error 删除失败时抛出错误
   */
  async deleteSubAccount(parentUserId: string, subAccountId: string): Promise<void> {
    // 验证父账号
    await authValidator.validateMainAccount(parentUserId)

    // 验证子账号归属
    const subAccount = await authValidator.validateSubAccountOwnership(parentUserId, subAccountId)

    // 删除子账号
    await userDAO.delete(subAccountId)

    // 记录日志
    await logManager.info('删除子账号', {
      parentUserId,
      subAccountId,
      username: subAccount.username,
    })
  }

  /**
   * 更新子账号权限
   * @param parentUserId 父账号 ID
   * @param subAccountId 子账号 ID
   * @param permissions 新的权限列表
   * @throws Error 更新失败时抛出错误
   */
  async updateSubAccountPermissions(
    parentUserId: string,
    subAccountId: string,
    permissions: Permission[]
  ): Promise<void> {
    // 验证父账号
    await authValidator.validateMainAccount(parentUserId)

    // 验证子账号归属
    const subAccount = await authValidator.validateSubAccountOwnership(parentUserId, subAccountId)

    // 更新权限
    await userDAO.update(subAccountId, { permissions })

    // 记录日志
    await logManager.info('更新子账号权限', {
      parentUserId,
      subAccountId,
      username: subAccount.username,
      permissions,
    })
  }
}

/**
 * SubAccountManager 单例实例
 */
export const subAccountManager = new SubAccountManager()
