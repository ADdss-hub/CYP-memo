/**
 * CYP-memo IndexedDB 数据库定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * SIX-DB：权威身份仍在 server sql.js；本库为桌面/离线兼容面。
 */

import Dexie, { Table } from 'dexie'
import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, Admin } from '../types'
import { projectUserIdentityFields } from './identityMigration'
import { OWNER_DEFAULT_PERMISSIONS } from '../types'

/**
 * 文件 Blob 存储接口
 */
export interface FileBlob {
  id: string
  blob: Blob
}

/**
 * 设置存储接口
 */
export interface SettingEntry {
  key: string
  value: unknown
}

/**
 * CYP-memo 数据库类
 * 使用 Dexie.js 管理 IndexedDB
 */
export class CYPMemoDB extends Dexie {
  users!: Table<User, string>
  admins!: Table<Admin, string>
  memos!: Table<Memo, string>
  memoHistory!: Table<MemoHistory, string>
  files!: Table<FileMetadata, string>
  fileBlobs!: Table<FileBlob, string>
  logs!: Table<LogEntry, string>
  shares!: Table<ShareLink, string>
  settings!: Table<SettingEntry, string>

  constructor() {
    super('CYPMemoDB')

    // 定义数据库版本和表结构
    this.version(1).stores({
      users: 'id, username, token, parentUserId',
      memos: 'id, userId, *tags, createdAt, updatedAt, deletedAt',
      memoHistory: 'id, memoId, timestamp',
      files: 'id, userId, memoId, uploadedAt',
      fileBlobs: 'id',
      logs: 'id, level, timestamp',
      shares: 'id, memoId, userId, expiresAt',
      settings: 'key',
    })

    // 版本 2：添加管理员表（R1 迁移债：合并进 users 后不再写入）
    this.version(2).stores({
      admins: 'id, username',
    })

    // 版本 3 · SIX-DB：users 身份索引 + 回填 role/tenantRootId；admins → users
    this.version(3)
      .stores({
        users: 'id, username, token, parentUserId, role, tenantRootId, digitalId',
        admins: 'id, username',
      })
      .upgrade(async (tx) => {
        const usersTable = tx.table('users')
        const adminsTable = tx.table('admins')

        const allUsers = (await usersTable.toArray()) as User[]
        for (const raw of allUsers) {
          const projected = projectUserIdentityFields(raw)
          await usersTable.put(projected)
        }

        const admins = (await adminsTable.toArray()) as Admin[]
        for (const admin of admins) {
          const existing = allUsers.find((u) => u.username === admin.username)
          if (existing) continue
          const id = admin.id
          const owner: User = projectUserIdentityFields({
            id,
            username: admin.username,
            passwordHash: admin.passwordHash,
            rememberPassword: false,
            isMainAccount: true,
            permissions: [...OWNER_DEFAULT_PERMISSIONS],
            createdAt: admin.createdAt instanceof Date ? admin.createdAt : new Date(admin.createdAt),
            lastLoginAt:
              admin.lastLoginAt instanceof Date
                ? admin.lastLoginAt
                : admin.lastLoginAt
                  ? new Date(admin.lastLoginAt)
                  : new Date(),
            role: 'owner',
            tenantRootId: id,
          })
          await usersTable.put(owner)
        }

        // 兼容债：清空 admins，禁止再作为身份权威
        await adminsTable.clear()
      })
  }
}

/**
 * 数据库单例实例
 */
export const db = new CYPMemoDB()
