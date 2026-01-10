/**
 * CYP-memo 本地存储适配器
 * 基于 IndexedDB (Dexie.js) 实现
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { db } from '../database/db'
import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, Admin } from '../types'
import type { IStorageAdapter, StorageMode, QueryOptions, FileBlob } from './StorageAdapter'
import { verifyPassword } from '../utils/crypto'

/**
 * 本地存储适配器
 * 使用 IndexedDB 存储数据，适用于本地单机使用
 * 
 * ⚠️ 警告：此适配器已废弃，仅用于开发和测试
 * 生产环境应使用 RemoteStorageAdapter（服务器端存储）
 */
export class LocalStorageAdapter implements IStorageAdapter {
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    // Dexie 会自动初始化数据库
    await db.open()
    this.initialized = true
    console.warn('⚠️ 使用本地 IndexedDB 存储（已废弃，建议使用服务器端存储）')
  }

  getMode(): StorageMode {
    return 'local'
  }

  // ========== 管理员操作 ==========
  async createAdmin(admin: Admin): Promise<string> {
    return await db.admins.add(admin)
  }

  async getAdminById(id: string): Promise<Admin | undefined> {
    return await db.admins.get(id)
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    return await db.admins.where('username').equals(username).first()
  }

  async getAllAdmins(): Promise<Admin[]> {
    return await db.admins.toArray()
  }

  async updateAdmin(id: string, updates: Partial<Admin>): Promise<number> {
    return await db.admins.update(id, updates)
  }

  async deleteAdmin(id: string): Promise<void> {
    await db.admins.delete(id)
  }

  async adminUsernameExists(username: string): Promise<boolean> {
    const count = await db.admins.where('username').equals(username).count()
    return count > 0
  }

  async countAdmins(): Promise<number> {
    return await db.admins.count()
  }

  async adminLogin(username: string, password: string): Promise<Admin> {
    const admin = await db.admins.where('username').equals(username).first()
    
    if (!admin) {
      throw new Error('用户名或密码错误')
    }

    const isValid = await verifyPassword(password, admin.passwordHash)
    if (!isValid) {
      throw new Error('用户名或密码错误')
    }

    // 更新最后登录时间
    await db.admins.update(admin.id, { lastLoginAt: new Date() })

    return { ...admin, lastLoginAt: new Date() }
  }

  // ========== 用户操作 ==========
  async createUser(user: User): Promise<string> {
    return await db.users.add(user)
  }

  async getUserById(id: string): Promise<User | undefined> {
    return await db.users.get(id)
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await db.users.where('username').equals(username).first()
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    return await db.users.where('token').equals(token).first()
  }

  async getAllUsers(): Promise<User[]> {
    return await db.users.toArray()
  }

  async getSubAccounts(parentUserId: string): Promise<User[]> {
    return await db.users.where('parentUserId').equals(parentUserId).toArray()
  }

  async updateUser(id: string, updates: Partial<User>): Promise<number> {
    return await db.users.update(id, updates)
  }

  async deleteUser(id: string): Promise<void> {
    await db.users.delete(id)
  }

  async usernameExists(username: string): Promise<boolean> {
    const count = await db.users.where('username').equals(username).count()
    return count > 0
  }

  async tokenExists(token: string): Promise<boolean> {
    const count = await db.users.where('token').equals(token).count()
    return count > 0
  }

  // ========== 备忘录操作 ==========
  async createMemo(memo: Memo): Promise<string> {
    return await db.memos.add(memo)
  }

  async getMemoById(id: string): Promise<Memo | undefined> {
    return await db.memos.get(id)
  }

  async getMemosByUserId(userId: string, options?: QueryOptions): Promise<Memo[]> {
    let query = db.memos.where('userId').equals(userId)
    
    // 过滤已删除的备忘录
    let memos = await query.toArray()
    memos = memos.filter(m => !m.deletedAt)
    
    // 排序
    if (options?.orderBy) {
      const dir = options.orderDir === 'asc' ? 1 : -1
      memos.sort((a, b) => {
        const aVal = a[options.orderBy as keyof Memo]
        const bVal = b[options.orderBy as keyof Memo]
        if (aVal instanceof Date && bVal instanceof Date) {
          return dir * (aVal.getTime() - bVal.getTime())
        }
        return dir * String(aVal).localeCompare(String(bVal))
      })
    }
    
    // 分页
    if (options?.offset) {
      memos = memos.slice(options.offset)
    }
    if (options?.limit) {
      memos = memos.slice(0, options.limit)
    }
    
    return memos
  }

  async getDeletedMemos(userId: string): Promise<Memo[]> {
    const memos = await db.memos.where('userId').equals(userId).toArray()
    return memos.filter(m => m.deletedAt)
  }

  async updateMemo(id: string, updates: Partial<Memo>): Promise<number> {
    return await db.memos.update(id, updates)
  }

  async deleteMemo(id: string): Promise<void> {
    await db.memos.delete(id)
  }

  async searchMemos(userId: string, query: string): Promise<Memo[]> {
    const memos = await db.memos.where('userId').equals(userId).toArray()
    const lowerQuery = query.toLowerCase()
    return memos.filter(m => 
      !m.deletedAt && (
        m.title.toLowerCase().includes(lowerQuery) ||
        m.content.toLowerCase().includes(lowerQuery)
      )
    )
  }

  async getMemosByTag(userId: string, tag: string): Promise<Memo[]> {
    const memos = await db.memos.where('userId').equals(userId).toArray()
    return memos.filter(m => !m.deletedAt && m.tags.includes(tag))
  }

  async countMemos(userId: string): Promise<number> {
    const memos = await db.memos.where('userId').equals(userId).toArray()
    return memos.filter(m => !m.deletedAt).length
  }

  // ========== 备忘录历史 ==========
  async createMemoHistory(history: MemoHistory): Promise<string> {
    return await db.memoHistory.add(history)
  }

  async getMemoHistory(memoId: string): Promise<MemoHistory[]> {
    return await db.memoHistory.where('memoId').equals(memoId).toArray()
  }

  async deleteMemoHistory(memoId: string): Promise<void> {
    await db.memoHistory.where('memoId').equals(memoId).delete()
  }

  // ========== 文件操作 ==========
  async createFile(metadata: FileMetadata, blob: Blob): Promise<string> {
    await db.transaction('rw', [db.files, db.fileBlobs], async () => {
      await db.files.add(metadata)
      await db.fileBlobs.add({ id: metadata.id, blob })
    })
    return metadata.id
  }

  async getFileById(id: string): Promise<FileMetadata | undefined> {
    return await db.files.get(id)
  }

  async getFileBlob(id: string): Promise<Blob | undefined> {
    const fileBlob = await db.fileBlobs.get(id)
    return fileBlob?.blob
  }

  async getFilesByUserId(userId: string): Promise<FileMetadata[]> {
    return await db.files.where('userId').equals(userId).toArray()
  }

  async getFilesByMemoId(memoId: string): Promise<FileMetadata[]> {
    return await db.files.where('memoId').equals(memoId).toArray()
  }

  async updateFile(id: string, updates: Partial<FileMetadata>): Promise<number> {
    return await db.files.update(id, updates)
  }

  async deleteFile(id: string): Promise<void> {
    await db.transaction('rw', [db.files, db.fileBlobs], async () => {
      await db.files.delete(id)
      await db.fileBlobs.delete(id)
    })
  }

  async getStorageUsed(userId: string): Promise<number> {
    const files = await db.files.where('userId').equals(userId).toArray()
    return files.reduce((sum, f) => sum + f.size, 0)
  }

  // ========== 分享链接 ==========
  async createShare(share: ShareLink): Promise<string> {
    return await db.shares.add(share)
  }

  async getShareById(id: string): Promise<ShareLink | undefined> {
    return await db.shares.get(id)
  }

  async getSharesByUserId(userId: string): Promise<ShareLink[]> {
    return await db.shares.where('userId').equals(userId).toArray()
  }

  async getSharesByMemoId(memoId: string): Promise<ShareLink[]> {
    return await db.shares.where('memoId').equals(memoId).toArray()
  }

  async updateShare(id: string, updates: Partial<ShareLink>): Promise<number> {
    return await db.shares.update(id, updates)
  }

  async deleteShare(id: string): Promise<void> {
    await db.shares.delete(id)
  }

  async deleteExpiredShares(): Promise<number> {
    const now = new Date()
    const expired = await db.shares.filter(s => s.expiresAt && s.expiresAt < now).toArray()
    await db.shares.bulkDelete(expired.map(s => s.id))
    return expired.length
  }

  // ========== 日志操作 ==========
  async createLog(log: LogEntry): Promise<string> {
    return await db.logs.add(log)
  }

  async getLogs(options?: QueryOptions): Promise<LogEntry[]> {
    let logs = await db.logs.orderBy('timestamp').reverse().toArray()
    
    if (options?.offset) {
      logs = logs.slice(options.offset)
    }
    if (options?.limit) {
      logs = logs.slice(0, options.limit)
    }
    
    return logs
  }

  async getLogsByLevel(level: string): Promise<LogEntry[]> {
    return await db.logs.where('level').equals(level).toArray()
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    const oldLogs = await db.logs.filter(l => l.timestamp < beforeDate).toArray()
    await db.logs.bulkDelete(oldLogs.map(l => l.id))
    return oldLogs.length
  }

  async clearLogs(): Promise<void> {
    await db.logs.clear()
  }

  // ========== 设置操作 ==========
  async getSetting<T>(key: string): Promise<T | undefined> {
    const entry = await db.settings.get(key)
    return entry?.value as T | undefined
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await db.settings.put({ key, value })
  }

  async getAllSettings(): Promise<Record<string, unknown>> {
    const entries = await db.settings.toArray()
    const result: Record<string, unknown> = {}
    for (const entry of entries) {
      result[entry.key] = entry.value
    }
    return result
  }

  // ========== 数据管理 ==========
  async exportAllData(): Promise<string> {
    const data = {
      users: await db.users.toArray(),
      memos: await db.memos.toArray(),
      memoHistory: await db.memoHistory.toArray(),
      files: await db.files.toArray(),
      shares: await db.shares.toArray(),
      logs: await db.logs.toArray(),
      settings: await db.settings.toArray(),
      exportedAt: new Date().toISOString(),
      version: '1.0',
    }
    return JSON.stringify(data, null, 2)
  }

  async importData(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData)
    
    await db.transaction('rw', 
      [db.users, db.memos, db.memoHistory, db.files, db.shares, db.logs, db.settings],
      async () => {
        // 清空现有数据
        await db.users.clear()
        await db.memos.clear()
        await db.memoHistory.clear()
        await db.files.clear()
        await db.shares.clear()
        await db.logs.clear()
        await db.settings.clear()
        
        // 导入新数据
        if (data.users) await db.users.bulkAdd(data.users)
        if (data.memos) await db.memos.bulkAdd(data.memos)
        if (data.memoHistory) await db.memoHistory.bulkAdd(data.memoHistory)
        if (data.files) await db.files.bulkAdd(data.files)
        if (data.shares) await db.shares.bulkAdd(data.shares)
        if (data.logs) await db.logs.bulkAdd(data.logs)
        if (data.settings) await db.settings.bulkAdd(data.settings)
      }
    )
  }

  async clearAllData(): Promise<void> {
    await db.transaction('rw',
      [db.users, db.memos, db.memoHistory, db.files, db.fileBlobs, db.shares, db.logs, db.settings],
      async () => {
        await db.users.clear()
        await db.memos.clear()
        await db.memoHistory.clear()
        await db.files.clear()
        await db.fileBlobs.clear()
        await db.shares.clear()
        await db.logs.clear()
        await db.settings.clear()
      }
    )
  }

  async getStatistics(): Promise<{
    userCount: number
    memoCount: number
    fileCount: number
    shareCount: number
    logCount: number
  }> {
    return {
      userCount: await db.users.count(),
      memoCount: await db.memos.count(),
      fileCount: await db.files.count(),
      shareCount: await db.shares.count(),
      logCount: await db.logs.count(),
    }
  }
}

/**
 * 本地存储适配器单例
 */
export const localStorageAdapter = new LocalStorageAdapter()
