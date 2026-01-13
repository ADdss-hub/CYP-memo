/**
 * 缓存管理器
 * Cache Manager for local memo storage
 * 
 * 使用加密的 SQLite 数据库存储备忘录缓存
 * Uses encrypted SQLite database for memo cache storage
 * 
 * 需求: 5.1, 5.2, 5.4 - 本地数据缓存
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import {
  encrypt,
  decrypt,
  deriveKey,
  keyToString,
  stringToKey,
  type EncryptedData
} from './CryptoUtils.js'
import type { CachedMemo, CacheStats } from '../shared/types.js'

/**
 * 缓存管理器配置
 */
export interface CacheManagerConfig {
  /** 数据库文件路径 (可选，默认使用 app.getPath('userData')) */
  dbPath?: string
  /** 加密密钥 (可选，如果不提供则使用派生密钥) */
  encryptionKey?: Buffer
}

/**
 * 数据库中存储的加密备忘录格式
 */
interface StoredMemo {
  id: string
  encrypted_data: string
  created_at: number
  updated_at: number
}

/**
 * 缓存管理器类
 * 管理本地备忘录缓存的加密存储
 */
export class CacheManager {
  private db: Database.Database | null = null
  private encryptionKey: Buffer | null = null
  private salt: string | null = null
  private dbPath: string
  private initialized = false

  constructor(config?: CacheManagerConfig) {
    this.dbPath = config?.dbPath || this.getDefaultDbPath()
    if (config?.encryptionKey) {
      this.encryptionKey = config.encryptionKey
    }
  }

  /**
   * 获取默认数据库路径
   */
  private getDefaultDbPath(): string {
    try {
      const userDataPath = app.getPath('userData')
      return path.join(userDataPath, 'cache.db')
    } catch {
      // 在测试环境中 app 可能不可用
      return path.join(process.cwd(), 'test-cache.db')
    }
  }

  /**
   * 初始化缓存管理器
   * Initialize the cache manager with encryption key
   * 
   * @param masterPassword - 主密码，用于派生加密密钥
   */
  async initialize(masterPassword: string): Promise<void> {
    if (this.initialized) {
      return
    }

    // 确保目录存在
    const dbDir = path.dirname(this.dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // 检查是否有已保存的盐
    const saltPath = this.dbPath + '.salt'
    if (fs.existsSync(saltPath)) {
      this.salt = fs.readFileSync(saltPath, 'utf8')
    }

    // 派生加密密钥
    const derived = deriveKey(masterPassword, this.salt || undefined)
    this.encryptionKey = derived.key
    
    // 保存盐（如果是新生成的）
    if (!this.salt) {
      this.salt = derived.salt
      fs.writeFileSync(saltPath, this.salt, 'utf8')
    }

    // 初始化数据库
    this.db = new Database(this.dbPath)
    this.createTables()
    this.initialized = true
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_memos_updated_at ON memos(updated_at);
      
      CREATE TABLE IF NOT EXISTS cache_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db || !this.encryptionKey) {
      throw new Error('CacheManager not initialized. Call initialize() first.')
    }
  }

  /**
   * 缓存单个备忘录
   * Cache a single memo
   * 
   * @param memo - 要缓存的备忘录
   */
  async cacheMemo(memo: CachedMemo): Promise<void> {
    this.ensureInitialized()

    const encryptedData = encrypt(JSON.stringify(memo), this.encryptionKey!)
    const encryptedJson = JSON.stringify(encryptedData)

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO memos (id, encrypted_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `)

    stmt.run(memo.id, encryptedJson, memo.createdAt, memo.updatedAt)
  }

  /**
   * 批量缓存备忘录
   * Cache multiple memos
   * 
   * @param memos - 要缓存的备忘录数组
   */
  async cacheMemos(memos: CachedMemo[]): Promise<void> {
    this.ensureInitialized()

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO memos (id, encrypted_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `)

    const insertMany = this.db!.transaction((items: CachedMemo[]) => {
      for (const memo of items) {
        const encryptedData = encrypt(JSON.stringify(memo), this.encryptionKey!)
        const encryptedJson = JSON.stringify(encryptedData)
        stmt.run(memo.id, encryptedJson, memo.createdAt, memo.updatedAt)
      }
    })

    insertMany(memos)
  }

