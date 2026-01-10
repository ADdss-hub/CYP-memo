/**
 * CYP-memo SQLite 数据库
 * 使用 sql.js（纯 JavaScript 实现，无需编译）
 * 高性能、支持事务、并发安全
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'database.sqlite')

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export class SqliteDatabase {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private initialized = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(dbPath: string = DB_FILE) {
    this.dbPath = dbPath
  }

  /**
   * 初始化数据库（异步）
   */
  async init(): Promise<void> {
    if (this.initialized) return

    const SQL = await initSqlJs()
    
    // 尝试加载现有数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
      console.log('📦 已创建新的 SQLite 数据库')
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

    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_userId ON memos(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_deletedAt ON memos(deletedAt)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_userId ON files(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_shares_userId ON shares(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`)

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

      console.log('========================================')
      console.log('✅ 已创建默认管理员账号：')
      console.log('用户名: admin')
      console.log('密码: admin123')
      console.log('⚠️  请登录后立即修改密码！')
      console.log('========================================')
    }
  }

  // ========== 管理员操作 ==========

  getAdmins(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM admins')
    return this.rowsToObjects(result)
  }

  getAdminById(id: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM admins WHERE id = ?', [id])
    const rows = this.rowsToObjects(result)
    return rows[0]
  }

  getAdminByUsername(username: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM admins WHERE username = ?', [username])
    const rows = this.rowsToObjects(result)
    return rows[0]
  }

  updateAdmin(id: string, updates: any): void {
    if (!this.db) return
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = [...Object.values(updates), id]
    this.db.run(`UPDATE admins SET ${fields} WHERE id = ?`, values)
    this.saveToFile()
  }

  // ========== 用户操作 ==========

  getUsers(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users')
    return this.rowsToObjects(result).map(this.parseUser)
  }

  getUserById(id: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE id = ?', [id])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  getUserByUsername(username: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE username = ?', [username])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  getUserByToken(token: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE token = ?', [token])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  private parseUser(user: any): any {
    if (!user) return user
    return {
      ...user,
      permissions: JSON.parse(user.permissions || '[]'),
      securityQuestion: user.securityQuestion ? JSON.parse(user.securityQuestion) : null,
      rememberPassword: Boolean(user.rememberPassword),
      isMainAccount: Boolean(user.isMainAccount)
    }
  }

  createUser(user: any): string {
    if (!this.db) return ''
    this.db.run(
      `INSERT INTO users (
        id, username, passwordHash, token, securityQuestion, gender, email,
        birthDate, phone, address, position, company, bio, rememberPassword,
        isMainAccount, parentUserId, permissions, createdAt, lastLoginAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.passwordHash,
        user.token,
        user.securityQuestion ? JSON.stringify(user.securityQuestion) : null,
        user.gender,
        user.email,
        user.birthDate,
        user.phone,
        user.address,
        user.position,
        user.company,
        user.bio,
        user.rememberPassword ? 1 : 0,
        user.isMainAccount ? 1 : 0,
        user.parentUserId,
        JSON.stringify(user.permissions || []),
        user.createdAt,
        user.lastLoginAt
      ]
    )
    this.saveToFile()
    return user.id
  }

  updateUser(id: string, updates: any): void {
    if (!this.db) return
    const fields: string[] = []
    const values: any[] = []

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

  getSubAccounts(parentUserId: string): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users WHERE parentUserId = ?', [parentUserId])
    return this.rowsToObjects(result).map(this.parseUser)
  }

  // ========== 备忘录操作 ==========

  getMemos(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM memos')
    return this.rowsToObjects(result).map(this.parseMemo)
  }

  getMemoById(id: string): any {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM memos WHERE id = ?', [id])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseMemo(rows[0]) : undefined
  }

  getMemosByUserId(userId: string): any[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM memos WHERE userId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
      [userId]
    )
    return this.rowsToObjects(result).map(this.parseMemo)
  }

  private parseMemo(memo: any): any {
    if (!memo) return memo
    return {
      ...memo,
      tags: JSON.parse(memo.tags || '[]'),
      attachments: JSON.parse(memo.attachments || '[]')
    }
  }

  createMemo(memo: any): string {
    if (!this.db) return ''
    this.db.run(
      `INSERT INTO memos (id, userId, title, content, tags, priority, attachments, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memo.id,
        memo.userId,
        memo.title ?? null,
        memo.content,
        JSON.stringify(memo.tags || []),
        memo.priority ?? null,
        JSON.stringify(memo.attachments || []),
        memo.createdAt,
        memo.updatedAt
      ]
    )
    this.saveToFile()
    return memo.id
  }

  updateMemo(id: string, updates: any): void {
    if (!this.db) return
    const fields: string[] = []
    const values: any[] = []

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

  getFiles(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files')
    return this.rowsToObjects(result)
  }

  getFilesByUserId(userId: string): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files WHERE userId = ?', [userId])
    return this.rowsToObjects(result)
  }

  createFile(file: any): string {
    if (!this.db) return ''
    this.db.run(
      `INSERT INTO files (id, userId, memoId, filename, mimeType, size, path, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [file.id, file.userId, file.memoId ?? null, file.filename, file.mimeType, file.size, file.path, file.createdAt]
    )
    this.saveToFile()
    return file.id
  }

  deleteFile(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM files WHERE id = ?', [id])
    this.saveToFile()
  }

  // ========== 分享操作 ==========

  getShares(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM shares')
    return this.rowsToObjects(result)
  }

  getSharesByUserId(userId: string): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM shares WHERE userId = ?', [userId])
    return this.rowsToObjects(result)
  }

  createShare(share: any): string {
    if (!this.db) return ''
    this.db.run(
      `INSERT INTO shares (id, userId, memoId, shareCode, expiresAt, viewCount, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [share.id, share.userId, share.memoId, share.shareCode, share.expiresAt ?? null, share.viewCount || 0, share.createdAt]
    )
    this.saveToFile()
    return share.id
  }

  deleteShare(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM shares WHERE id = ?', [id])
    this.saveToFile()
  }

  // ========== 日志操作 ==========

  getLogs(): any[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM logs ORDER BY createdAt DESC LIMIT 1000')
    return this.rowsToObjects(result)
  }

  /**
   * 按级别获取日志
   */
  getLogsByLevel(level: string): any[] {
    if (!this.db) return []
    const result = this.db.exec(
      'SELECT * FROM logs WHERE level = ? ORDER BY createdAt DESC LIMIT 1000',
      [level]
    )
    return this.rowsToObjects(result)
  }

  createLog(log: any): string {
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
  deleteUserWithData(userId: string): { memos: number; files: number; shares: number; subAccounts: number } {
    if (!this.db) return { memos: 0, files: 0, shares: 0, subAccounts: 0 }
    
    // 先获取该用户的所有子账号
    const subAccountsResult = this.db.exec('SELECT id FROM users WHERE parentUserId = ?', [userId])
    const subAccountIds: string[] = subAccountsResult[0]?.values?.map(row => row[0] as string) || []
    
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

  getStatistics(): { userCount: number; memoCount: number; fileCount: number; shareCount: number; logCount: number } {
    if (!this.db) return { userCount: 0, memoCount: 0, fileCount: 0, shareCount: 0, logCount: 0 }

    const userCount = (this.db.exec('SELECT COUNT(*) FROM users')[0]?.values[0]?.[0] as number) || 0
    const memoCount = (this.db.exec('SELECT COUNT(*) FROM memos WHERE deletedAt IS NULL')[0]?.values[0]?.[0] as number) || 0
    const fileCount = (this.db.exec('SELECT COUNT(*) FROM files')[0]?.values[0]?.[0] as number) || 0
    const shareCount = (this.db.exec('SELECT COUNT(*) FROM shares')[0]?.values[0]?.[0] as number) || 0
    const logCount = (this.db.exec('SELECT COUNT(*) FROM logs')[0]?.values[0]?.[0] as number) || 0

    return { userCount, memoCount, fileCount, shareCount, logCount }
  }

  // ========== 导出所有数据 ==========

  exportAll(): any {
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

  private rowsToObjects(result: any[]): any[] {
    if (!result || result.length === 0) return []
    const { columns, values } = result[0]
    return values.map((row: any[]) => {
      const obj: any = {}
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
