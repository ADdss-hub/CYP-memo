/**
 * 冲突解决器
 * Conflict Resolver for handling sync conflicts
 * 
 * 需求: 4.5 - 如果发生同步冲突，则桌面客户端应提示用户选择保留哪个版本
 */

import { BrowserWindow, dialog } from 'electron'
import type { SyncConflict } from '../shared/types'

/**
 * 冲突解决选项
 */
export type ConflictResolution = 'local' | 'remote' | 'merge'

/**
 * 冲突解决结果
 */
export interface ConflictResolutionResult {
  entityId: string
  resolution: ConflictResolution
  mergedData?: unknown
}

/**
 * 冲突解决器配置
 */
export interface ConflictResolverConfig {
  /** 是否自动解决冲突（使用最新版本） */
  autoResolve?: boolean
  /** 自动解决策略 */
  autoResolveStrategy?: 'local' | 'remote' | 'newest'
}

/**
 * 冲突解决回调类型
 */
export type ConflictResolveCallback = (result: ConflictResolutionResult) => void

/**
 * 冲突解决器类
 * 处理同步冲突的检测和解决
 */
export class ConflictResolver {
  private config: Required<ConflictResolverConfig>
  private pendingConflicts: Map<string, SyncConflict> = new Map()
  private resolveCallbacks: Set<ConflictResolveCallback> = new Set()

  constructor(config?: ConflictResolverConfig) {
    this.config = {
      autoResolve: config?.autoResolve ?? false,
      autoResolveStrategy: config?.autoResolveStrategy ?? 'newest',
    }
  }

  /**
   * 检测数据版本冲突
   * @param localData - 本地数据
   * @param remoteData - 远程数据
   * @returns 是否存在冲突
   */
  detectConflict(
    localData: { version: number; updatedAt: number },
    remoteData: { version: number; updatedAt: number }
  ): boolean {
    // 如果版本号不同且本地版本不是远程版本的直接后继，则存在冲突
    if (localData.version !== remoteData.version) {
      // 检查是否是简单的版本递增（无冲突）
      if (localData.version === remoteData.version + 1) {
        return false // 本地是远程的后继版本，无冲突
      }
      if (remoteData.version === localData.version + 1) {
        return false // 远程是本地的后继版本，无冲突
      }
      return true // 版本分叉，存在冲突
    }
    return false
  }

  /**
   * 添加待解决的冲突
   * @param conflict - 冲突信息
   */
  addConflict(conflict: SyncConflict): void {
    this.pendingConflicts.set(conflict.entityId, conflict)
  }

  /**
   * 获取待解决的冲突
   * @param entityId - 实体 ID
   */
  getConflict(entityId: string): SyncConflict | undefined {
    return this.pendingConflicts.get(entityId)
  }

  /**
   * 获取所有待解决的冲突
   */
  getAllConflicts(): SyncConflict[] {
    return Array.from(this.pendingConflicts.values())
  }

  /**
   * 获取待解决冲突数量
   */
  getConflictCount(): number {
    return this.pendingConflicts.size
  }

  /**
   * 解决冲突
   * @param entityId - 实体 ID
   * @param resolution - 解决方案
   * @param mergedData - 合并后的数据（仅当 resolution 为 'merge' 时使用）
   */
  async resolveConflict(
    entityId: string,
    resolution: ConflictResolution,
    mergedData?: unknown
  ): Promise<ConflictResolutionResult> {
    const conflict = this.pendingConflicts.get(entityId)
    if (!conflict) {
      throw new Error(`No conflict found for entity ${entityId}`)
    }

    const result: ConflictResolutionResult = {
      entityId,
      resolution,
      mergedData,
    }

    // 从待解决列表中移除
    this.pendingConflicts.delete(entityId)

    // 通知回调
    this.notifyResolution(result)

    return result
  }

  /**
   * 自动解决冲突
   * @param conflict - 冲突信息
   */
  async autoResolveConflict(conflict: SyncConflict): Promise<ConflictResolutionResult> {
    let resolution: ConflictResolution

    switch (this.config.autoResolveStrategy) {
      case 'local':
        resolution = 'local'
        break
      case 'remote':
        resolution = 'remote'
        break
      case 'newest':
      default:
        // 比较更新时间，选择最新的版本
        const localTime = (conflict.localVersion as { updatedAt?: number })?.updatedAt ?? 0
        const remoteTime = (conflict.remoteVersion as { updatedAt?: number })?.updatedAt ?? 0
        resolution = localTime >= remoteTime ? 'local' : 'remote'
        break
    }

    return this.resolveConflict(conflict.entityId, resolution)
  }

