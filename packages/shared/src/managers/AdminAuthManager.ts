/**
 * CYP-memo 管理员认证管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { adminDAO } from '../database/AdminDAO'
import { hashPassword, generateUUID, verifyPassword } from '../utils/crypto'
import { logManager } from './LogManager'
import { AdminRole } from '../types'
import type { Admin } from '../types'

/**
 * 管理员认证信息存储键
 */
const ADMIN_AUTH_KEY = 'cyp-memo-admin-auth'

/**
 * 管理员认证信息
 */
interface AdminAuthInfo {
  adminId: string
  username: string
  timestamp: number
}

/**
 * 默认超级管理员账号
 */
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123',
}

/**
 * 管理员认证管理器
 * 负责管理员账号的认证和管理
 */
export class AdminAuthManager {
  /**
   * 初始化管理员系统
   * 如果没有管理员账号，创建默认超级管理员
   */
  async initialize(): Promise<void> {
    const adminCount = await adminDAO.count()
    
    if (adminCount === 0) {
      // 创建默认超级管理员
      await this.createAdmin(
        DEFAULT_ADMIN.username,
        DEFAULT_ADMIN.password,
        AdminRole.SUPER_ADMIN
      )
      
      await logManager.info('已创建默认超级管理员账号', {
        username: DEFAULT_ADMIN.username,
        action: 'create_default_admin',
      })
      
      console.log('========================================')
      console.log('已创建默认管理员账号：')
      console.log(`用户名: ${DEFAULT_ADMIN.username}`)
      console.log(`密码: ${DEFAULT_ADMIN.password}`)
      console.log('请登录后立即修改密码！')
      console.log('========================================')
    }
  }

  /**
   * 管理员登录
   */
  async login(username: string, password: string): Promise<Admin> {
    // 使用存储适配器的登录方法（支持本地和远程）
    const admin = await adminDAO.login(username, password)

    // 保存认证信息
    this.saveAuthInfo({
      adminId: admin.id,
      username: admin.username,
      timestamp: Date.now(),
    })

    await logManager.info('管理员登录成功', {
      adminId: admin.id,
      username: admin.username,
      action: 'admin_login',
    })

    return admin
  }

  /**
   * 管理员注销
   */
  async logout(): Promise<void> {
    this.clearAuthInfo()
  }

  /**
   * 自动登录
   */
  async autoLogin(): Promise<Admin | null> {
    const authInfo = this.getAuthInfo()

    if (!authInfo) {
      return null
    }

    try {
      const admin = await adminDAO.getById(authInfo.adminId)

      if (!admin) {
        this.clearAuthInfo()
        return null
      }

      // 更新最后登录时间
      await adminDAO.update(admin.id, {
        lastLoginAt: new Date(),
      })

      return admin
    } catch {
      this.clearAuthInfo()
      return null
    }
  }

  /**
   * 创建管理员
   */
  async createAdmin(
    username: string,
    password: string,
    role: AdminRole = AdminRole.ADMIN
  ): Promise<Admin> {
    // 检查用户名是否已存在
    const exists = await adminDAO.usernameExists(username)
    if (exists) {
      throw new Error('用户名已存在')
    }

    // 验证密码强度
    if (password.length < 6) {
      throw new Error('密码至少需要6位')
    }

    const passwordHash = await hashPassword(password)

    const admin: Admin = {
      id: generateUUID(),
      username,
      passwordHash,
      role,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    }

    await adminDAO.create(admin)

    await logManager.info('创建管理员账号', {
      adminId: admin.id,
      username,
      role,
      action: 'create_admin',
    })

    return admin
  }

  /**
   * 修改管理员密码
   */
  async changePassword(
    adminId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const admin = await adminDAO.getById(adminId)

    if (!admin) {
      throw new Error('管理员不存在')
    }

    // 验证旧密码
    const isValid = await verifyPassword(oldPassword, admin.passwordHash)
    if (!isValid) {
      throw new Error('原密码错误')
    }

    // 验证新密码强度
    if (newPassword.length < 6) {
      throw new Error('新密码至少需要6位')
    }

    const passwordHash = await hashPassword(newPassword)
    await adminDAO.update(adminId, { passwordHash })

    await logManager.info('管理员修改密码', {
      adminId,
      action: 'change_admin_password',
    })
  }

  /**
   * 重置管理员密码（超级管理员操作）
   */
  async resetPassword(adminId: string, newPassword: string): Promise<void> {
    const admin = await adminDAO.getById(adminId)

    if (!admin) {
      throw new Error('管理员不存在')
    }

    if (newPassword.length < 6) {
      throw new Error('新密码至少需要6位')
    }

    const passwordHash = await hashPassword(newPassword)
    await adminDAO.update(adminId, { passwordHash })

    await logManager.info('重置管理员密码', {
      adminId,
      action: 'reset_admin_password',
    })
  }

  /**
   * 删除管理员
   */
  async deleteAdmin(adminId: string): Promise<void> {
    const admin = await adminDAO.getById(adminId)

    if (!admin) {
      throw new Error('管理员不存在')
    }

    // 不能删除超级管理员
    if (admin.role === AdminRole.SUPER_ADMIN) {
      throw new Error('不能删除超级管理员')
    }

    await adminDAO.delete(adminId)

    await logManager.info('删除管理员账号', {
      adminId,
      username: admin.username,
      action: 'delete_admin',
    })
  }

  /**
   * 获取所有管理员
   */
  async getAllAdmins(): Promise<Admin[]> {
    return await adminDAO.getAll()
  }

  /**
   * 保存认证信息
   */
  private saveAuthInfo(info: AdminAuthInfo): void {
    try {
      localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(info))
    } catch {
      console.warn('无法保存管理员认证信息')
    }
  }

  /**
   * 获取认证信息
   */
  private getAuthInfo(): AdminAuthInfo | null {
    try {
      const data = localStorage.getItem(ADMIN_AUTH_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  /**
   * 清除认证信息
   */
  private clearAuthInfo(): void {
    try {
      localStorage.removeItem(ADMIN_AUTH_KEY)
    } catch {
      console.warn('无法清除管理员认证信息')
    }
  }
}

/**
 * 管理员认证管理器单例
 */
export const adminAuthManager = new AdminAuthManager()
