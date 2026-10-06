/**
 * CYP-memo SQLite 数据库
 * 使用 sql.js（纯 JavaScript 实现，无需编译）
 * 高性能、支持事务、并发安全
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import crypto from 'crypto'
import { logger } from '../log/ready.js'
import { getConfig } from '../cfg/ready.js'
import { log as log, redactSensitive } from '../log/ready.js'
import { getRequestTraceId } from '../../../l1/mgmt/trace/ready.js'
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
  ShareComment,
  CreateShareCommentParams,
  LogEntry,
  CreateLogParams,
  DatabaseStatistics,
  DeleteUserResult,
  ExportData,
  UserRole,
  McpPatRecord,
} from '../../../../types.js'
import { OWNER_DEFAULT_PERMISSIONS, MEMBER_DEFAULT_PERMISSIONS, normalizeMemberPermissions, liftLegacyPermissions } from '../../../../types.js'

/**
 * 获取数据目录和数据库文件路径
 * 使用配置模块中的数据目录，确保跨平台和跨环境兼容
 */
function getDataPaths(): { dataDir: string; dbFile: string } {
  // 唯一根：已注入的 config.dataDir。禁止再按 DATA_DIR / cwd 另解析一套路径（R-010）
  const dataDir = getConfig().dataDir
  return {
    dataDir,
    dbFile: path.join(dataDir, 'database.sqlite'),
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
  private saveInFlight = false
  private saveDirtyAgain = false

  constructor(dbPath?: string) {
    // 延迟获取默认路径，确保配置已加载
    this.dbPath = dbPath || ''
  }

  /**
   * 初始化数据库（异步）
   * @param options.skipSeed 为 true 时跳过种子（由 bootstrap Phase2 唯一种子路径负责）
   */
  async init(options?: { skipSeed?: boolean }): Promise<void> {
    if (this.initialized) return

    // 如果没有指定路径，使用默认路径
    if (!this.dbPath) {
      const paths = ensureDataPaths()
      this.dbPath = paths.dbFile
    }

    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        const require = createRequire(import.meta.url)
        return require.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`)
      },
    })
    
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
    // INIT-SYS-07：server 侧仅保留一条种子路径；默认仍可由 init 触发以兼容旧调用，
    // bootstrap 权威路径传 skipSeed=true，改由 ensureSystemOwnerSeed() 登记执行。
    if (!options?.skipSeed) {
      this.ensureSystemOwnerSeed()
    }
    this.initialized = true
  }

  /**
   * 保存数据库到文件
   *
   * sql.js `export()` 会同步序列化整库并关闭/重开（业界共识：禁止每写必导）。
   * 防抖合并写放大；落盘进行中若再脏则排队一次，避免 N 次写 → N 次整库 export。
   * 可用 CYP_DB_SAVE_DEBOUNCE_MS 覆盖（默认 500ms，下限 100）。
   */
  private saveDebounceMs(): number {
    const n = Number(process.env.CYP_DB_SAVE_DEBOUNCE_MS)
    return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 500
  }

  private saveToFile(): void {
    if (!this.db) return
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flushToDisk()
    }, this.saveDebounceMs())
  }

  private flushToDisk(): void {
    if (!this.db) return
    if (this.saveInFlight) {
      this.saveDirtyAgain = true
      return
    }
    this.saveInFlight = true
    this.saveDirtyAgain = false
    try {
      const t0 = Date.now()
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
      const el = Date.now() - t0
      if (process.env.CYP_MC_DEBUG && el > 80) console.error(`[FLUSH main] ${el}ms`)
    } finally {
      this.saveInFlight = false
      if (this.saveDirtyAgain) {
        this.saveDirtyAgain = false
        this.saveToFile()
      }
    }
  }

  /**
   * 立即保存（用于关闭时）
   */
  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.saveDirtyAgain = false
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

    // API-10：不再新建 admins；旧库若有表则先迁移再 DROP（见 migrateIdentityData）

    this.db.run(`
      -- 用户表（权威身份：role + tenantRootId）
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        digitalId TEXT UNIQUE,
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
        role TEXT NOT NULL DEFAULT 'member',
        tenantRootId TEXT,
        createdAt TEXT NOT NULL,
        lastLoginAt TEXT
      )
    `)
    this.ensureUsersIdentityColumns()
    this.migrateIdentityData()
    this.ensureDigitalIds()

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
        passwordHash TEXT,
        expiresAt TEXT,
        viewCount INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `)
    this.ensureSharesPasswordColumn()

    this.db.run(`
      -- 公开分享评论（访客反馈）
      CREATE TABLE IF NOT EXISTS share_comments (
        id TEXT PRIMARY KEY,
        shareId TEXT NOT NULL,
        authorName TEXT NOT NULL,
        content TEXT NOT NULL,
        feedback TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        replyContent TEXT,
        replyAt TEXT,
        replyBy TEXT
      )
    `)
    this.db.run(
      'CREATE INDEX IF NOT EXISTS idx_share_comments_shareId ON share_comments(shareId, createdAt DESC)'
    )
    this.ensureShareCommentsReplyColumns()
    this.ensureMcpPublicColumns()
    this.ensureMcpPatsTable()
    this.ensureMcpOauthClientsTable()

    this.db.run(`
      -- 日志表
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        userId TEXT,
        action TEXT,
        details TEXT,
        traceId TEXT,
        createdAt TEXT NOT NULL
      )
    `)
    this.ensureLogsTraceIdColumn()

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
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_tenantRootId ON users(tenantRootId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_userId ON memos(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memos_deletedAt ON memos(deletedAt)`)
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_memos_userId_deletedAt ON memos(userId, deletedAt)`
    )
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_memos_userId_deletedAt_updatedAt ON memos(userId, deletedAt, updatedAt)`
    )
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_parentUserId ON users(parentUserId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_userId ON files(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_files_memoId ON files(memoId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_shares_userId ON shares(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_shares_memoId ON shares(memoId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_traceId ON logs(traceId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_createdAt ON logs(createdAt)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_userId ON logs(userId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_memo_history_memoId ON memo_history(memoId)`)

    this.saveToFile()
  }

  /** R1：旧库补 users.role / tenantRootId */
  private ensureUsersIdentityColumns(): void {
    if (!this.db) return
    try {
      const info = this.db.exec('PRAGMA table_info(users)')
      const cols = new Set<string>()
      for (const row of info[0]?.values || []) {
        if (typeof row[1] === 'string') cols.add(row[1])
      }
      if (!cols.has('role')) {
        this.db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`)
      }
      if (!cols.has('tenantRootId')) {
        this.db.run(`ALTER TABLE users ADD COLUMN tenantRootId TEXT`)
      }
      if (!cols.has('digitalId')) {
        this.db.run(`ALTER TABLE users ADD COLUMN digitalId TEXT`)
      }
      this.db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_digitalId ON users(digitalId)`)
    } catch (err) {
      logger.warn('ensureUsersIdentityColumns failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** R6 CLN-02：为缺 digitalId 的用户补齐 6 位数字身份 */
  private ensureDigitalIds(): void {
    if (!this.db) return
    try {
      for (const u of this.getUsers()) {
        if (!u.digitalId || !/^\d{6}$/.test(u.digitalId)) {
          const did = this.allocateDigitalId()
          this.db.run('UPDATE users SET digitalId = ? WHERE id = ?', [did, u.id])
        }
      }
      this.saveToFile()
    } catch (err) {
      logger.warn('ensureDigitalIds failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  getUserByDigitalId(digitalId: string): User | undefined {
    if (!this.db || !digitalId) return undefined
    const result = this.db.exec('SELECT * FROM users WHERE digitalId = ?', [digitalId])
    const rows = this.rowsToObjects(result)
    return rows[0] ? this.parseUser(rows[0]) : undefined
  }

  private allocateDigitalId(preferred?: string | null): string {
    if (preferred && /^\d{6}$/.test(preferred) && !this.getUserByDigitalId(preferred)) {
      return preferred
    }
    for (let i = 0; i < 80; i++) {
      const n = String(100000 + Math.floor(Math.random() * 900000))
      if (!this.getUserByDigitalId(n)) return n
    }
    throw new Error('unable to allocate digitalId')
  }

  /** 旧库补 shares.passwordHash（公开分享密码） */
  private ensureSharesPasswordColumn(): void {
    if (!this.db) return
    try {
      const info = this.db.exec('PRAGMA table_info(shares)')
      const cols = new Set<string>()
      for (const row of info[0]?.values || []) {
        if (typeof row[1] === 'string') cols.add(row[1])
      }
      if (!cols.has('passwordHash')) {
        this.db.run('ALTER TABLE shares ADD COLUMN passwordHash TEXT')
      }
    } catch (err) {
      logger.warn('ensureSharesPasswordColumn failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** 旧库补 share_comments 主人回复列 */
  private ensureShareCommentsReplyColumns(): void {
    if (!this.db) return
    try {
      const info = this.db.exec('PRAGMA table_info(share_comments)')
      const cols = new Set<string>()
      for (const row of info[0]?.values || []) {
        if (typeof row[1] === 'string') cols.add(row[1])
      }
      if (!cols.has('replyContent')) {
        this.db.run('ALTER TABLE share_comments ADD COLUMN replyContent TEXT')
      }
      if (!cols.has('replyAt')) {
        this.db.run('ALTER TABLE share_comments ADD COLUMN replyAt TEXT')
      }
      if (!cols.has('replyBy')) {
        this.db.run('ALTER TABLE share_comments ADD COLUMN replyBy TEXT')
      }
    } catch (err) {
      logger.warn('ensureShareCommentsReplyColumns failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** SIX-LOG：旧库补 logs.traceId */
  private ensureLogsTraceIdColumn(): void {
    if (!this.db) return
    try {
      const info = this.db.exec('PRAGMA table_info(logs)')
      const cols = new Set<string>()
      for (const row of info[0]?.values || []) {
        if (typeof row[1] === 'string') cols.add(row[1])
      }
      if (!cols.has('traceId')) {
        this.db.run('ALTER TABLE logs ADD COLUMN traceId TEXT')
      }
    } catch (err) {
      logger.warn('ensureLogsTraceIdColumn failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** MCP：memos/files 补 mcpPublic 公开标记（O7 flag） */
  private ensureMcpPublicColumns(): void {
    if (!this.db) return
    try {
      for (const table of ['memos', 'files'] as const) {
        const info = this.db.exec(`PRAGMA table_info(${table})`)
        const cols = new Set<string>()
        for (const row of info[0]?.values || []) {
          if (typeof row[1] === 'string') cols.add(row[1])
        }
        if (!cols.has('mcpPublic')) {
          this.db.run(`ALTER TABLE ${table} ADD COLUMN mcpPublic INTEGER NOT NULL DEFAULT 0`)
        }
      }
    } catch (err) {
      logger.warn('ensureMcpPublicColumns failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** MCP 个人访问令牌表（仅存哈希） */
  private ensureMcpPatsTable(): void {
    if (!this.db) return
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS mcp_pats (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          tokenHash TEXT NOT NULL UNIQUE,
          tokenPrefix TEXT NOT NULL,
          label TEXT NOT NULL,
          expiresAt TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          revokedAt TEXT
        )
      `)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_pats_userId ON mcp_pats(userId)`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_pats_tokenHash ON mcp_pats(tokenHash)`)
    } catch (err) {
      logger.warn('ensureMcpPatsTable failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private ensureMcpOauthClientsTable(): void {
    if (!this.db) return
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
          clientId TEXT PRIMARY KEY,
          secretHash TEXT NOT NULL,
          redirectUris TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `)
    } catch (err) {
      logger.warn('ensureMcpOauthClientsTable failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * R1/API-10：主账号→owner；子账号→member；旧 admins→users Owner 后 DROP admins
   */
  private migrateIdentityData(): void {
    if (!this.db) return
    try {
      const users = this.getUsers()
      for (const u of users) {
        const role: UserRole =
          u.role === 'owner' || u.role === 'member'
            ? u.role
            : u.isMainAccount || !u.parentUserId
              ? 'owner'
              : 'member'
        const tenantRootId =
          u.tenantRootId ||
          (role === 'owner' ? u.id : u.parentUserId || u.id)
        const permissions =
          role === 'owner'
            ? [
                ...new Set([
                  ...liftLegacyPermissions(u.permissions || []),
                  ...OWNER_DEFAULT_PERMISSIONS,
                ]),
              ]
            : normalizeMemberPermissions(liftLegacyPermissions(u.permissions || []))
        if (
          u.role !== role ||
          u.tenantRootId !== tenantRootId ||
          JSON.stringify(u.permissions) !== JSON.stringify(permissions)
        ) {
          this.db.run(
            `UPDATE users SET role = ?, tenantRootId = ?, permissions = ?, isMainAccount = ? WHERE id = ?`,
            [role, tenantRootId, JSON.stringify(permissions), role === 'owner' ? 1 : 0, u.id]
          )
        }
      }

      if (this.hasAdminsTable()) {
        const admins = this.readLegacyAdmins()
        for (const admin of admins) {
          const existing = this.getUserByUsername(admin.username)
          if (existing) {
            if (existing.role !== 'owner') {
              this.db.run(
                `UPDATE users SET role = 'owner', tenantRootId = ?, isMainAccount = 1, permissions = ?, passwordHash = COALESCE(passwordHash, ?) WHERE id = ?`,
                [
                  existing.id,
                  JSON.stringify([...OWNER_DEFAULT_PERMISSIONS]),
                  admin.passwordHash,
                  existing.id,
                ]
              )
            }
          } else {
            this.createUser({
              id: admin.id,
              username: admin.username,
              passwordHash: admin.passwordHash,
              isMainAccount: true,
              role: 'owner',
              tenantRootId: admin.id,
              permissions: [...OWNER_DEFAULT_PERMISSIONS],
              createdAt: admin.createdAt,
              lastLoginAt: admin.lastLoginAt,
            })
          }
        }
        this.db.run('DROP TABLE IF EXISTS admins')
        logger.info('API-10：已迁移并 DROP admins 表', { migrated: admins.length })
      }

      this.saveToFile()
    } catch (err) {
      logger.warn('migrateIdentityData failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private hasAdminsTable(): boolean {
    if (!this.db) return false
    try {
      const r = this.db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='admins'`
      )
      return (r[0]?.values?.length ?? 0) > 0
    } catch {
      return false
    }
  }

  /** 仅迁移期读取；表已 DROP 后不再调用 */
  private readLegacyAdmins(): Admin[] {
    if (!this.db || !this.hasAdminsTable()) return []
    const result = this.db.exec('SELECT * FROM admins')
    return this.rowsToObjects(result) as unknown as Admin[]
  }

  /**
   * 空库唯一系统 Owner 种子（API-10：仅 users）
   * @returns true 表示本次新建；false 表示已存在跳过
   */
  ensureSystemOwnerSeed(): boolean {
    if (!this.db) return false

    const owners = this.getUsers().filter((u) => u.role === 'owner')
    if (owners.length > 0) {
      logger.debug('系统 Owner 种子已存在，跳过', { table: 'users', count: owners.length })
      return false
    }

    this.migrateIdentityData()
    if (this.getUsers().some((u) => u.role === 'owner')) {
      logger.info('已从遗留 admins 迁移系统 Owner', { table: 'users' })
      return true
    }

    // CFG-SYS-05：禁止内置默认口令。无注入则跳过种子，由 POST /api/auth/register 建首个 Owner。
    const bootstrapPassword = (process.env.CYP_BOOTSTRAP_OWNER_PASSWORD || '').trim()
    if (!bootstrapPassword) {
      logger.info('空库无 CYP_BOOTSTRAP_OWNER_PASSWORD，跳过 Owner 种子（请自助注册）', {
        table: 'users',
        seed: 'skipped',
      })
      return false
    }
    const passwordHash = bcrypt.hashSync(bootstrapPassword, 10)
    const id = uuidv4()
    const now = new Date().toISOString()

    this.createUser({
      id,
      username: 'admin',
      passwordHash,
      isMainAccount: true,
      role: 'owner',
      tenantRootId: id,
      permissions: [...OWNER_DEFAULT_PERMISSIONS],
      createdAt: now,
      lastLoginAt: now,
    })

    logger.info('已创建系统 Owner 种子（users 唯一种子路径）', {
      username: 'admin',
      role: 'owner',
      target: 'empty_db_unique_owner',
      table: 'users',
      passwordSource: 'CYP_BOOTSTRAP_OWNER_PASSWORD',
    })
    logger.sensitive('default owner password from bootstrap policy — change immediately')
    return true
  }

  // ========== 用户操作（API-10：admins CRUD 已退役）==========

  getUsers(): User[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users')
    return this.rowsToObjects(result).map((row) => this.parseUser(row))
  }

  /** 按租户根 ID SQL 过滤（热路径，避免 getUsers 全表再 filter） */
  getUsersByTenantRootId(tenantRootId: string): User[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM users WHERE tenantRootId = ?', [tenantRootId])
    return this.rowsToObjects(result).map((row) => this.parseUser(row))
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
    const id = user.id as string
    const isMainAccount = Boolean(user.isMainAccount)
    const parentUserId = (user.parentUserId as string | null) ?? null
    const rawRole = user.role as string | undefined
    const role: UserRole =
      rawRole === 'owner' || rawRole === 'member'
        ? rawRole
        : isMainAccount || !parentUserId
          ? 'owner'
          : 'member'
    const tenantRootId =
      (user.tenantRootId as string | null) ||
      (role === 'owner' ? id : parentUserId || id)

    return {
      id,
      digitalId: (user.digitalId as string) || '',
      username: user.username as string,
      passwordHash: user.passwordHash as string | null,
      token: user.token as string | null,
      securityQuestion: user.securityQuestion
        ? JSON.parse(user.securityQuestion as string)
        : null,
      gender: user.gender as string | null,
      email: user.email as string | null,
      birthDate: user.birthDate as string | null,
      phone: user.phone as string | null,
      address: user.address as string | null,
      position: user.position as string | null,
      company: user.company as string | null,
      bio: user.bio as string | null,
      rememberPassword: Boolean(user.rememberPassword),
      isMainAccount,
      parentUserId,
      permissions: JSON.parse((user.permissions as string) || '[]'),
      createdAt: user.createdAt as string,
      lastLoginAt: user.lastLoginAt as string | null,
      role,
      tenantRootId,
    }
  }

  createUser(user: CreateUserParams): string {
    if (!this.db) return ''
    const id = user.id || uuidv4()
    const digitalId = this.allocateDigitalId(user.digitalId)
    const role: UserRole =
      user.role ||
      (user.isMainAccount || !user.parentUserId ? 'owner' : 'member')
    const tenantRootId = user.tenantRootId || (role === 'owner' ? id : user.parentUserId || id)
    const permissions =
      user.permissions && user.permissions.length > 0
        ? role === 'member'
          ? normalizeMemberPermissions(user.permissions)
          : user.permissions
        : role === 'owner'
          ? [...OWNER_DEFAULT_PERMISSIONS]
          : [...MEMBER_DEFAULT_PERMISSIONS]

    this.db.run(
      `INSERT INTO users (
        id, digitalId, username, passwordHash, token, securityQuestion, gender, email,
        birthDate, phone, address, position, company, bio, rememberPassword,
        isMainAccount, parentUserId, permissions, role, tenantRootId, createdAt, lastLoginAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        digitalId,
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
        role === 'owner' || user.isMainAccount ? 1 : 0,
        user.parentUserId ?? null,
        JSON.stringify(permissions),
        role,
        tenantRootId,
        user.createdAt || new Date().toISOString(),
        user.lastLoginAt ?? null,
      ]
    )
    this.saveToFile()
    return id
  }

  /** AUD-S09：UPDATE 列名白名单，拒绝未知 key（防列名注入） */
  private static readonly USER_UPDATE_COLUMNS = new Set([
    'digitalId',
    'username',
    'passwordHash',
    'token',
    'securityQuestion',
    'gender',
    'email',
    'birthDate',
    'phone',
    'address',
    'position',
    'company',
    'bio',
    'rememberPassword',
    'isMainAccount',
    'parentUserId',
    'permissions',
    'createdAt',
    'lastLoginAt',
    'role',
    'tenantRootId',
  ])

  updateUser(id: string, updates: Partial<User>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (!SqliteDatabase.USER_UPDATE_COLUMNS.has(key)) {
        throw new Error(`拒绝未知用户列: ${key}`)
      }
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

  /** 多用户一次查询（租户列表，避免 N 次 getMemosByUserId） */
  getMemosByUserIds(userIds: string[]): Memo[] {
    if (!this.db || userIds.length === 0) return []
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return []
    if (unique.length === 1) return this.getMemosByUserId(unique[0])
    const ph = unique.map(() => '?').join(',')
    const result = this.db.exec(
      `SELECT * FROM memos WHERE userId IN (${ph}) AND deletedAt IS NULL ORDER BY updatedAt DESC`,
      unique
    )
    return this.rowsToObjects(result).map((row) => this.parseMemo(row))
  }

  /**
   * 列表投影：SQL 层截断正文，避免 sql.js 为列表拉取整库大正文（REST list projection）
   */
  getMemosListByUserIds(
    userIds: string[],
    contentMax = 256
  ): Array<Memo & { contentTruncated?: boolean }> {
    if (!this.db || userIds.length === 0) return []
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return []
    const max = Math.max(32, Math.floor(contentMax))
    const ph = unique.map(() => '?').join(',')
    const result = this.db.exec(
      `SELECT id, userId, title,
        CASE WHEN length(content) > ? THEN substr(content, 1, ?) ELSE content END AS content,
        CASE WHEN length(content) > ? THEN 1 ELSE 0 END AS _contentTruncated,
        tags, priority, attachments, deletedAt, createdAt, updatedAt
       FROM memos
       WHERE userId IN (${ph}) AND deletedAt IS NULL
       ORDER BY updatedAt DESC`,
      [max, max, max, ...unique]
    )
    return this.rowsToObjects(result).map((row) => {
      const memo = this.parseMemo(row)
      const truncated = Number(row._contentTruncated) === 1
      return truncated ? { ...memo, contentTruncated: true } : memo
    })
  }

  /** 租户范围计数（统计 API，禁止为计数拉全表） */
  countByUserIds(
    table: 'memos' | 'files' | 'shares',
    userIds: string[]
  ): number {
    if (!this.db || userIds.length === 0) return 0
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return 0
    const ph = unique.map(() => '?').join(',')
    const extra = table === 'memos' ? ' AND deletedAt IS NULL' : ''
    const result = this.db.exec(
      `SELECT COUNT(*) FROM ${table} WHERE userId IN (${ph})${extra}`,
      unique
    )
    return Number(result[0]?.values[0]?.[0] || 0)
  }

  countLogsVisibleToUserIds(userIds: string[]): number {
    if (!this.db) return 0
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) {
      const r = this.db.exec(`SELECT COUNT(*) FROM logs WHERE userId IS NULL`)
      return Number(r[0]?.values[0]?.[0] || 0)
    }
    const ph = unique.map(() => '?').join(',')
    const result = this.db.exec(
      `SELECT COUNT(*) FROM logs WHERE userId IS NULL OR userId IN (${ph})`,
      unique
    )
    return Number(result[0]?.values[0]?.[0] || 0)
  }

  /** 文件库关联用：只取 id 与附件列表，不读正文 */
  getMemoAttachmentLinks(userId: string): Array<{ id: string; attachments: string[] }> {
    return this.getMemoAttachmentLinksByUserIds([userId])
  }

  getMemoAttachmentLinksByUserIds(userIds: string[]): Array<{ id: string; attachments: string[] }> {
    if (!this.db || userIds.length === 0) return []
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return []
    const ph = unique.map(() => '?').join(',')
    const result = this.db.exec(
      `SELECT id, attachments FROM memos WHERE userId IN (${ph}) AND deletedAt IS NULL`,
      unique
    )
    return this.rowsToObjects(result).map((row) => {
      let attachments: string[] = []
      try {
        const parsed = JSON.parse(String(row.attachments || '[]'))
        if (Array.isArray(parsed)) attachments = parsed.map((id) => String(id))
      } catch {
        attachments = []
      }
      return { id: String(row.id), attachments }
    })
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
      updatedAt: memo.updatedAt as string,
      mcpPublic: Boolean(memo.mcpPublic),
    }
  }

  createMemo(memo: CreateMemoParams): string {
    if (!this.db) return ''
    const id = memo.id || uuidv4()
    this.db.run(
      `INSERT INTO memos (id, userId, title, content, tags, priority, attachments, createdAt, updatedAt, mcpPublic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        memo.userId,
        memo.title ?? null,
        memo.content || '',
        JSON.stringify(memo.tags || []),
        memo.priority ?? null,
        JSON.stringify(memo.attachments || []),
        memo.createdAt || new Date().toISOString(),
        memo.updatedAt || new Date().toISOString(),
        (memo as CreateMemoParams & { mcpPublic?: boolean }).mcpPublic ? 1 : 0,
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
      } else if (key === 'mcpPublic') {
        fields.push('mcpPublic = ?')
        values.push(value ? 1 : 0)
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

  getFileById(id: string): FileRecord | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM files WHERE id = ?', [id])
    const rows = this.rowsToObjects(result) as unknown as FileRecord[]
    return rows[0]
  }

  getFilesByUserId(userId: string): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files WHERE userId = ?', [userId])
    return this.rowsToObjects(result) as unknown as FileRecord[]
  }

  /** 本范围（主+子）文件列表；与备忘录租户口径一致 */
  getFilesByUserIds(userIds: string[]): FileRecord[] {
    if (!this.db || userIds.length === 0) return []
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return []
    const ph = unique.map(() => '?').join(',')
    const result = this.db.exec(`SELECT * FROM files WHERE userId IN (${ph})`, unique)
    return this.rowsToObjects(result) as unknown as FileRecord[]
  }

  getFilesByMemoId(memoId: string): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM files WHERE memoId = ?', [memoId])
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

  updateFile(id: string, updates: Partial<Pick<FileRecord, 'memoId' | 'filename' | 'mimeType' | 'size'>>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'memoId' || key === 'filename' || key === 'mimeType' || key === 'size') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`, values)
      this.saveToFile()
    }
  }

  deleteFile(id: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM files WHERE id = ?', [id])
    this.saveToFile()
  }

  updateFileMcpMeta(id: string, updates: { filename?: string; mcpPublic?: boolean }): void {
    if (!this.db) return
    const fields: string[] = []
    const values: unknown[] = []
    if (updates.filename !== undefined) {
      fields.push('filename = ?')
      values.push(updates.filename)
    }
    if (updates.mcpPublic !== undefined) {
      fields.push('mcpPublic = ?')
      values.push(updates.mcpPublic ? 1 : 0)
    }
    if (fields.length === 0) return
    values.push(id)
    this.db.run(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`, values)
    this.saveToFile()
  }

  listMcpPublicMemos(): Memo[] {
    if (!this.db) return []
    const result = this.db.exec(
      `SELECT * FROM memos WHERE deletedAt IS NULL AND mcpPublic = 1 ORDER BY updatedAt DESC`
    )
    return (this.rowsToObjects(result) as Record<string, unknown>[]).map((r) => this.parseMemo(r))
  }

  /** 未删除备忘录全表（公开选择器 requireFlag=false 时的候选池） */
  listActiveMemos(): Memo[] {
    if (!this.db) return []
    const result = this.db.exec(
      `SELECT * FROM memos WHERE deletedAt IS NULL ORDER BY updatedAt DESC`
    )
    return (this.rowsToObjects(result) as Record<string, unknown>[]).map((r) => this.parseMemo(r))
  }

  listMcpPublicFiles(): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec(`SELECT * FROM files WHERE mcpPublic = 1 ORDER BY createdAt DESC`)
    return (this.rowsToObjects(result) as FileRecord[]).map((f) => ({
      ...f,
      mcpPublic: Boolean((f as FileRecord & { mcpPublic?: number | boolean }).mcpPublic),
    }))
  }

  listAllFiles(): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec(`SELECT * FROM files ORDER BY createdAt DESC`)
    return (this.rowsToObjects(result) as FileRecord[]).map((f) => ({
      ...f,
      mcpPublic: Boolean((f as FileRecord & { mcpPublic?: number | boolean }).mcpPublic),
    }))
  }

  createMcpPat(input: {
    userId: string
    tokenHash: string
    tokenPrefix: string
    label: string
    expiresAt: string
  }): string {
    if (!this.db) return ''
    const id = uuidv4()
    const createdAt = new Date().toISOString()
    this.db.run(
      `INSERT INTO mcp_pats (id, userId, tokenHash, tokenPrefix, label, expiresAt, createdAt, revokedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [id, input.userId, input.tokenHash, input.tokenPrefix, input.label, input.expiresAt, createdAt]
    )
    this.saveToFile()
    return id
  }

  listMcpPatsByUserId(userId: string): McpPatRecord[] {
    if (!this.db) return []
    const result = this.db.exec(
      `SELECT * FROM mcp_pats WHERE userId = ? ORDER BY createdAt DESC`,
      [userId]
    )
    return this.rowsToObjects(result) as unknown as McpPatRecord[]
  }

  revokeMcpPat(id: string, userId: string): boolean {
    if (!this.db) return false
    const existing = this.db.exec(`SELECT id FROM mcp_pats WHERE id = ? AND userId = ?`, [id, userId])
    if (!existing[0]?.values?.length) return false
    this.db.run(`UPDATE mcp_pats SET revokedAt = ? WHERE id = ?`, [new Date().toISOString(), id])
    this.saveToFile()
    return true
  }

  /** 用明文 PAT 查找绑定用户；无效/过期/吊销返回 undefined */
  getUserByMcpPat(rawToken: string): User | undefined {
    if (!this.db || !rawToken) return undefined
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const result = this.db.exec(
      `SELECT * FROM mcp_pats WHERE tokenHash = ? AND revokedAt IS NULL LIMIT 1`,
      [tokenHash]
    )
    const rows = this.rowsToObjects(result) as unknown as McpPatRecord[]
    const pat = rows[0]
    if (!pat) return undefined
    if (pat.expiresAt && new Date(pat.expiresAt).getTime() < Date.now()) return undefined
    return this.getUserById(pat.userId)
  }

  getMcpPatByRawToken(rawToken: string): McpPatRecord | undefined {
    if (!this.db || !rawToken) return undefined
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const result = this.db.exec(
      `SELECT * FROM mcp_pats WHERE tokenHash = ? AND revokedAt IS NULL LIMIT 1`,
      [tokenHash]
    )
    const rows = this.rowsToObjects(result) as unknown as McpPatRecord[]
    const pat = rows[0]
    if (!pat) return undefined
    if (pat.expiresAt && new Date(pat.expiresAt).getTime() < Date.now()) return undefined
    return pat
  }

  getMcpPatById(id: string): McpPatRecord | undefined {
    if (!this.db || !id) return undefined
    const result = this.db.exec(`SELECT * FROM mcp_pats WHERE id = ? LIMIT 1`, [id])
    const rows = this.rowsToObjects(result) as unknown as McpPatRecord[]
    return rows[0]
  }

  createMcpOauthClient(input: { clientId: string; secretHash: string; redirectUris: string[] }): void {
    if (!this.db) return
    this.db.run(
      `INSERT INTO mcp_oauth_clients (clientId, secretHash, redirectUris, createdAt) VALUES (?, ?, ?, ?)`,
      [input.clientId, input.secretHash, JSON.stringify(input.redirectUris), new Date().toISOString()]
    )
    this.saveToFile()
  }

  getMcpOauthClient(clientId: string): { clientId: string; secretHash: string; redirectUris: string[] } | undefined {
    if (!this.db || !clientId) return undefined
    const result = this.db.exec(`SELECT * FROM mcp_oauth_clients WHERE clientId = ? LIMIT 1`, [clientId])
    const rows = this.rowsToObjects(result) as { clientId: string; secretHash: string; redirectUris: string }[]
    const row = rows[0]
    if (!row) return undefined
    let uris: string[] = []
    try {
      uris = JSON.parse(row.redirectUris)
    } catch {
      uris = []
    }
    return { clientId: row.clientId, secretHash: row.secretHash, redirectUris: uris }
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

  getSharesByMemoId(memoId: string): Share[] {
    if (!this.db) return []
    const result = this.db.exec('SELECT * FROM shares WHERE memoId = ?', [memoId])
    return this.rowsToObjects(result) as unknown as Share[]
  }

  createShare(share: CreateShareParams): string {
    if (!this.db) return ''
    const id = share.id || uuidv4()
    this.db.run(
      `INSERT INTO shares (id, userId, memoId, shareCode, passwordHash, expiresAt, viewCount, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        share.userId,
        share.memoId,
        share.shareCode || uuidv4().replace(/-/g, '').substring(0, 8),
        share.passwordHash ?? null,
        share.expiresAt ?? null,
        share.viewCount || 0,
        share.createdAt || new Date().toISOString(),
      ]
    )
    this.saveToFile()
    return id
  }

  deleteShare(id: string): void {
    if (!this.db) return
    // 分享评论随链接一并清除，避免孤儿评论
    this.db.run('DELETE FROM share_comments WHERE shareId = ?', [id])
    this.db.run('DELETE FROM shares WHERE id = ?', [id])
    this.saveToFile()
  }

  /** 按备忘录撤销全部分享（含评论）；备忘录软删/硬删共用 */
  deleteSharesByMemoId(memoId: string): number {
    if (!this.db || !memoId) return 0
    const rows = this.getSharesByMemoId(memoId)
    for (const share of rows) {
      if (share.id) this.deleteShare(share.id)
    }
    return rows.length
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

  // ========== 公开分享评论 ==========

  createShareComment(comment: CreateShareCommentParams): string {
    if (!this.db) return ''
    const id = comment.id || uuidv4()
    const authorName = (comment.authorName || '匿名访客').trim().slice(0, 32) || '匿名访客'
    this.db.run(
      `INSERT INTO share_comments (id, shareId, authorName, content, feedback, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        comment.shareId,
        authorName,
        comment.content,
        comment.feedback,
        comment.createdAt || new Date().toISOString(),
      ]
    )
    this.saveToFile()
    return id
  }

  getShareCommentsByShareId(shareId: string, limit = 100): ShareComment[] {
    if (!this.db) return []
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200)
    const result = this.db.exec(
      'SELECT * FROM share_comments WHERE shareId = ? ORDER BY createdAt DESC LIMIT ?',
      [shareId, safeLimit]
    )
    return this.rowsToObjects(result) as unknown as ShareComment[]
  }

  /** 分享主人收件：只返回这些分享下的评论 */
  getShareCommentsByShareIds(shareIds: string[]): ShareComment[] {
    if (!this.db || shareIds.length === 0) return []
    const placeholders = shareIds.map(() => '?').join(',')
    const result = this.db.exec(
      `SELECT * FROM share_comments WHERE shareId IN (${placeholders}) ORDER BY createdAt DESC`,
      shareIds
    )
    return this.rowsToObjects(result) as unknown as ShareComment[]
  }

  getShareCommentById(id: string): ShareComment | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT * FROM share_comments WHERE id = ?', [id])
    const rows = this.rowsToObjects(result) as unknown as ShareComment[]
    return rows[0]
  }

  replyShareComment(
    id: string,
    reply: { replyContent: string; replyBy: string; replyAt?: string }
  ): void {
    if (!this.db) return
    this.db.run(
      `UPDATE share_comments SET replyContent = ?, replyAt = ?, replyBy = ? WHERE id = ?`,
      [
        reply.replyContent,
        reply.replyAt || new Date().toISOString(),
        reply.replyBy,
        id,
      ]
    )
    this.saveToFile()
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
    /** LOG-03：全写入路径脱敏；X-01：缺省注入请求 ALS traceId */
    let details = log.details ?? null
    if (details) {
      try {
        const parsed = JSON.parse(details)
        const redacted = redactSensitive(parsed)
        details = redacted === undefined ? JSON.stringify({ redactFailed: true }) : JSON.stringify(redacted)
      } catch {
        // 非 JSON details 原样保留（无结构化敏感键）
      }
    }
    const traceId = log.traceId ?? getRequestTraceId() ?? null
    this.db.run(
      `INSERT INTO logs (id, level, message, userId, action, details, traceId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        log.level,
        log.message,
        log.userId ?? null,
        log.action ?? null,
        details,
        traceId,
        log.createdAt || new Date().toISOString(),
      ]
    )
    this.saveToFile()
    return id
  }

  /**
   * 按 traceId 检索日志（SIX-LOG / Trace）
   */
  getLogsByTrace(traceId: string): LogEntry[] {
    if (!this.db || !traceId) return []
    const result = this.db.exec(
      'SELECT * FROM logs WHERE traceId = ? ORDER BY createdAt DESC LIMIT 1000',
      [traceId]
    )
    return this.rowsToObjects(result) as unknown as LogEntry[]
  }

  /**
   * 5.7 溯源检索分析：按业务码（如 E040）定位日志与 traceId。
   * code 仅允许字母数字与连字符，避免拼接 SQL。
   */
  getLogsByBusinessCode(code: string, limit = 100): LogEntry[] {
    if (!this.db) return []
    const token = String(code || '').trim()
    if (!/^[A-Za-z0-9_-]{2,32}$/.test(token)) return []
    const n = Math.min(Math.max(Math.floor(limit), 1), 200)
    const like = `%${token}%`
    const result = this.db.exec(
      "SELECT * FROM logs WHERE message LIKE ? OR IFNULL(details, '') LIKE ? OR IFNULL(action, '') LIKE ? ORDER BY createdAt DESC LIMIT ?",
      [like, like, like, n]
    )
    return this.rowsToObjects(result) as unknown as LogEntry[]
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
      if (count >= 500) {
        try {
          this.db.run('VACUUM')
        } catch {
          /* 压缩失败仍保留删除结果 */
        }
      }
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
   * 清理孤立文件（备忘录已不存在，或备忘录已软删除）
   * 返回待删除记录（含 path，供上层删磁盘 blob）
   */
  getOrphanedFiles(): FileRecord[] {
    if (!this.db) return []
    const result = this.db.exec(`
      SELECT * FROM files
      WHERE memoId IS NOT NULL
        AND (
          memoId NOT IN (SELECT id FROM memos)
          OR memoId IN (SELECT id FROM memos WHERE deletedAt IS NOT NULL)
        )
    `)
    return this.rowsToObjects(result) as unknown as FileRecord[]
  }

  /**
   * 清理孤立文件（没有关联有效备忘录的文件）
   */
  cleanOrphanedFiles(): number {
    if (!this.db) return 0

    const orphaned = this.getOrphanedFiles()
    if (orphaned.length === 0) return 0

    this.db.run(`
      DELETE FROM files
      WHERE memoId IS NOT NULL
        AND (
          memoId NOT IN (SELECT id FROM memos)
          OR memoId IN (SELECT id FROM memos WHERE deletedAt IS NOT NULL)
        )
    `)
    this.saveToFile()
    return orphaned.length
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
   * 删除用户。purgeRelated=true 时一并清除备忘录/文件/分享及子账号相关内容。
   */
  deleteUserWithData(userId: string, purgeRelated = true): DeleteUserResult {
    if (!this.db) return { memos: 0, files: 0, shares: 0, subAccounts: 0 }

    const subAccountsResult = this.db.exec('SELECT id FROM users WHERE parentUserId = ?', [userId])
    const subAccountIds: string[] =
      subAccountsResult[0]?.values?.map((row: unknown[]) => row[0] as string) || []

    let totalMemos = 0
    let totalFiles = 0
    let totalShares = 0

    for (const subAccountId of subAccountIds) {
      if (purgeRelated) {
        const subMemosResult = this.db.exec('SELECT COUNT(*) FROM memos WHERE userId = ?', [
          subAccountId,
        ])
        const subFilesResult = this.db.exec('SELECT COUNT(*) FROM files WHERE userId = ?', [
          subAccountId,
        ])
        const subSharesResult = this.db.exec('SELECT COUNT(*) FROM shares WHERE userId = ?', [
          subAccountId,
        ])

        totalMemos += (subMemosResult[0]?.values[0]?.[0] as number) || 0
        totalFiles += (subFilesResult[0]?.values[0]?.[0] as number) || 0
        totalShares += (subSharesResult[0]?.values[0]?.[0] as number) || 0

        this.db.run('DELETE FROM memos WHERE userId = ?', [subAccountId])
        this.db.run('DELETE FROM files WHERE userId = ?', [subAccountId])
        this.db.run('DELETE FROM shares WHERE userId = ?', [subAccountId])
      }
      this.db.run('DELETE FROM users WHERE id = ?', [subAccountId])
    }

    if (purgeRelated) {
      const memosResult = this.db.exec('SELECT COUNT(*) FROM memos WHERE userId = ?', [userId])
      const filesResult = this.db.exec('SELECT COUNT(*) FROM files WHERE userId = ?', [userId])
      const sharesResult = this.db.exec('SELECT COUNT(*) FROM shares WHERE userId = ?', [userId])

      totalMemos += (memosResult[0]?.values[0]?.[0] as number) || 0
      totalFiles += (filesResult[0]?.values[0]?.[0] as number) || 0
      totalShares += (sharesResult[0]?.values[0]?.[0] as number) || 0

      this.db.run('DELETE FROM memos WHERE userId = ?', [userId])
      this.db.run('DELETE FROM files WHERE userId = ?', [userId])
      this.db.run('DELETE FROM shares WHERE userId = ?', [userId])
    }

    this.db.run('DELETE FROM users WHERE id = ?', [userId])

    this.saveToFile()
    return {
      memos: totalMemos,
      files: totalFiles,
      shares: totalShares,
      subAccounts: subAccountIds.length,
    }
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
   * 原始 SQL 执行（数据迁移服务注入用；不做业务 CRUD 封装）
   */
  execSql(sql: string): void {
    if (!this.db || !this.initialized) {
      throw new Error('database not initialized')
    }
    this.db.exec(sql)
    this.saveToFile()
  }

  /** 已应用迁移脚本名（queryApplied） */
  listAppliedMigrationScripts(): string[] {
    if (!this.db || !this.initialized) return []
    try {
      const result = this.db.exec('SELECT script FROM schema_migrations ORDER BY script')
      if (!result.length || !result[0].values) return []
      return result[0].values.map((row) => String(row[0] || '')).filter(Boolean)
    } catch {
      return []
    }
  }

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

  // ========== 设置 ==========

  getSetting(key: string): string | undefined {
    if (!this.db) return undefined
    const result = this.db.exec('SELECT value FROM settings WHERE key = ?', [key])
    const rows = this.rowsToObjects(result)
    if (rows.length === 0) return undefined
    return String(rows[0].value)
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    )
    this.saveToFile()
  }

  getAllSettings(): Record<string, string> {
    if (!this.db) return {}
    const result = this.db.exec('SELECT key, value FROM settings')
    const rows = this.rowsToObjects(result)
    const out: Record<string, string> = {}
    for (const row of rows) {
      out[String(row.key)] = String(row.value)
    }
    return out
  }

  // ========== 导出所有数据 ==========

  exportAll(): ExportData {
    return {
      users: this.getUsers(),
      memos: this.getMemos(),
      files: this.getFiles(),
      shares: this.getShares(),
      logs: this.getLogs(),
      settings: this.getAllSettings(),
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
export async function initDatabase(options?: { skipSeed?: boolean }): Promise<SqliteDatabase> {
  await database.init(options)
  return database
}

export function ready_rb_l0_infra_db_01(): boolean {
  try {
    return typeof database?.isHealthy === 'function' && database.isHealthy()
  } catch {
    return false
  }
}

export interface FileStorageState {
  ready: boolean
  rootDir: string | null
}

const fileStorageState: FileStorageState = {
  ready: false,
  rootDir: null,
}

const blobTokens = new Map<string, { path: string; expiresAt: number }>()

export function getUploadRoot(): string {
  if (!fileStorageState.rootDir) throw new Error('file storage not ready')
  return fileStorageState.rootDir
}

export function ensureObjectPath(relativeName: string): string {
  const root = getUploadRoot()
  const safe = relativeName.replace(/\\/g, '/').replace(/\.\./g, '')
  const full = path.join(root, safe)
  const dir = path.dirname(full)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return full
}

/** 颁发短时下载凭证（嵌入式完整能力；不暴露真实云密钥） */
export function issueDownloadToken(absolutePath: string, ttlMs = 5 * 60_000): string {
  const token = crypto.randomBytes(24).toString('hex')
  blobTokens.set(token, { path: absolutePath, expiresAt: Date.now() + ttlMs })
  return token
}

export function resolveDownloadToken(token: string): string | null {
  const row = blobTokens.get(token)
  if (!row) return null
  if (Date.now() > row.expiresAt) {
    blobTokens.delete(token)
    return null
  }
  return row.path
}

/** 生命周期：清理超过 maxAgeMs 的孤儿临时文件（不碰 DB 结构化记录） */
export function cleanupExpiredBlobs(maxAgeMs = 30 * 24 * 3600_000): { deleted: number } {
  if (!fileStorageState.rootDir || !fs.existsSync(fileStorageState.rootDir)) return { deleted: 0 }
  let deleted = 0
  const now = Date.now()
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full)
      else if (now - st.mtimeMs > maxAgeMs) {
        try {
          fs.unlinkSync(full)
          deleted += 1
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(fileStorageState.rootDir)
  return { deleted }
}

export function getFileStorageState(): FileStorageState {
  return { ...fileStorageState }
}

export function isFileStorageReady(): boolean {
  return fileStorageState.ready
}

export function initFileStorage(opts: { dataDir: string }): FileStorageState {
  // 对象存储扩展点实现（本机 {dataDir}/uploads）：外部依赖 · 不进闭集 35 · 不设独立就绪键（架构 V1.8.5）。
  // R-010 / R-015：uploads = 大 blob 根；禁止作为秒级小日志主路径。
  // 元数据在核心业务库；观测流水在 logs/（JSONL + observability.sqlite）。
  const root = path.join(opts.dataDir, 'uploads')
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  fileStorageState.rootDir = root
  fileStorageState.ready = true
  log({
    level: 'info',
    message: 'file storage ready',
    type: 'runtime',
    action: 'file_storage_ready',
    context: { rootDir: root, role: 'object_blob_store' },
  })
  return getFileStorageState()
}

export function resetFileStorage(): void {
  fileStorageState.ready = false
  fileStorageState.rootDir = null
  blobTokens.clear()
}

export interface MigrationScript {
  id: string
  script: string
  absolutePath: string
}

export interface MigrationRunResult {
  applied: string[]
  skipped: string[]
  migrationsDir: string | null
}

export interface MigrationState {
  ready: boolean
  dataDir: string | null
  migrationsDir: string | null
  pendingCount: number
  appliedCount: number
  lastRunAt: string | null
}

export interface InitMigrationOptions {
  dataDir: string
  /** 执行任意 SQL（含建表/DDL）；由外部注入以避免环依赖 */
  execSql?: (sql: string) => void
  /** 返回已应用的 script 名列表 */
  queryApplied?: () => string[]
  /**
   * 为 true 且未注入 execSql 时，尝试 dynamic import('./runtime-base/l0/infra/db/ready.js')
   * 默认 false（推荐始终注入）
   */
  allowDynamicSqlite?: boolean
}

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  script TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
`

const migrationState: MigrationState = {
  ready: false,
  dataDir: null,
  migrationsDir: null,
  pendingCount: 0,
  appliedCount: 0,
  lastRunAt: null,
}

let execSqlFn: ((sql: string) => void) | null = null
let queryAppliedFn: (() => string[]) | null = null
let allowDynamic = false

function packageMigrationsDir(): string {
  // packages/server/src/runtime-base/l0/infra/db → packages/server/migrations
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, '..', '..', '..', '..', '..', 'migrations')
}

function resolveMigrationsDir(dataDir: string): string | null {
  const preferred = path.join(dataDir, 'migrations')
  if (fs.existsSync(preferred) && fs.statSync(preferred).isDirectory()) {
    return preferred
  }
  const fallback = packageMigrationsDir()
  if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
    return fallback
  }
  return null
}

function listSqlScripts(dir: string): MigrationScript[] {
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'))
  return names.map((script) => ({
    id: script.replace(/\.sql$/i, ''),
    script,
    absolutePath: path.join(dir, script),
  }))
}

async function ensureExecutors(): Promise<void> {
  if (execSqlFn && queryAppliedFn) return
  if (!allowDynamic) {
    throw new Error(
      'migration service: execSql/queryApplied 未注入；请由 bootstrap 注入或设 allowDynamicSqlite'
    )
  }
  const mod = (await import('./ready.js')) as {
    getDatabase?: () => {
      run?: (sql: string) => void
      exec?: (sql: string) => void
      prepare?: (sql: string) => {
        all?: (...args: unknown[]) => unknown[]
        get?: (...args: unknown[]) => unknown
        run?: (...args: unknown[]) => void
        finalize?: () => void
      }
    }
    db?: {
      run: (sql: string, params?: unknown[]) => void
      exec: (sql: string) => void
      prepare: (sql: string) => {
        all: (...args: unknown[]) => Record<string, unknown>[]
        run: (...args: unknown[]) => void
        free?: () => void
      }
    }
  }

  // 宽松适配：优先裸 sql.js Database（若模块导出），否则要求调用方注入
  const candidate = (mod as { getSqlJsDb?: () => unknown }).getSqlJsDb?.() as
    | {
        run: (sql: string, params?: unknown[]) => void
        exec: (sql: string) => void
        prepare: (sql: string) => {
          all: (...args: unknown[]) => Record<string, unknown>[]
          free?: () => void
        }
      }
    | undefined

  if (!candidate) {
    throw new Error(
      'migration service: dynamic import 未找到可用 sql.js 句柄；请注入 execSql/queryApplied'
    )
  }

  execSqlFn = (sql: string) => {
    candidate.exec(sql)
  }
  queryAppliedFn = () => {
    candidate.exec(SCHEMA_DDL)
    const stmt = candidate.prepare('SELECT script FROM schema_migrations ORDER BY script')
    const rows = stmt.all() as Array<{ script?: string }>
    stmt.free?.()
    return rows.map((r) => String(r.script || '')).filter(Boolean)
  }
}

function refreshCounts(): void {
  const dir = migrationState.migrationsDir
  if (!dir || !queryAppliedFn) {
    migrationState.pendingCount = 0
    migrationState.appliedCount = 0
    return
  }
  const scripts = listSqlScripts(dir)
  const applied = new Set(queryAppliedFn())
  migrationState.appliedCount = applied.size
  migrationState.pendingCount = scripts.filter((s) => !applied.has(s.script)).length
}

/**
 * 扫描目录并执行未应用脚本；每脚本成功后写入 schema_migrations
 */
export async function runPendingMigrations(): Promise<MigrationRunResult> {
  if (!migrationState.ready) throw new Error('migration service not ready')
  await ensureExecutors()
  if (!execSqlFn || !queryAppliedFn) {
    throw new Error('migration service executors missing')
  }

  execSqlFn(SCHEMA_DDL)

  const dir = migrationState.migrationsDir
  if (!dir) {
    migrationState.pendingCount = 0
    migrationState.appliedCount = queryAppliedFn().length
    migrationState.lastRunAt = new Date().toISOString()
    return { applied: [], skipped: [], migrationsDir: null }
  }

  const scripts = listSqlScripts(dir)
  const appliedSet = new Set(queryAppliedFn())
  const applied: string[] = []
  const skipped: string[] = []

  for (const s of scripts) {
    if (appliedSet.has(s.script)) {
      skipped.push(s.script)
      continue
    }
    const sql = fs.readFileSync(s.absolutePath, 'utf-8')
    // 仅执行 DDL/迁移 SQL；不做业务 CRUD 封装
    execSqlFn(sql)
    const now = new Date().toISOString()
    const id = s.id.replace(/'/g, "''")
    const scriptEsc = s.script.replace(/'/g, "''")
    execSqlFn(
      `INSERT INTO schema_migrations (id, script, applied_at) VALUES ('${id}', '${scriptEsc}', '${now}');`
    )
    applied.push(s.script)
    appliedSet.add(s.script)
  }

  migrationState.lastRunAt = new Date().toISOString()
  refreshCounts()
  return { applied, skipped, migrationsDir: dir }
}

export function getMigrationState(): MigrationState {
  return { ...migrationState }
}

export function isMigrationReady(): boolean {
  return migrationState.ready
}

export function initMigration(opts: InitMigrationOptions): MigrationState {
  migrationState.dataDir = opts.dataDir
  execSqlFn = opts.execSql ?? null
  queryAppliedFn = opts.queryApplied ?? null
  allowDynamic = Boolean(opts.allowDynamicSqlite)
  migrationState.migrationsDir = resolveMigrationsDir(opts.dataDir)
  migrationState.lastRunAt = null
  migrationState.pendingCount = 0
  migrationState.appliedCount = 0
  migrationState.ready = true

  // 若已注入 queryApplied，可立即刷新计数（表可能尚未创建）
  if (queryAppliedFn && execSqlFn) {
    try {
      execSqlFn(SCHEMA_DDL)
      refreshCounts()
    } catch {
      migrationState.pendingCount = migrationState.migrationsDir
        ? listSqlScripts(migrationState.migrationsDir).length
        : 0
      migrationState.appliedCount = 0
    }
  } else if (migrationState.migrationsDir) {
    migrationState.pendingCount = listSqlScripts(migrationState.migrationsDir).length
  }

  return getMigrationState()
}

export function resetMigration(): void {
  migrationState.ready = false
  migrationState.dataDir = null
  migrationState.migrationsDir = null
  migrationState.pendingCount = 0
  migrationState.appliedCount = 0
  migrationState.lastRunAt = null
  execSqlFn = null
  queryAppliedFn = null
  allowDynamic = false
}