  /**
   * 显示冲突解决对话框
   * @param conflict - 冲突信息
   * @param parentWindow - 父窗口
   */
  async showConflictDialog(
    conflict: SyncConflict,
    parentWindow?: BrowserWindow | null
  ): Promise<ConflictResolution> {
    const localTime = (conflict.localVersion as { updatedAt?: number })?.updatedAt
    const remoteTime = (conflict.remoteVersion as { updatedAt?: number })?.updatedAt

    const localTimeStr = localTime ? new Date(localTime).toLocaleString() : '未知'
    const remoteTimeStr = remoteTime ? new Date(remoteTime).toLocaleString() : '未知'

    const result = await dialog.showMessageBox(parentWindow ?? undefined as any, {
      type: 'question',
      title: '同步冲突',
      message: `检测到数据冲突`,
      detail: `本地版本更新时间: ${localTimeStr}\n远程版本更新时间: ${remoteTimeStr}\n\n请选择要保留的版本:`,
      buttons: ['保留本地版本', '使用远程版本', '取消'],
      defaultId: 0,
      cancelId: 2,
    })

    switch (result.response) {
      case 0:
        return 'local'
      case 1:
        return 'remote'
      default:
        throw new Error('User cancelled conflict resolution')
    }
  }

  /**
   * 处理冲突（自动或手动）
   * @param conflict - 冲突信息
   * @param parentWindow - 父窗口（用于显示对话框）
   */
  async handleConflict(
    conflict: SyncConflict,
    parentWindow?: BrowserWindow | null
  ): Promise<ConflictResolutionResult> {
    this.addConflict(conflict)

    if (this.config.autoResolve) {
      return this.autoResolveConflict(conflict)
    }

    const resolution = await this.showConflictDialog(conflict, parentWindow)
    return this.resolveConflict(conflict.entityId, resolution)
  }

  /**
   * 批量处理冲突
   * @param conflicts - 冲突列表
   * @param parentWindow - 父窗口
   */
  async handleConflicts(
    conflicts: SyncConflict[],
    parentWindow?: BrowserWindow | null
  ): Promise<ConflictResolutionResult[]> {
    const results: ConflictResolutionResult[] = []

    for (const conflict of conflicts) {
      try {
        const result = await this.handleConflict(conflict, parentWindow)
        results.push(result)
      } catch (error) {
        // 用户取消或发生错误，跳过此冲突
        console.error(`Failed to resolve conflict for ${conflict.entityId}:`, error)
      }
    }

    return results
  }

  /**
   * 注册冲突解决回调
   */
  onConflictResolved(callback: ConflictResolveCallback): () => void {
    this.resolveCallbacks.add(callback)
    return () => {
      this.resolveCallbacks.delete(callback)
    }
  }

  /**
   * 通知冲突解决
   */
  private notifyResolution(result: ConflictResolutionResult): void {
    for (const callback of this.resolveCallbacks) {
      try {
        callback(result)
      } catch (error) {
        console.error('Error in conflict resolution callback:', error)
      }
    }
  }

  /**
   * 清除所有待解决的冲突
   */
  clearConflicts(): void {
    this.pendingConflicts.clear()
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ConflictResolverConfig>): void {
    if (config.autoResolve !== undefined) {
      this.config.autoResolve = config.autoResolve
    }
    if (config.autoResolveStrategy !== undefined) {
      this.config.autoResolveStrategy = config.autoResolveStrategy
    }
  }

  /**
   * 获取配置
   */
  getConfig(): ConflictResolverConfig {
    return { ...this.config }
  }
}

// 导出单例实例
let conflictResolverInstance: ConflictResolver | null = null

/**
 * 获取冲突解决器实例
 */
export function getConflictResolver(): ConflictResolver {
  if (!conflictResolverInstance) {
    conflictResolverInstance = new ConflictResolver()
  }
  return conflictResolverInstance
}

/**
 * 重置冲突解决器实例（用于测试）
 */
export function resetConflictResolver(): void {
  if (conflictResolverInstance) {
    conflictResolverInstance.clearConflicts()
    conflictResolverInstance = null
  }
}
