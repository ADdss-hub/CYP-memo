/**
 * CYP-memo 管理员数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import type { Admin } from '../types'

/**
 * 管理员数据访问对象
 * 提供管理员数据的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class AdminDAO {
  /**
   * 创建新管理员
   */
  async create(admin: Admin): Promise<string> {
    return await getStorage().createAdmin(admin)
  }

  /**
   * 根据 ID 获取管理员
   */
  async getById(id: string): Promise<Admin | undefined> {
    return await getStorage().getAdminById(id)
  }

  /**
   * 根据用户名获取管理员
   */
  async getByUsername(username: string): Promise<Admin | undefined> {
    return await getStorage().getAdminByUsername(username)
  }

  /**
   * 获取所有管理员
   */
  async getAll(): Promise<Admin[]> {
    return await getStorage().getAllAdmins()
  }

  /**
   * 更新管理员
   */
  async update(id: string, updates: Partial<Admin>): Promise<number> {
    return await getStorage().updateAdmin(id, updates)
  }

  /**
   * 删除管理员
   */
  async delete(id: string): Promise<void> {
    await getStorage().deleteAdmin(id)
  }

  /**
   * 检查用户名是否存在
   */
  async usernameExists(username: string): Promise<boolean> {
    return await getStorage().adminUsernameExists(username)
  }

  /**
   * 获取管理员数量
   */
  async count(): Promise<number> {
    return await getStorage().countAdmins()
  }

  /**
   * 管理员登录
   */
  async login(username: string, password: string): Promise<Admin> {
    return await getStorage().adminLogin(username, password)
  }
}

/**
 * AdminDAO 单例实例
 */
export const adminDAO = new AdminDAO()
