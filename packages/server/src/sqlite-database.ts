/**
 * CYP-memo SQLite 数据库
 * 使用 sql.js（纯 JavaScript 实现，无需编译）
 * 高性能、支持事务、并发安全
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import type {
  Admin,
  User,
  CreateUserParams,
  Memo,
  CreateMemoParams,
  FileRecord,
  CreateFileParams,
  Share,
  CreateShareParams,
  LogEntry,
  CreateLogParams,
  DatabaseStatistics,
  DeleteUserResult,
  ExportData
} from './types.js'

/**
 * 获取数据目录和数据库文件路径
 * 使用配置模块中的数据目录，确保跨平台和跨环境兼容
 */
function getDataPaths(): { dataDir: string; dbFile: string } {
  // 优先使用环境变量，否则使用配置模块的默认值
  let dataDir: string
  
  if (process.env.DATA_DIR) {
    dataDir = process.env.DATA_DIR
  } else {
    try {
      // 尝试从配置模块获取数据目录
      const config = getConfig()
      dataDir = config.dataDir
    } catch {
      // 配置模块未初始化时的回退方案
      // 这种情况通常不会发生，因为数据库初始化在配置加载之后
      dataDir = process.env.NODE_ENV === 'production' 
        ? '/app/data' 
        : path.join(process.cwd(), 'packages', 'server', 'data')
    }
  }
  
  return {
    dataDir,
    dbFile: path.join(dataDir, 'database.sqlite')
  }
}

// 延迟初始化数据路径（在首次使用时初始化）
let _dataPaths: { dataDir: string; dbFile: string } | null = null

function ensureDataPaths(): { dataDir: string; dbFile: string } {
  if (!_dataPaths) {
    _dataPaths = getDataPaths()
    
    // 确保数据目录存在
    if (!fs.existsSync(_dataPaths.dataDir)) {
      fs.mkdirSync(_dataPaths.dataDir, { recursive: true })
    }
  }
  return _dataPaths
}

export class SqliteDatabase {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private initialized = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(dbPath?: string) {
    // 延迟获取默认路径，确保配置已加载
    this.dbPath = dbPath || ''
  }

  /**
   * 初始化数据库（异步）
   */
  async init(): Promise<void> {
    if (this.initialized) return

    // 如果没有指定路径，使用默认路径
    if (!this.dbPath) {
      const paths = ensureDataPaths()
      this.dbPath = paths.dbFile
    }

    const SQL = await initSqlJs()
    
    // 尝试加载现有数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
      logger.debug('已加载现有 SQLite 数据库', { path: this.dbPath })
    } else {
      this.db = new SQL.Database()
      logger.info('已创建新的 SQLite 数据库', { path: this.dbPath })
    }

