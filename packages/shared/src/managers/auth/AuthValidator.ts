/**
 * CYP-memo 认证验证器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { userDAO } from '../../database/UserDAO'
import { validatePasswordStrength } from '../../utils/validation'
import type { User } from '../../types'
import { storageManager } from '../../storage/StorageManager'

/**
 * 认证验证器
 * 负责各种验证逻辑
 */
export class AuthValidator {
  /**
   * 验证用户名（用于主账号注册）
   * @throws Error 验证失败时抛出错误
   */
  async validateUsername(username: string): Promise<void> {
    if (!username || username.trim().length === 0) {
      throw new Error('用户名不能为空')
    }

    // A12-E：远程禁止依赖匿名 exists 探测；重复名由 POST /auth/register 统一返回
    if (storageManager.isInitialized() && storageManager.getMode() === 'remote') {
      return
    }

    const exists = await userDAO.usernameExists(username)
    if (exists) {
      throw new Error('用户名已存在')
    }
  }

  /**
   * 验证子账号用户名（只在同一主账号下检查唯一性）
   * @param username 用户名
   * @param parentUserId 父账号ID
   * @throws Error 验证失败时抛出错误
   */
  async validateSubAccountUsername(username: string, parentUserId: string): Promise<void> {
    if (!username || username.trim().length === 0) {
      throw new Error('用户名不能为空')
    }

    // 检查是否输入了主账号的用户名
    const parentUser = await userDAO.getById(parentUserId)
    if (parentUser && parentUser.username === username) {
      throw new Error('不能使用主账号的用户名创建子账号')
    }

    // 检查是否输入了其他主账号的用户名
    const existingUser = await userDAO.getByUsername(username)
    if (existingUser && (existingUser.isMainAccount || existingUser.role === 'owner')) {
      throw new Error(`用户名「${username}」已被主账户占用，请更换用户名`)
    }

    // 已被其他主账户下的子账户占用（全局用户名唯一）
    if (
      existingUser &&
      existingUser.id &&
      (existingUser.role === 'member' || Boolean(existingUser.parentUserId)) &&
      existingUser.parentUserId !== parentUserId
    ) {
      const owner = existingUser.parentUserId
        ? await userDAO.getById(existingUser.parentUserId)
        : undefined
      const ownerName = owner?.username
      if (ownerName) {
        throw new Error(
          `用户名「${username}」已被主账户「${ownerName}」下的子账户占用，请联系该主账户处理，或更换用户名`
        )
      }
      throw new Error(
        `用户名「${username}」已被其他主账户下的子账户占用，请联系对应主账户处理，或更换用户名`
      )
    }

    // 获取该主账号下的所有子账号
    const subAccounts = await userDAO.getSubAccounts(parentUserId)
    
    // 检查用户名是否在该主账号的子账号中已存在
    const exists = subAccounts.some(account => account.username === username)
    if (exists) {
      throw new Error('该用户名在您的子账号中已存在')
    }
  }

  /**
   * 验证密码强度
   * @throws Error 验证失败时抛出错误
   */
  validatePassword(password: string): void {
    const validation = validatePasswordStrength(password)
    if (!validation.valid) {
      throw new Error(validation.errors.join('；'))
    }
  }

  /**
   * 验证用户是否为主账号
   * @throws Error 验证失败时抛出错误
   */
  async validateMainAccount(userId: string): Promise<User> {
    const user = await userDAO.getById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }
    if (!user.isMainAccount) {
      throw new Error('只有主账号可以执行此操作')
    }
    return user
  }

  /**
   * 验证子账号归属
   * @throws Error 验证失败时抛出错误
   */
  async validateSubAccountOwnership(parentUserId: string, subAccountId: string): Promise<User> {
    const subAccount = await userDAO.getById(subAccountId)
    if (!subAccount) {
      throw new Error('子账号不存在')
    }
    if (subAccount.parentUserId !== parentUserId) {
      throw new Error('无权操作该子账号')
    }
    return subAccount
  }
}

/**
 * AuthValidator 单例实例
 */
export const authValidator = new AuthValidator()
