/**
 * CYP-memo 用户数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * SIX-DB：读写路径经 projectUserIdentityFields 补齐 role/tenantRootId。
 * create 调用方应写入 role + tenantRootId（注册即 Owner）；缺省由投影补齐。
 * 剩余缺口：getOwners() / countByRole(role) — 见 identityMigration.ts
 */

import { getStorage } from '../storage'
import type { User } from '../types'
import { projectUserIdentityFields } from './identityMigration'

/**
 * 用户数据访问对象
 * 提供用户数据的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class UserDAO {
  /**
   * 创建新用户
   * R1：调用方应写入 role/tenantRootId；此处投影补齐缺省字段（不改权威种子）
   */
  async create(user: User): Promise<string> {
    return await getStorage().createUser(projectUserIdentityFields(user))
  }

  /**
   * 根据 ID 获取用户
   */
  async getById(id: string): Promise<User | undefined> {
    const user = await getStorage().getUserById(id)
    return user ? projectUserIdentityFields(user) : undefined
  }

  /**
   * 根据用户名获取用户
   */
  async getByUsername(username: string): Promise<User | undefined> {
    const user = await getStorage().getUserByUsername(username)
    return user ? projectUserIdentityFields(user) : undefined
  }

  /**
   * 根据令牌获取用户
   */
  async getByToken(token: string): Promise<User | undefined> {
    const user = await getStorage().getUserByToken(token)
    return user ? projectUserIdentityFields(user) : undefined
  }

  /**
   * 获取所有用户
   */
  async getAll(): Promise<User[]> {
    const users = await getStorage().getAllUsers()
    return users.map(projectUserIdentityFields)
  }

  /**
   * 获取子账号列表
   */
  async getSubAccounts(parentUserId: string): Promise<User[]> {
    const users = await getStorage().getSubAccounts(parentUserId)
    return users.map(projectUserIdentityFields)
  }

  /**
   * 按租户根列出用户（remote 走服务端 tenantRootId SQL；local 客户端过滤）
   */
  async listByTenantRootId(tenantRootId: string): Promise<User[]> {
    const adapter = getStorage() as {
      getUsersByTenantRootId?: (id: string) => Promise<User[]>
    }
    if (typeof adapter.getUsersByTenantRootId === 'function') {
      const users = await adapter.getUsersByTenantRootId(tenantRootId)
      return users.map(projectUserIdentityFields)
    }
    const all = await this.getAll()
    return all.filter((u) => u.tenantRootId === tenantRootId)
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
