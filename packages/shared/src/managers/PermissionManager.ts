/**
 * CYP-memo 权限管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { userDAO } from '../database/UserDAO'
import { Permission } from '../types'

/**
 * 权限管理器
 * 负责用户权限验证和管理
 */
export class PermissionManager {
  /**
   * 检查用户是否拥有指定权限
   * @param userId 用户 ID
   * @param permission 权限
   * @returns Promise<boolean> 是否拥有权限
   */
  async hasPermission(userId: string, permission: Permission): Promise<boolean> {
    const user = await userDAO.getById(userId)

    if (!user) {
      return false
    }

    // 检查用户权限列表中是否包含指定权限
    return user.permissions.includes(permission)
  }

  /**
   * 设置用户权限
   * @param userId 用户 ID
   * @param permissions 权限列表
   * @throws Error 如果用户不存在或操作失败
   */
  async setPermissions(userId: string, permissions: Permission[]): Promise<void> {
    const user = await userDAO.getById(userId)

    if (!user) {
      throw new Error('用户不存在')
    }

    // 更新用户权限
    await userDAO.update(userId, { permissions })
  }

  /**
   * 获取用户权限列表
   * @param userId 用户 ID
   * @returns Promise<Permission[]> 权限列表
   * @throws Error 如果用户不存在
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const user = await userDAO.getById(userId)

    if (!user) {
      throw new Error('用户不存在')
    }

    return user.permissions
  }

  /**
   * 检查是否为主账号
   * @param userId 用户 ID
   * @returns Promise<boolean> 是否为主账号
   */
  async isMainAccount(userId: string): Promise<boolean> {
    const user = await userDAO.getById(userId)

    if (!user) {
      return false
    }

    return user.isMainAccount
  }

  /**
   * 检查是否为子账号
   * @param userId 用户 ID
   * @returns Promise<boolean> 是否为子账号
   */
  async isSubAccount(userId: string): Promise<boolean> {
    const user = await userDAO.getById(userId)

    if (!user) {
      return false
    }

    return !user.isMainAccount
  }
}

/**
 * PermissionManager 单例实例
 */
export const permissionManager = new PermissionManager()
