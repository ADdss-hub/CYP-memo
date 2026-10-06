/**
 * CYP-memo 子账号管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { userDAO } from '../../database/UserDAO'
import { hashPassword, generateUUID } from '../../utils/crypto'
import { logManager } from '../LogManager'
import { authValidator } from './AuthValidator'
import { Permission, normalizeMemberPermissions } from '../../types'
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

      // 本地存储仍写 passwordHash；远程由服务端 bcrypt（一并传明文 password）
      let passwordHash: string
      try {
        const hashPromise = hashPassword(password)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('密码哈希超时')), 30000)
        )
        passwordHash = await Promise.race([hashPromise, timeoutPromise])
      } catch (error) {
        throw new Error(`密码处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
      }

      // 创建子账号对象（权限规范化：强制 profile_self，禁止 account_manage）
      const normalizedPermissions = normalizeMemberPermissions(permissions)
      const subAccount: User & { password: string } = {
        id: generateUUID(),
        username,
        passwordHash,
        password,
        rememberPassword: false,
        isMainAccount: false,
        parentUserId,
        permissions: normalizedPermissions,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        role: 'member',
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

    // 远程：DELETE /users/:id 由服务端按 purgeRelatedOnAccountDelete 级联
    // 本地：在此按同名设置清除相关内容后再删账号
    const { getStorage } = await import('../../storage/StorageManager')
    const { LocalStorageAdapter } = await import('../../storage/LocalStorageAdapter')
    const storage = getStorage()
    let purgeRelated = true
    try {
      const raw = localStorage.getItem('cyp-memo-settings')
      if (raw) {
        const parsed = JSON.parse(raw) as { purgeRelatedOnAccountDelete?: boolean }
        if (typeof parsed.purgeRelatedOnAccountDelete === 'boolean') {
          purgeRelated = parsed.purgeRelatedOnAccountDelete
        }
      }
    } catch {
      purgeRelated = true
    }

    if (purgeRelated && storage instanceof LocalStorageAdapter) {
      const memos = await storage.getMemosByUserId(subAccountId)
      for (const m of memos) {
        await storage.deleteMemo(m.id)
      }
      const deleted = await storage.getDeletedMemos(subAccountId)
      for (const m of deleted) {
        await storage.deleteMemo(m.id)
      }
      const files = await storage.getFilesByUserId(subAccountId)
      for (const f of files) {
        await storage.deleteFile(f.id)
      }
      const shares = await storage.getSharesByUserId(subAccountId)
      for (const s of shares) {
        await storage.deleteShare(s.id)
      }
    }

    await userDAO.delete(subAccountId)

    await logManager.info('删除子账号', {
      parentUserId,
      subAccountId,
      username: subAccount.username,
      purgeRelated,
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

    // 更新权限（规范化）
    await userDAO.update(subAccountId, {
      permissions: normalizeMemberPermissions(permissions),
    })

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
