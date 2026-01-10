/**
 * CYP-memo 系统初始化管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import { userDAO } from '../database/UserDAO'
import { hashPassword, generateUUID } from '../utils/crypto'
import { logManager } from './LogManager'
import { Permission } from '../types'
import type { User } from '../types'

/**
 * 系统初始化管理器
 * 负责系统首次初始化，包括创建默认管理员账户
 * 通过存储管理器支持本地和远程存储
 */
export class InitManager {
  /**
   * 初始化系统
   * 检查是否需要创建默认管理员账户
   * @returns Promise<void>
   */
  async initializeSystem(): Promise<void> {
    try {
      // 检查是否已初始化
      const initSetting = await getStorage().getSetting<boolean>('system_initialized')

      if (initSetting === true) {
        // 系统已初始化，跳过
        return
      }

      // 创建默认管理员账户
      await this.createDefaultAdmin()

      // 标记系统已初始化
      await getStorage().setSetting('system_initialized', true)

      await logManager.info('系统初始化完成', {
        action: 'system_init',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'system_init',
        message: '系统初始化失败',
      })
      throw new Error('系统初始化失败')
    }
  }

  /**
   * 创建默认管理员账户
   * 用户名: admin
   * 密码: admin
   * @returns Promise<User> 创建的管理员用户对象
   */
  private async createDefaultAdmin(): Promise<User> {
    try {
      // 检查 admin 账户是否已存在
      const existingAdmin = await userDAO.getByUsername('admin')

      if (existingAdmin) {
        await logManager.info('默认管理员账户已存在，跳过创建', {
          action: 'create_default_admin',
          adminId: existingAdmin.id,
        })
        return existingAdmin
      }

      // 哈希密码
      const passwordHash = await hashPassword('admin')

      // 创建管理员用户对象
      const adminUser: User = {
        id: generateUUID(),
        username: 'admin',
        passwordHash,
        rememberPassword: false,
        isMainAccount: true,
        parentUserId: undefined,
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
      await userDAO.create(adminUser)

      await logManager.info('默认管理员账户创建成功', {
        action: 'create_default_admin',
        adminId: adminUser.id,
        username: 'admin',
      })

      return adminUser
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'create_default_admin',
        message: '创建默认管理员账户失败',
      })
      throw new Error('创建默认管理员账户失败')
    }
  }

  /**
   * 重置管理员密码为默认值
   * 仅用于开发和测试环境
   * @returns Promise<void>
   */
  async resetAdminPassword(): Promise<void> {
    try {
      const admin = await userDAO.getByUsername('admin')

      if (!admin) {
        throw new Error('管理员账户不存在')
      }

      const passwordHash = await hashPassword('admin')

      await userDAO.update(admin.id, {
        passwordHash,
      })

      await logManager.info('管理员密码已重置为默认值', {
        action: 'reset_admin_password',
        adminId: admin.id,
      })
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'reset_admin_password',
        message: '重置管理员密码失败',
      })
      throw new Error('重置管理员密码失败')
    }
  }
}

/**
 * InitManager 单例实例
 */
export const initManager = new InitManager()
