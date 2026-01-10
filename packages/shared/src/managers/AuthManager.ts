/**
 * CYP-memo 认证管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { userDAO } from '../database/UserDAO'
import { hashPassword, generateUUID, verifyPassword, generateToken, validateToken } from '../utils/crypto'
import { logManager } from './LogManager'
import { authStorage } from './auth/AuthStorage'
import { authValidator } from './auth/AuthValidator'
import { subAccountManager } from './auth/SubAccountManager'
import { Permission } from '../types'
import type { User, SecurityQuestion } from '../types'
import type { RememberInfo } from './auth/AuthStorage'

/**
 * 认证管理器
 * 负责用户认证、会话管理和令牌生成
 */
export class AuthManager {
  /**
   * 账号密码登录
   * @param username 用户名
   * @param password 密码
   * @param remember 是否记住密码
   * @returns Promise<User> 登录成功的用户对象
   * @throws Error 登录失败时抛出错误
   */
  async loginWithPassword(
    username: string,
    password: string,
    remember: boolean = false
  ): Promise<User> {
    // 查找用户
    const user = await userDAO.getByUsername(username)

    if (!user) {
      throw new Error('用户名或密码错误')
    }

    // 验证密码
    if (!user.passwordHash) {
      throw new Error('该用户不支持密码登录')
    }

    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      throw new Error('用户名或密码错误')
    }

    // 更新最后登录时间
    await userDAO.update(user.id, {
      lastLoginAt: new Date(),
      rememberPassword: remember,
    })

    // 保存认证信息到本地存储
    authStorage.saveAuthInfo({
      userId: user.id,
      username: user.username,
      loginType: 'password',
      timestamp: Date.now(),
    })

    // 如果选择记住密码，保存到本地存储
    if (remember) {
      authStorage.saveRememberInfo({ username, password })
    } else {
      authStorage.clearRememberInfo()
    }