    this.initTables()
    this.initDefaultAdmin()
    this.initialized = true
  }

  /**
   * 保存数据库到文件
   */
  private saveToFile(): void {
    if (!this.db) return
    
    // 防抖：延迟保存，避免频繁写入
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    
    this.saveTimer = setTimeout(() => {
      if (this.db) {
        const data = this.db.export()
        const buffer = Buffer.from(data)
        fs.writeFileSync(this.dbPath, buffer)
      }
    }, 100) // 100ms 防抖
  }

  /**
   * 立即保存（用于关闭时）
   */
  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.db) {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
    }
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    if (!this.db) return

    this.db.run(`
      -- 管理员表
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        createdAt TEXT NOT NULL,
        lastLoginAt TEXT
      )
    `)

    this.db.run(`
      -- 用户表
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT,
        token TEXT UNIQUE,
        securityQuestion TEXT,
        gender TEXT,
        email TEXT,
        birthDate TEXT,
        phone TEXT,
        address TEXT,
        position TEXT,
        company TEXT,
        bio TEXT,
        rememberPassword INTEGER DEFAULT 0,
        isMainAccount INTEGER DEFAULT 0,
        parentUserId TEXT,
        permissions TEXT DEFAULT '[]',
        createdAt TEXT NOT NULL,
        lastLoginAt TEXT
      )
    `)

    this.db.run(`
      -- 备忘录表
      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        title TEXT,
        content TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        priority TEXT,
        attachments TEXT DEFAULT '[]',
        deletedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    this.db.run(`
      -- 文件表
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        memoId TEXT,
        filename TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `)

    this.db.run(`
      -- 分享链接表
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        memoId TEXT NOT NULL,
        shareCode TEXT UNIQUE NOT NULL,
        expiresAt TEXT,
        viewCount INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `)

    this.db.run(`
      -- 日志表
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        userId TEXT,
        action TEXT,
        details TEXT,
        createdAt TEXT NOT NULL
      )
    `)

    this.db.run(`
      -- 设置表
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    this.db.run(`
      -- 备忘录历史表
      CREATE TABLE IF NOT EXISTS memo_history (
        id TEXT PRIMARY KEY,
        memoId TEXT NOT NULL,
        title TEXT,
        content TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        priority TEXT,
        createdAt TEXT NOT NULL
      )
    `)

    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_userId ON memos(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_deletedAt ON memos(deletedAt)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_userId ON files(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_shares_userId ON shares(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memo_history_memoId ON memo_history(memoId)`)

    this.saveToFile()
  }

  /**
   * 初始化默认管理员
   */
  private initDefaultAdmin(): void {
    if (!this.db) return

    const result = this.db.exec('SELECT COUNT(*) as count FROM admins')
    const count = result[0]?.values[0]?.[0] as number || 0

    if (count === 0) {
      const passwordHash = bcrypt.hashSync('admin123', 10)
      const admin = {
        id: uuidv4(),
        username: 'admin',
        passwordHash,
        role: 'super_admin',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      }

      this.db.run(
        `INSERT INTO admins (id, username, passwordHash, role, createdAt, lastLoginAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [admin.id, admin.username, admin.passwordHash, admin.role, admin.createdAt, admin.lastLoginAt]
      )

      this.saveToFile()

      logger.info('已创建默认管理员账号', { username: 'admin', role: 'super_admin' })
      logger.sensitive('默认管理员密码: admin123 - 请立即修改！')
    }
  }

  // ========== 管理员操作 ==========

  getAdmins(): Admin[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM admins')
    return this.rowsToObjects(result) as unknown as Admin[]
  }

  getAdminById(id: string): Admin | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM admins WHERE id = ?', [id])
    const rows = this.rowsToObjects(result) as unknown as Admin[]
    return rows[0]
  }

  getAdminByUsername(username: string): Admin | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM admins WHERE username = ?', [username])
    const rows = this.rowsToObjects(result) as unknown as Admin[]
    return rows[0]
  }

  updateAdmin(id: string, updates: Partial<Admin>): void {
    if (!this.db) return
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = [...Object.values(updates), id]
    this.db.run(`UPDATE admins SET ${fields} WHERE id = ?`, values)
    this.saveToFile()
  }

  // ========== 用户操作 ==========

  getUsers(): User[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users')
    return this.rowsToObjects(result).map(row => this.parseUser(row))
  }

  getUserById(id: string): User | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE id = ?', [id])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  getUserByUsername(username: string): User | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE username = ?', [username])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  getUserByToken(token: string): User | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE token = ?', [token])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  private parseUser(user: Record<string, unknown>): User {
    return {
      id: user.id as string,
      username: user.username as string,
      passwordHash: user.passwordHash as string | null,
      token: user.token as string | null,
      securityQuestion: user.securityQuestion ? JSON.parse(user.securityQuestion as string) : null,
      gender: user.gender as string | null,
      email: user.email as string | null,
      birthDate: user.birthDate as string | null,
      phone: user.phone as string | null,
      address: user.address as string | null,
      position: user.position as string | null,
      company: user.company as string | null,
      bio: user.bio as string | null,
      rememberPassword: Boolean(user.rememberPassword),
      isMainAccount: Boolean(user.isMainAccount),
      parentUserId: user.parentUserId as string | null,
      permissions: JSON.parse((user.permissions as string) || '[]'),
      createdAt: user.createdAt as string,
      lastLoginAt: user.lastLoginAt as string | null
    }
  }

  createUser(user: CreateUserParams): string {
    if (!this.db) return ''
    const id = user.id || uuidv4()
    this.db.run(
      `INSERT INTO users (
        id, username, passwordHash, token, securityQuestion, gender, email,
        birthDate, phone, address, position, company, bio, rememberPassword,
        isMainAccount, parentUserId, permissions, createdAt, lastLoginAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.username,
        user.passwordHash ?? null,
        user.token ?? null,
        user.securityQuestion ? JSON.stringify(user.securityQuestion) : null,
        user.gender ?? null,
        user.email ?? null,
        user.birthDate ?? null,
        user.phone ?? null,
        user.address ?? null,
        user.position ?? null,
        user.company ?? null,
        user.bio ?? null,
        user.rememberPassword ? 1 : 0,
        user.isMainAccount ? 1 : 0,
        user.parentUserId ?? null,
        JSON.stringify(user.permissions || []),
        user.createdAt || new Date().toISOString(),
        user.lastLoginAt ?? null
      ]
    )
    this.saveToFile()
    return id
  }

  updateUser(id: string, updates: Partial<User>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'permissions') {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else if (key === 'securityQuestion') {
        fields.push(`${key} = ?`)
        values.push(value ? JSON.stringify(value) : null)
      } else if (key === 'rememberPassword' || key === 'isMainAccount') {
        fields.push(`${key} = ?`)
        values.push(value ? 1 : 0)
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
      this.saveToFile()
    }
  }

  deleteUser(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM users WHERE id = ?', [id])
    this.saveToFile()
  }

  usernameExists(username: string): boolean {
    if (!this.db) return false
    const result = this.db.exec('SELECT COUNT(*) as count FROM users WHERE username = ?', [username])
    const count = result[0]?.values[0]?.[0] as number || 0
    return count > 0
  }

  tokenExists(token: string): boolean {
    if (!this.db) return false
    const result = this.db.exec('SELECT COUNT(*) as count FROM users WHERE token = ?', [token])
    const count = result[0]?.values[0]?.[0] as number || 0
    return count > 0
  }

  getSubAccounts(parentUserId: string): User[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users WHERE parentUserId = ?', [parentUserId])
    return this.rowsToObjects(result).map(row => this.parseUser(row))
  }

  // ========== 备忘录操作 ==========

  getMemos(): Memo[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM memos')
    return this.rowsToObjects(result).map(row => this.parseMemo(row))
  }

  getMemoById(id: string): Memo | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM memos WHERE id = ?', [id])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseMemo(rows[0]) : undefined
  }

  getMemosByUserId(userId: string): Memo[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM memos WHERE userId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
      [userId]
    )
    return this.rowsToObjects(result).map(row => this.parseMemo(row))
  }

  private parseMemo(memo: Record<string, unknown>): Memo {
    return {
      id: memo.id as string,
      userId: memo.userId as string,
      title: memo.title as string | null,
      content: (memo.content as string) || '',
      tags: JSON.parse((memo.tags as string) || '[]'),
      priority: memo.priority as string | null,
      attachments: JSON.parse((memo.attachments as string) || '[]'),
      deletedAt: memo.deletedAt as string | null,
      createdAt: memo.createdAt as string,
      updatedAt: memo.updatedAt as string
    }
  }

  createMemo(memo: CreateMemoParams): string {
    if (!this.db) return ''
    const id = memo.id || uuidv4()
    this.db.run(
      `INSERT INTO memos (id, userId, title, content, tags, priority, attachments, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        memo.userId,
        memo.title ?? null,
        memo.content || '',
        JSON.stringify(memo.tags || []),
        memo.priority ?? null,
        JSON.stringify(memo.attachments || []),
        memo.createdAt || new Date().toISOString(),
        memo.updatedAt || new Date().toISOString()
      ]
    )
    this.saveToFile()
    return id
  }

  updateMemo(id: string, updates: Partial<Memo>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'tags' || key === 'attachments') {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`, values)
      this.saveToFile()
    }
  }

  deleteMemo(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM memos WHERE id = ?', [id])
    this.saveToFile()
  }

  // ========== 文件操作 ==========

  getFiles(): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files')
    return this.rowsToObjects(result) as unknown as FileRecord[]
  }

  getFilesByUserId(userId: string): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files WHERE userId = ?', [userId])
    return this.rowsToObjects(result) as unknown as FileRecord[]
  }

  createFile(file: CreateFileParams): string {
    if (!this.db) return ''
    const id = file.id || uuidv4()
    this.db.run(
      `INSERT INTO files (id, userId, memoId, filename, mimeType, size, path, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, file.userId, file.memoId ?? null, file.filename, file.mimeType, file.size, file.path, file.createdAt || new Date().toISOString()]
    )
    this.saveToFile()
    return id
  }

  deleteFile(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM files WHERE id = ?', [id])
    this.saveToFile()
  }

  // ========== 备忘录历史操作 ==========

  /**
   * 创建备忘录历史记录
   */
  createMemoHistory(history: { id?: string; memoId: string; title: string; content: string; tags: string[]; priority: string | null; createdAt?: string }): string {
    if (!this.db) return ''
    const id = history.id || uuidv4()
    this.db.run(
      `INSERT INTO memo_history (id, memoId, title, content, tags, priority, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        history.memoId,
        history.title,
        history.content,
        JSON.stringify(history.tags || []),
        history.priority ?? null,
        history.createdAt || new Date().toISOString()
      ]
    )
    this.saveToFile()
    return id
  }

  /**
   * 获取备忘录的历史记录
   */
  getMemoHistory(memoId: string): Array<{ id: string; memoId: string; title: string; content: string; tags: string[]; priority: string | null; createdAt: string }> {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM memo_history WHERE memoId = ? ORDER BY createdAt DESC',
      [memoId]
    )
    return this.rowsToObjects(result).map(row => ({
      id: row.id as string,
      memoId: row.memoId as string,
      title: row.title as string,
      content: row.content as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      priority: row.priority as string | null,
      createdAt: row.createdAt as string
    }))
  }

  /**
   * 删除备忘录的历史记录
   */
  deleteMemoHistory(memoId: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM memo_history WHERE memoId = ?', [memoId])
    this.saveToFile()
  }

  // ========== 分享操作 ==========

  getShares(): Share[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM shares')
    return this.rowsToObjects(result) as unknown as Share[]
  }

  getSharesByUserId(userId: string): Share[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM shares WHERE userId = ?', [userId])
    return this.rowsToObjects(result) as unknown as Share[]
  }

  createShare(share: CreateShareParams): string {
    if (!this.db) return ''
    const id = share.id || uuidv4()
    this.db.run(
      `INSERT INTO shares (id, userId, memoId, shareCode, expiresAt, viewCount, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, share.userId, share.memoId, share.shareCode || uuidv4().replace(/-/g, '').substring(0, 8), share.expiresAt ?? null, share.viewCount || 0, share.createdAt || new Date().toISOString()]
    )
    this.saveToFile()
    return id
  }

  deleteShare(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM shares WHERE id = ?', [id])
    this.saveToFile()
  }

  /**
   * 更新分享链接
   */
  updateShare(id: string, updates: Partial<Share>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      values.push(value)
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE shares SET ${fields.join(', ')} WHERE id = ?`, values)
      this.saveToFile()
    }
  }

  /**
   * 根据ID获取分享链接
   */
  getShareById(id: string): Share | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM shares WHERE id = ?', [id])
    const rows = this.rowsToObjects(result) as unknown as Share[]
    return rows[0]
  }

  /**
   * 根据分享码获取分享链接
   */
  getShareByCode(shareCode: string): Share | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM shares WHERE shareCode = ?', [shareCode])
    const rows = this.rowsToObjects(result) as unknown as Share[]
    return rows[0]
  }

  // ========== 日志操作 ==========

  getLogs(): LogEntry[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM logs ORDER BY createdAt DESC LIMIT 1000')
    return this.rowsToObjects(result) as unknown as LogEntry[]
  }

  /**
   * 按级别获取日志
   */
  getLogsByLevel(level: string): LogEntry[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM logs WHERE level = ? ORDER BY createdAt DESC LIMIT 1000',
      [level]
    )
    return this.rowsToObjects(result) as unknown as LogEntry[]
  }

  createLog(log: CreateLogParams): string {
    if (!this.db) return ''
    const id = log.id || uuidv4()
    this.db.run(
      `INSERT INTO logs (id, level, message, userId, action, details, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 
        log.level, 
        log.message, 
        log.userId ?? null, 
        log.action ?? null, 
        log.details ?? null, 
        log.createdAt || new Date().toISOString()
      ]
    )
    this.saveToFile()
    return id
  }

  clearLogs(): void {
    if (!this.db) return
    this.db.run('DELETE FROM logs')
    this.saveToFile()
  }

  /**
   * 删除指定日期之前的日志
   */
  deleteOldLogs(beforeDate: string): number {
    if (!this.db) return 0
    const countResult = this.db.exec(
      'SELECT COUNT(*) FROM logs WHERE createdAt < ?',
      [beforeDate]
    )
    const count = (countResult[0]?.values[0]?.[0] as number) || 0
    
    if (count > 0) {
      this.db.run('DELETE FROM logs WHERE createdAt < ?', [beforeDate])
      this.saveToFile()
    }
    return count
  }

  // ========== 清理操作 ==========

  /**
   * 清理已删除的备忘录（超过指定天数）
   */
  cleanDeletedMemos(days: number): number {
    if (!this.db) return 0
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffStr = cutoffDate.toISOString()
    
    const countResult = this.db.exec(
      'SELECT COUNT(*) FROM memos WHERE deletedAt IS NOT NULL AND deletedAt < ?',
      [cutoffStr]
    )
    const count = (countResult[0]?.values[0]?.[0] as number) || 0
    
    if (count > 0) {
      this.db.run('DELETE FROM memos WHERE deletedAt IS NOT NULL AND deletedAt < ?', [cutoffStr])
      this.saveToFile()
    }
    return count
  }

  /**
   * 清理孤立文件（没有关联备忘录的文件）
   */
  cleanOrphanedFiles(): number {
    if (!this.db) return 0
    
    // 找出所有没有关联备忘录的文件
    const countResult = this.db.exec(`
      SELECT COUNT(*) FROM files 
      WHERE memoId IS NOT NULL 
      AND memoId NOT IN (SELECT id FROM memos)
    `)
    const count = (countResult[0]?.values[0]?.[0] as number) || 0
    
    if (count > 0) {
      this.db.run(`
        DELETE FROM files 
        WHERE memoId IS NOT NULL 
        AND memoId NOT IN (SELECT id FROM memos)
      `)
      this.saveToFile()
    }
    return count
  }

  /**
   * 清理过期的分享链接
   */
  cleanExpiredShares(): number {
    if (!this.db) return 0
    const now = new Date().toISOString()
    
    const countResult = this.db.exec(
      'SELECT COUNT(*) FROM shares WHERE expiresAt IS NOT NULL AND expiresAt < ?',
      [now]
    )
    const count = (countResult[0]?.values[0]?.[0] as number) || 0
    
    if (count > 0) {
      this.db.run('DELETE FROM shares WHERE expiresAt IS NOT NULL AND expiresAt < ?', [now])
      this.saveToFile()
    }
    return count
  }

  /**
   * 删除用户的所有相关数据（包括子账号及其数据）
   */
  deleteUserWithData(userId: string): DeleteUserResult {
    if (!this.db) return { memos: 0, files: 0, shares: 0, subAccounts: 0 }
    
    // 先获取该用户的所有子账号
    const subAccountsResult = this.db.exec('SELECT id FROM users WHERE parentUserId = ?', [userId])
    const subAccountIds: string[] = subAccountsResult[0]?.values?.map((row: unknown[]) => row[0] as string) || []
    
    let totalMemos = 0
    let totalFiles = 0
    let totalShares = 0
    
    // 删除所有子账号及其数据
    for (const subAccountId of subAccountIds) {
      const subMemosResult = this.db.exec('SELECT COUNT(*) FROM memos WHERE userId = ?', [subAccountId])
      const subFilesResult = this.db.exec('SELECT COUNT(*) FROM files WHERE userId = ?', [subAccountId])
      const subSharesResult = this.db.exec('SELECT COUNT(*) FROM shares WHERE userId = ?', [subAccountId])
      
      totalMemos += (subMemosResult[0]?.values[0]?.[0] as number) || 0
      totalFiles += (subFilesResult[0]?.values[0]?.[0] as number) || 0
      totalShares += (subSharesResult[0]?.values[0]?.[0] as number) || 0
      
      this.db.run('DELETE FROM memos WHERE userId = ?', [subAccountId])
      this.db.run('DELETE FROM files WHERE userId = ?', [subAccountId])
      this.db.run('DELETE FROM shares WHERE userId = ?', [subAccountId])
      this.db.run('DELETE FROM users WHERE id = ?', [subAccountId])
    }
    
    // 统计主账号要删除的数据
    const memosResult = this.db.exec('SELECT COUNT(*) FROM memos WHERE userId = ?', [userId])
    const filesResult = this.db.exec('SELECT COUNT(*) FROM files WHERE userId = ?', [userId])
    const sharesResult = this.db.exec('SELECT COUNT(*) FROM shares WHERE userId = ?', [userId])
    
    totalMemos += (memosResult[0]?.values[0]?.[0] as number) || 0
    totalFiles += (filesResult[0]?.values[0]?.[0] as number) || 0
    totalShares += (sharesResult[0]?.values[0]?.[0] as number) || 0
    
    // 删除主账号数据
    this.db.run('DELETE FROM memos WHERE userId = ?', [userId])
    this.db.run('DELETE FROM files WHERE userId = ?', [userId])
    this.db.run('DELETE FROM shares WHERE userId = ?', [userId])
    this.db.run('DELETE FROM users WHERE id = ?', [userId])
    
    this.saveToFile()
    return { memos: totalMemos, files: totalFiles, shares: totalShares, subAccounts: subAccountIds.length }
  }

  // ========== 统计 ==========

  getStatistics(): DatabaseStatistics {
    if (!this.db) return { userCount: 0, memoCount: 0, fileCount: 0, shareCount: 0, logCount: 0 }

    const userCount = (this.db.exec('SELECT COUNT(*) FROM users')[0]?.values[0]?.[0] as number) || 0
    const memoCount = (this.db.exec('SELECT COUNT(*) FROM memos WHERE deletedAt IS NULL')[0]?.values[0]?.[0] as number) || 0
    const fileCount = (this.db.exec('SELECT COUNT(*) FROM files')[0]?.values[0]?.[0] as number) || 0
    const shareCount = (this.db.exec('SELECT COUNT(*) FROM shares')[0]?.values[0]?.[0] as number) || 0
    const logCount = (this.db.exec('SELECT COUNT(*) FROM logs')[0]?.values[0]?.[0] as number) || 0

    return { userCount, memoCount, fileCount, shareCount, logCount }
  }

  // ========== 健康检查 ==========

  /**
   * 检查数据库连接状态
   * Requirements: 4.1, 4.5
   */
  isHealthy(): boolean {
    if (!this.db || !this.initialized) return false
    try {
      // 执行简单查询验证数据库可用
      this.db.exec('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  // ========== 导出所有数据 ==========

  exportAll(): ExportData {
    return {
      users: this.getUsers(),
      memos: this.getMemos(),
      files: this.getFiles(),
      shares: this.getShares(),
      logs: this.getLogs(),
      settings: {}
    }
  }

  // ========== 清空所有数据 ==========

  clearAllData(): void {
    if (!this.db) return
    this.db.run('DELETE FROM users')
    this.db.run('DELETE FROM memos')
    this.db.run('DELETE FROM files')
    this.db.run('DELETE FROM shares')
    this.db.run('DELETE FROM logs')
    this.db.run('DELETE FROM settings')
    // 注意：不清空 admins，保留管理员账号
    this.saveToFile()
  }

  // ========== 关闭数据库 ==========

  close(): void {
    this.saveNow()
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ========== 辅助方法 ==========

  private rowsToObjects(result: { columns: string[]; values: unknown[][] }[]): Record<string, unknown>[] {
    if (!result || result.length === 0) return []
    const { columns, values } = result[0]
    return values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i]
      })
      return obj
    })
  }
}

// 创建单例实例
const database = new SqliteDatabase()

// 导出初始化函数和数据库实例
export { database }
export async function initDatabase(): Promise<SqliteDatabase> {
  await database.init()
  return database
}
