/**
 * CYP-memo IndexedDB 数据库定义
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import Dexie, { Table } from 'dexie'
import type { User, Memo, MemoHistory, FileMetadata, ShareLink, LogEntry, Admin } from '../types'

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
      // 用户表：主键 id，索引 username, token, parentUserId
      users: 'id, username, token, parentUserId',

      // 备忘录表：主键 id，索引 userId, tags (多值), createdAt, updatedAt, deletedAt
      memos: 'id, userId, *tags, createdAt, updatedAt, deletedAt',

      // 备忘录历史表：主键 id，索引 memoId, timestamp
      memoHistory: 'id, memoId, timestamp',

      // 文件元数据表：主键 id，索引 userId, memoId, uploadedAt
      files: 'id, userId, memoId, uploadedAt',

      // 文件 Blob 表：主键 id
      fileBlobs: 'id',

      // 日志表：主键 id，索引 level, timestamp
      logs: 'id, level, timestamp',

      // 分享链接表：主键 id，索引 memoId, userId, expiresAt
      shares: 'id, memoId, userId, expiresAt',

      // 设置表：主键 key
      settings: 'key',
    })

    // 版本 2：添加管理员表
    this.version(2).stores({
      // 管理员表：主键 id，索引 username
      admins: 'id, username',
    })
  }
}

/**
 * 数据库单例实例
 */
export const db = new CYPMemoDB()
