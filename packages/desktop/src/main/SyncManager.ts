/**
 * 同步管理器
 * Sync Manager for offline data synchronization
 * 
 * 需求: 4.2, 4.3, 4.4 - 离线模式支持
 * - 在离线模式下，桌面客户端应允许读取所有本地缓存的备忘录
 * - 在离线模式下，桌面客户端应允许创建和编辑备忘录并存储到本地
 * - 当网络连接恢复时，桌面客户端应将本地更改与远程服务器同步
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getNetworkManager, type NetworkManager } from './NetworkManager'
import type {
  SyncOperation,
  SyncConflict,
  SyncStatus,
  SyncResult,
  CachedMemo,
} from '../shared/types'

/**
 * 同步队列项（数据库存储格式）
 */
interface SyncQueueItem {
  id: string
  operation: 'create' | 'update' | 'delete'
  entity_type: 'memo' | 'tag' | 'file'
  entity_id: string
  data: string // JSON 序列化的数据
  created_at: number
  retry_count: number
}

/**
 * 同步管理器配置
 */
export interface SyncManagerConfig {
  /** 数据库文件路径 */
  dbPath?: string
  /** 服务器 URL */
  serverUrl?: string
  /** 最大重试次数 */
  maxRetries?: number
  /** 网络管理器实例 */
  networkManager?: NetworkManager
}

/**
 * 同步回调类型
 */
export type SyncCallback = (result: SyncResult) => void
export type ConflictCallback = (conflicts: SyncConflict[]) => void

/**
 * 同步管理器类
 * 管理离线数据与服务器的同步
 */
export class SyncManager {
  private db: Database.Database | null = null
  private dbPath: string
  private serverUrl: string
  private maxRetries: number
  private networkManager: NetworkManager
  private initialized = false
  private syncCallbacks: Set<SyncCallback> = new Set()
  private conflictCallbacks: Set<ConflictCallback> = new Set()
  private conflicts: SyncConflict[] = []
  private isSyncing = false
  private unsubscribeNetwork: (() => void) | null = null

  constructor(config?: SyncManagerConfig) {
    this.dbPath = config?.dbPath || this.getDefaultDbPath()
    this.serverUrl = config?.serverUrl || ''
    this.maxRetries = config?.maxRetries ?? 3
    this.networkManager = config?.networkManager || getNetworkManager()
  }

  /**
   * 获取默认数据库路径
   */
  private getDefaultDbPath(): string {
    try {
      const userDataPath = app.getPath('userData')
      return path.join(userDataPath, 'sync-queue.db')
    } catch {
      return path.join(process.cwd(), 'test-sync-queue.db')
    }
  }

  /**
   * 初始化同步管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // 确保目录存在
    const dbDir = path.dirname(this.dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // 初始化数据库
    this.db = new Database(this.dbPath)
    this.createTables()

    // 监听网络状态变化
    this.unsubscribeNetwork = this.networkManager.onNetworkChange((isOnline) => {
      if (isOnline) {
        // 网络恢复时自动同步
        this.sync().catch(console.error)
      }
    })

    this.initialized = true
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
      
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_version TEXT NOT NULL,
        remote_version TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('SyncManager not initialized. Call initialize() first.')
    }
  }

  /**
   * 检查网络状态
   */
  isOnline(): boolean {
    return this.networkManager.isOnline()
  }