    // 返回更新后的用户对象
    const updatedUser = await userDAO.getById(user.id)
    return updatedUser!
  }

  /**
   * 个人令牌登录
   * @param token 个人令牌
   * @returns Promise<User> 登录成功的用户对象
   * @throws Error 登录失败时抛出错误
   */
  async loginWithToken(token: string): Promise<User> {
    // 验证令牌格式
    if (!validateToken(token)) {
      throw new Error('令牌格式无效')
    }

    // 查找用户
    const user = await userDAO.getByToken(token)

    if (!user) {
      throw new Error('令牌无效或不存在')
    }

    // 更新最后登录时间
    await userDAO.update(user.id, {
      lastLoginAt: new Date(),
    })

    // 保存认证信息到本地存储
    authStorage.saveAuthInfo({
      userId: user.id,
      username: user.username,
      loginType: 'token',
      timestamp: Date.now(),
    })

    // 返回更新后的用户对象
    const updatedUser = await userDAO.getById(user.id)
    return updatedUser!
  }

  /**
   * 注册账号密码用户
   * @param username 用户名
   * @param password 密码
   * @param securityQuestion 安全问题
   * @returns Promise<User> 注册成功的用户对象（包含自动生成的个人令牌）
   * @throws Error 注册失败时抛出错误
   */
  async registerWithPassword(
    username: string,
    password: string,
    securityQuestion: SecurityQuestion
  ): Promise<User> {
    // 验证用户名
    await authValidator.validateUsername(username)

    // 验证密码强度
    authValidator.validatePassword(password)

    // 验证安全问题
    if (!securityQuestion.question || !securityQuestion.answerHash) {
      throw new Error('安全问题和答案不能为空')
    }

    // 哈希密码
    const passwordHash = await hashPassword(password)

    // 自动生成唯一个人令牌
    let token: string
    let tokenExists: boolean

    do {
      token = generateToken()
      tokenExists = await userDAO.tokenExists(token)
    } while (tokenExists)

    // 创建用户对象（包含自动生成的个人令牌）
    const user: User = {
      id: generateUUID(),
      username,
      passwordHash,
      token, // 自动生成的个人令牌
      securityQuestion,
      rememberPassword: false,
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
    }

    // 保存到数据库
    await userDAO.create(user)

    // 保存认证信息到本地存储（注册后自动登录）
    authStorage.saveAuthInfo({
      userId: user.id,
      username: user.username,
      loginType: 'password',
      timestamp: Date.now(),
    })

    // 记录日志（包含令牌生成信息）
    await logManager.info('用户注册成功（已自动生成个人令牌）', {
      userId: user.id,
      username,
      action: 'user_register',
      tokenGenerated: true,
    })

    return user
  }

  /**
   * 注册个人令牌用户
   * @returns Promise<{ user: User; token: string }> 注册成功的用户对象和令牌
   */
  async registerWithToken(): Promise<{ user: User; token: string }> {
    // 生成唯一令牌
    let token: string
    let tokenExists: boolean

    do {
      token = generateToken()
      tokenExists = await userDAO.tokenExists(token)
    } while (tokenExists)

    // 创建用户对象
    const user: User = {
      id: generateUUID(),
      username: `token_user_${Date.now()}`,
      token,
      rememberPassword: false,
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
    }

    // 保存到数据库
    await userDAO.create(user)

    // 保存认证信息到本地存储（注册后自动登录）
    authStorage.saveAuthInfo({
      userId: user.id,
      username: user.username,
      loginType: 'token',
      timestamp: Date.now(),
    })

    // 记录日志
    await logManager.info('令牌用户注册成功', {
      userId: user.id,
      action: 'token_user_register',
    })

    return { user, token }
  }

  /**
   * 注销
   * 清除本地存储的认证信息
   */
  async logout(): Promise<void> {
    authStorage.clearAuthInfo()
    // 注意：不清除记住密码信息，用户可能下次还想使用
  }

  /**
   * 自动登录
   * 使用本地存储的认证信息尝试自动登录
   * @returns Promise<User | null> 登录成功返回用户对象，否则返回 null
   */
  async autoLogin(): Promise<User | null> {
    const authInfo = authStorage.getAuthInfo()

    if (!authInfo) {
      return null
    }

    try {
      // 根据登录类型尝试获取用户
      const user = await userDAO.getById(authInfo.userId)

      if (!user) {
        // 用户不存在，清除认证信息
        authStorage.clearAuthInfo()
        return null
      }

      // 更新最后登录时间
      await userDAO.update(user.id, {
        lastLoginAt: new Date(),
      })

      return user
    } catch (error) {
      // 自动登录失败，清除认证信息
      authStorage.clearAuthInfo()
      return null
    }
  }

  /**
   * 验证当前会话是否有效
   * 检查用户是否仍然存在于数据库中
   * @returns Promise<{ valid: boolean; reason?: string }> 会话验证结果
   */
  async validateSession(): Promise<{ valid: boolean; reason?: string }> {
    const authInfo = authStorage.getAuthInfo()

    if (!authInfo) {
      return { valid: false, reason: '未登录' }
    }

    try {
      // 检查用户是否存在
      const user = await userDAO.getById(authInfo.userId)

      if (!user) {
        // 用户不存在（可能被管理员删除或数据库被清空）
        authStorage.clearAuthInfo()
        return { valid: false, reason: '账号已被删除或数据库已重置' }
      }

      return { valid: true }
    } catch (error) {
      // 验证失败（可能是网络问题或服务器错误）
      console.error('会话验证失败:', error)
      return { valid: false, reason: '会话验证失败，请重新登录' }
    }
  }

  /**
   * 密码找回
   * 通过安全问题验证后重置密码
   * @param username 用户名
   * @param securityAnswer 安全问题答案
   * @param newPassword 新密码
   * @throws Error 找回失败时抛出错误
   */
  async resetPassword(
    username: string,
    securityAnswer: string,
    newPassword: string
  ): Promise<void> {
    // 查找用户
    const user = await userDAO.getByUsername(username)

    if (!user) {
      throw new Error('用户不存在')
    }

    // 检查是否设置了安全问题
    if (!user.securityQuestion) {
      throw new Error('该用户未设置安全问题，请联系管理员')
    }

    // 验证安全问题答案
    const isValid = await verifyPassword(securityAnswer, user.securityQuestion.answerHash)
    if (!isValid) {
      // 记录失败的找回尝试
      await logManager.warn('密码找回失败：安全问题答案错误', {
        username,
        action: 'password_reset',
        success: false,
      })
      throw new Error('安全问题答案错误')
    }

    // 验证新密码强度
    authValidator.validatePassword(newPassword)

    // 哈希新密码
    const passwordHash = await hashPassword(newPassword)

    // 更新密码
    await userDAO.update(user.id, {
      passwordHash,
    })

    // 记录成功的密码重置
    await logManager.info('密码重置成功', {
      username,
      userId: user.id,
      action: 'password_reset',
      success: true,
    })
  }

  /**
   * 获取记住的密码信息
   * @returns RememberInfo | null 记住的密码信息，如果没有则返回 null
   */
  getRememberInfo(): RememberInfo | null {
    return authStorage.getRememberInfo()
  }

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
    return await subAccountManager.createSubAccount(parentUserId, username, password, permissions)
  }

  /**
   * 获取子账号列表
   * @param parentUserId 父账号 ID
   * @returns Promise<User[]> 子账号列表
   */
  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await subAccountManager.getSubAccounts(parentUserId)
  }

  /**
   * 删除子账号
   * @param parentUserId 父账号 ID
   * @param subAccountId 子账号 ID
   * @throws Error 删除失败时抛出错误
   */
  async deleteSubAccount(parentUserId: string, subAccountId: string): Promise<void> {
    await subAccountManager.deleteSubAccount(parentUserId, subAccountId)
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
    await subAccountManager.updateSubAccountPermissions(parentUserId, subAccountId, permissions)
  }

  /**
   * 生成新的个人令牌
   * @returns string 生成的令牌
   */
  generateToken(): string {
    return generateToken()
  }
}

/**
 * AuthManager 单例实例
 */
export const authManager = new AuthManager()
