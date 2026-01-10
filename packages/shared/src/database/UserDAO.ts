/**
 * CYP-memo 用户数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import type { User } from '../types'

/**
 * 用户数据访问对象
 * 提供用户数据的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class UserDAO {
  /**
   * 创建新用户
   */
  async create(user: User): Promise<string> {
    return await getStorage().createUser(user)
  }

  /**
   * 根据 ID 获取用户
   */
  async getById(id: string): Promise<User | undefined> {
    return await getStorage().getUserById(id)
  }

  /**
   * 根据用户名获取用户
   */
  async getByUsername(username: string): Promise<User | undefined> {
    return await getStorage().getUserByUsername(username)
  }

  /**
   * 根据令牌获取用户
   */
  async getByToken(token: string): Promise<User | undefined> {
    return await getStorage().getUserByToken(token)
  }

  /**
   * 获取所有用户
   */
  async getAll(): Promise<User[]> {
    return await getStorage().getAllUsers()
  }

  /**
   * 获取子账号列表
   */
  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await getStorage().getSubAccounts(parentUserId)
  }

  /**
   * 更新用户
   */
  async update(id: string, updates: Partial<User>): Promise<number> {
    return await getStorage().updateUser(id, updates)
  }

  /**
   * 删除用户
   */
  async delete(id: string): Promise<void> {
    await getStorage().deleteUser(id)
  }

  /**
   * 检查用户名是否存在
   */
  async usernameExists(username: string): Promise<boolean> {
    return await getStorage().usernameExists(username)
  }

  /**
   * 检查令牌是否存在
   */
  async tokenExists(token: string): Promise<boolean> {
    return await getStorage().tokenExists(token)
  }
}

/**
 * UserDAO 单例实例
 */
export const userDAO = new UserDAO()