  /**
   * 添加待同步操作
   * @param operation - 同步操作
   */
  async addPendingOperation(operation: SyncOperation): Promise<void> {
    this.ensureInitialized()

    const id = operation.id || this.generateId()
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO sync_queue (id, operation, entity_type, entity_id, data, created_at, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `)

    stmt.run(
      id,
      operation.type,
      operation.entityType,
      operation.entityId,
      JSON.stringify(operation.data),
      operation.timestamp || Date.now()
    )
  }

  /**
   * 获取待同步操作列表
   */
  async getPendingOperations(): Promise<SyncOperation[]> {
    this.ensureInitialized()

    const stmt = this.db!.prepare('SELECT * FROM sync_queue ORDER BY created_at ASC')
    const rows = stmt.all() as SyncQueueItem[]

    return rows.map((row) => ({
      id: row.id,
      type: row.operation as 'create' | 'update' | 'delete',
      entityType: row.entity_type as 'memo' | 'tag' | 'file',
      entityId: row.entity_id,
      data: JSON.parse(row.data),
      timestamp: row.created_at,
    }))
  }

  /**
   * 获取待同步操作数量
   */
  async getPendingCount(): Promise<number> {
    this.ensureInitialized()

    const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM sync_queue')
    const result = stmt.get() as { count: number }
    return result.count
  }

  /**
   * 执行同步
   */
  async sync(): Promise<SyncResult> {
    this.ensureInitialized()

    // 防止重复同步
    if (this.isSyncing) {
      return {
        success: false,
        synced: 0,
        conflicts: this.conflicts,
        errors: ['Sync already in progress'],
      }
    }

    // 检查网络状态
    if (!this.isOnline()) {
      return {
        success: false,
        synced: 0,
        conflicts: this.conflicts,
        errors: ['Network offline'],
      }
    }

    this.isSyncing = true
    const result: SyncResult = {
      success: true,
      synced: 0,
      conflicts: [],
      errors: [],
    }

    try {
      const operations = await this.getPendingOperations()

      for (const operation of operations) {
        try {
          const syncResult = await this.syncOperation(operation)
          
          if (syncResult.success) {
            // 同步成功，从队列中移除
            await this.removeOperation(operation.id)
            result.synced++
          } else if (syncResult.conflict) {
            // 发生冲突
            result.conflicts.push(syncResult.conflict)
            this.conflicts.push(syncResult.conflict)
          } else if (syncResult.error) {
            // 同步失败，增加重试计数
            await this.incrementRetryCount(operation.id)
            result.errors.push(syncResult.error)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Failed to sync operation ${operation.id}: ${errorMessage}`)
          await this.incrementRetryCount(operation.id)
        }
      }

      // 清理超过最大重试次数的操作
      await this.cleanupFailedOperations()

      // 通知监听器
      this.notifySyncComplete(result)
      
      if (result.conflicts.length > 0) {
        this.notifyConflicts(result.conflicts)
      }

    } finally {
      this.isSyncing = false
    }

    return result
  }

  /**
   * 同步单个操作
   */
  private async syncOperation(operation: SyncOperation): Promise<{
    success: boolean
    conflict?: SyncConflict
    error?: string
  }> {
    // 如果没有配置服务器 URL，模拟成功
    if (!this.serverUrl) {
      return { success: true }
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(operation),
      })

      if (response.ok) {
        return { success: true }
      }

      if (response.status === 409) {
        // 冲突
        const conflictData = await response.json()
        return {
          success: false,
          conflict: {
            localVersion: operation.data,
            remoteVersion: conflictData.remoteVersion,
            entityId: operation.entityId,
            entityType: operation.entityType,
          },
        }
      }

      return {
        success: false,
        error: `Server returned ${response.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  /**
   * 从队列中移除操作
   */
  private async removeOperation(id: string): Promise<void> {
    const stmt = this.db!.prepare('DELETE FROM sync_queue WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 增加重试计数
   */
  private async incrementRetryCount(id: string): Promise<void> {
    const stmt = this.db!.prepare('UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?')
    stmt.run(id)
  }

  /**
   * 清理超过最大重试次数的操作
   */
  private async cleanupFailedOperations(): Promise<void> {
    const stmt = this.db!.prepare('DELETE FROM sync_queue WHERE retry_count >= ?')
    stmt.run(this.maxRetries)
  }

  /**
   * 解决冲突
   * @param entityId - 实体 ID
   * @param resolution - 解决方案 ('local' | 'remote')
   */
  async resolveConflict(entityId: string, resolution: 'local' | 'remote'): Promise<void> {
    this.ensureInitialized()

    const conflictIndex = this.conflicts.findIndex((c) => c.entityId === entityId)
    if (conflictIndex === -1) {
      throw new Error(`Conflict not found for entity ${entityId}`)
    }

    const conflict = this.conflicts[conflictIndex]

    if (resolution === 'local') {
      // 保留本地版本，重新添加到同步队列
      await this.addPendingOperation({
        id: this.generateId(),
        type: 'update',
        entityType: conflict.entityType as 'memo' | 'tag' | 'file',
        entityId: conflict.entityId,
        data: conflict.localVersion,
        timestamp: Date.now(),
      })
    }
    // 如果选择 remote，不需要做任何事情，远程版本已经是最新的

    // 从冲突列表中移除
    this.conflicts.splice(conflictIndex, 1)

    // 从数据库中移除冲突记录
    const stmt = this.db!.prepare('DELETE FROM sync_conflicts WHERE entity_id = ?')
    stmt.run(entityId)
  }

  /**
   * 获取同步状态
   */
  async getStatus(): Promise<SyncStatus> {
    this.ensureInitialized()

    const pendingCount = await this.getPendingCount()
    
    // 获取最后同步时间
    const metaStmt = this.db!.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_time'")
    let lastSyncTime: number | null = null
    try {
      const result = metaStmt.get() as { value: string } | undefined
      lastSyncTime = result ? parseInt(result.value, 10) : null
    } catch {
      // 表可能不存在
    }

    return {
      isOnline: this.isOnline(),
      pendingOperations: pendingCount,
      lastSyncTime,
      conflicts: [...this.conflicts],
    }
  }

  /**
   * 更新最后同步时间
   */
  async updateLastSyncTime(timestamp: number): Promise<void> {
    this.ensureInitialized()

    // 确保 sync_meta 表存在
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO sync_meta (key, value)
      VALUES ('last_sync_time', ?)
    `)
    stmt.run(timestamp.toString())
  }

  /**
   * 注册同步完成回调
   */
  onSyncComplete(callback: SyncCallback): () => void {
    this.syncCallbacks.add(callback)
    return () => {
      this.syncCallbacks.delete(callback)
    }
  }

  /**
   * 注册冲突回调
   */
  onConflict(callback: ConflictCallback): () => void {
    this.conflictCallbacks.add(callback)
    return () => {
      this.conflictCallbacks.delete(callback)
    }
  }

  /**
   * 通知同步完成
   */
  private notifySyncComplete(result: SyncResult): void {
    for (const callback of this.syncCallbacks) {
      try {
        callback(result)
      } catch (error) {
        console.error('Error in sync callback:', error)
      }
    }
  }

  /**
   * 通知冲突
   */
  private notifyConflicts(conflicts: SyncConflict[]): void {
    for (const callback of this.conflictCallbacks) {
      try {
        callback(conflicts)
      } catch (error) {
        console.error('Error in conflict callback:', error)
      }
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 设置服务器 URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url
  }

  /**
   * 清空同步队列
   */
  async clearQueue(): Promise<void> {
    this.ensureInitialized()
    this.db!.exec('DELETE FROM sync_queue')
  }

  /**
   * 清空所有数据（包括冲突）
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized()
    this.db!.exec('DELETE FROM sync_queue')
    this.db!.exec('DELETE FROM sync_conflicts')
    this.conflicts = []
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork()
      this.unsubscribeNetwork = null
    }
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.initialized = false
    this.syncCallbacks.clear()
    this.conflictCallbacks.clear()
    this.conflicts = []
  }

  /**
   * 销毁同步管理器（删除数据库文件）
   */
  destroy(): void {
    this.close()
    
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath)
    }
  }
}

// 导出单例实例
let syncManagerInstance: SyncManager | null = null

/**
 * 获取同步管理器实例
 */
export function getSyncManager(): SyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager()
  }
  return syncManagerInstance
}

/**
 * 重置同步管理器实例（用于测试）
 */
export function resetSyncManager(): void {
  if (syncManagerInstance) {
    syncManagerInstance.close()
    syncManagerInstance = null
  }
}