  /**
   * 获取缓存的备忘录
   * Get a cached memo by ID
   * 
   * @param id - 备忘录 ID
   * @returns 备忘录或 null
   */
  async getCachedMemo(id: string): Promise<CachedMemo | null> {
    this.ensureInitialized()

    const stmt = this.db!.prepare('SELECT * FROM memos WHERE id = ?')
    const row = stmt.get(id) as StoredMemo | undefined

    if (!row) {
      return null
    }

    return this.decryptMemo(row)
  }

  /**
   * 获取所有缓存的备忘录
   * Get all cached memos
   * 
   * @returns 所有缓存的备忘录
   */
  async getAllCachedMemos(): Promise<CachedMemo[]> {
    this.ensureInitialized()

    const stmt = this.db!.prepare('SELECT * FROM memos ORDER BY updated_at DESC')
    const rows = stmt.all() as StoredMemo[]

    const memos: CachedMemo[] = []
    for (const row of rows) {
      try {
        const memo = this.decryptMemo(row)
        memos.push(memo)
      } catch (error) {
        // 跳过无法解密的记录
        console.error(`Failed to decrypt memo ${row.id}:`, error)
      }
    }

    return memos
  }

  /**
   * 解密存储的备忘录
   */
  private decryptMemo(row: StoredMemo): CachedMemo {
    const encryptedData: EncryptedData = JSON.parse(row.encrypted_data)
    const decryptedJson = decrypt(encryptedData, this.encryptionKey!)
    return JSON.parse(decryptedJson) as CachedMemo
  }

  /**
   * 删除缓存的备忘录
   * Delete a cached memo
   * 
   * @param id - 备忘录 ID
   */
  async deleteCachedMemo(id: string): Promise<void> {
    this.ensureInitialized()

    const stmt = this.db!.prepare('DELETE FROM memos WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 清空所有缓存
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized()

    this.db!.exec('DELETE FROM memos')
    this.db!.exec('DELETE FROM cache_meta')
  }

  /**
   * 获取缓存统计信息
   * Get cache statistics
   * 
   * @returns 缓存统计
   */
  async getStats(): Promise<CacheStats> {
    this.ensureInitialized()

    const countStmt = this.db!.prepare('SELECT COUNT(*) as count FROM memos')
    const countResult = countStmt.get() as { count: number }

    const sizeStmt = this.db!.prepare('SELECT SUM(LENGTH(encrypted_data)) as size FROM memos')
    const sizeResult = sizeStmt.get() as { size: number | null }

    const lastSyncStmt = this.db!.prepare("SELECT value FROM cache_meta WHERE key = 'last_sync_time'")
    const lastSyncResult = lastSyncStmt.get() as { value: string } | undefined

    return {
      totalMemos: countResult.count,
      totalSize: sizeResult.size || 0,
      lastSyncTime: lastSyncResult ? parseInt(lastSyncResult.value, 10) : null
    }
  }

  /**
   * 更新最后同步时间
   * Update last sync time
   * 
   * @param timestamp - 同步时间戳
   */
  async updateLastSyncTime(timestamp: number): Promise<void> {
    this.ensureInitialized()

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO cache_meta (key, value)
      VALUES ('last_sync_time', ?)
    `)
    stmt.run(timestamp.toString())
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 关闭数据库连接
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.initialized = false
    this.encryptionKey = null
  }

  /**
   * 销毁缓存（删除数据库文件）
   * Destroy the cache (delete database files)
   */
  destroy(): void {
    this.close()
    
    // 删除数据库文件
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath)
    }
    
    // 删除盐文件
    const saltPath = this.dbPath + '.salt'
    if (fs.existsSync(saltPath)) {
      fs.unlinkSync(saltPath)
    }
  }
}

// 导出单例实例
let cacheManagerInstance: CacheManager | null = null

/**
 * 获取缓存管理器实例
 */
export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager()
  }
  return cacheManagerInstance
}

/**
 * 重置缓存管理器实例（用于测试）
 */
export function resetCacheManager(): void {
  if (cacheManagerInstance) {
    cacheManagerInstance.close()
    cacheManagerInstance = null
  }
}
