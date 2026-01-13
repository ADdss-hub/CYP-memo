/**
 * 启动加载器
 * Startup Loader for cache-first data loading
 * 
 * 需求: 4.6, 5.3 - 启动时缓存优先加载
 * - 当桌面客户端启动时，主进程应在尝试连接服务器之前加载缓存数据
 * - 当桌面客户端启动时，渲染进程应在从服务器获取更新的同时显示缓存数据
 */

import { BrowserWindow } from 'electron'
import { getCacheManager, type CacheManager } from './CacheManager.js'
import { getSyncManager, type SyncManager } from './SyncManager.js'
import { getNetworkManager, type NetworkManager } from './NetworkManager.js'
import type { CachedMemo, SyncResult } from '../shared/types.js'

/**
 * 启动加载状态
 */
export interface StartupLoadState {
  /** 是否正在加载 */
  loading: boolean
  /** 缓存数据是否已加载 */
  cacheLoaded: boolean
  /** 服务器数据是否已同步 */
  serverSynced: boolean
  /** 缓存的备忘录数量 */
  cachedMemoCount: number
  /** 同步结果 */
  syncResult?: SyncResult
  /** 错误信息 */
  error?: string
}

/**
 * 启动加载器配置
 */
export interface StartupLoaderConfig {
  /** 缓存管理器 */
  cacheManager?: CacheManager
  /** 同步管理器 */
  syncManager?: SyncManager
  /** 网络管理器 */
  networkManager?: NetworkManager
  /** 是否在后台自动同步 */
  autoSync?: boolean
  /** 同步延迟（毫秒） */
  syncDelay?: number
}

/**
 * 加载进度回调
 */
export type LoadProgressCallback = (state: StartupLoadState) => void

/**
 * 启动加载器类
 * 实现缓存优先加载策略
 */
export class StartupLoader {
  private cacheManager: CacheManager
  private syncManager: SyncManager
  private networkManager: NetworkManager
  private config: Required<Omit<StartupLoaderConfig, 'cacheManager' | 'syncManager' | 'networkManager'>>
  private state: StartupLoadState
  private progressCallbacks: Set<LoadProgressCallback> = new Set()
  private mainWindow: BrowserWindow | null = null

  constructor(config?: StartupLoaderConfig) {
    this.cacheManager = config?.cacheManager || getCacheManager()
    this.syncManager = config?.syncManager || getSyncManager()
    this.networkManager = config?.networkManager || getNetworkManager()
    this.config = {
      autoSync: config?.autoSync ?? true,
      syncDelay: config?.syncDelay ?? 1000,
    }
    this.state = {
      loading: false,
      cacheLoaded: false,
      serverSynced: false,
      cachedMemoCount: 0,
    }
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * 执行启动加载
   * 1. 先加载缓存数据
   * 2. 通知渲染进程显示缓存数据
   * 3. 后台获取服务器更新
   */
  async load(): Promise<StartupLoadState> {
    this.updateState({ loading: true, error: undefined })

    try {
      // 步骤 1: 加载缓存数据
      const cachedMemos = await this.loadCachedData()
      this.updateState({
        cacheLoaded: true,
        cachedMemoCount: cachedMemos.length,
      })

      // 步骤 2: 通知渲染进程显示缓存数据
      this.notifyRenderer('cache-loaded', { memos: cachedMemos })

      // 步骤 3: 后台同步（如果启用且在线）
      if (this.config.autoSync && this.networkManager.isOnline()) {
        // 延迟同步，让 UI 先显示缓存数据
        setTimeout(() => {
          this.syncInBackground().catch(console.error)
        }, this.config.syncDelay)
      }

      this.updateState({ loading: false })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateState({
        loading: false,
        error: errorMessage,
      })
    }

    return this.getState()
  }

  /**
   * 加载缓存数据
   */
  private async loadCachedData(): Promise<CachedMemo[]> {
    if (!this.cacheManager.isInitialized()) {
      return []
    }

    try {
      return await this.cacheManager.getAllCachedMemos()
    } catch (error) {
      console.error('Failed to load cached data:', error)
      return []
    }
  }

  /**
   * 后台同步
   */
  private async syncInBackground(): Promise<void> {
    if (!this.syncManager.isInitialized()) {
      return
    }

    try {
      const result = await this.syncManager.sync()
      this.updateState({
        serverSynced: true,
        syncResult: result,
      })

      // 如果同步成功且有更新，通知渲染进程
      if (result.success && result.synced > 0) {
        const updatedMemos = await this.loadCachedData()
        this.notifyRenderer('sync-complete', {
          result,
          memos: updatedMemos,
        })
      } else if (result.conflicts.length > 0) {
        // 有冲突，通知渲染进程
        this.notifyRenderer('sync-conflicts', {
          conflicts: result.conflicts,
        })
      }
    } catch (error) {
      console.error('Background sync failed:', error)
      this.updateState({
        serverSynced: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      })
    }
  }

  /**
   * 手动触发同步
   */
  async manualSync(): Promise<SyncResult | null> {
    if (!this.syncManager.isInitialized()) {
      return null
    }

    if (!this.networkManager.isOnline()) {
      return {
        success: false,
        synced: 0,
        conflicts: [],
        errors: ['Network offline'],
      }
    }

    try {
      const result = await this.syncManager.sync()
      this.updateState({
        serverSynced: true,
        syncResult: result,
      })

      if (result.success) {
        const updatedMemos = await this.loadCachedData()
        this.notifyRenderer('sync-complete', {
          result,
          memos: updatedMemos,
        })
      }

      return result
    } catch (error) {
      console.error('Manual sync failed:', error)
      return {
        success: false,
        synced: 0,
        conflicts: [],
        errors: [error instanceof Error ? error.message : 'Sync failed'],
      }
    }
  }

  /**
   * 通知渲染进程
   */
  private notifyRenderer(event: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`startup:${event}`, data)
    }
  }

  /**
   * 更新状态
   */
  private updateState(partialState: Partial<StartupLoadState>): void {
    this.state = { ...this.state, ...partialState }
    this.notifyProgress()
  }

  /**
   * 通知进度回调
   */
  private notifyProgress(): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(this.getState())
      } catch (error) {
        console.error('Error in progress callback:', error)
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): StartupLoadState {
    return { ...this.state }
  }

  /**
   * 注册进度回调
   */
  onProgress(callback: LoadProgressCallback): () => void {
    this.progressCallbacks.add(callback)
    return () => {
      this.progressCallbacks.delete(callback)
    }
  }

  /**
   * 检查是否正在加载
   */
  isLoading(): boolean {
    return this.state.loading
  }

  /**
   * 检查缓存是否已加载
   */
  isCacheLoaded(): boolean {
    return this.state.cacheLoaded
  }

  /**
   * 检查是否已同步
   */
  isSynced(): boolean {
    return this.state.serverSynced
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      loading: false,
      cacheLoaded: false,
      serverSynced: false,
      cachedMemoCount: 0,
    }
    this.progressCallbacks.clear()
  }
}

// 导出单例实例
let startupLoaderInstance: StartupLoader | null = null

/**
 * 获取启动加载器实例
 */
export function getStartupLoader(): StartupLoader {
  if (!startupLoaderInstance) {
    startupLoaderInstance = new StartupLoader()
  }
  return startupLoaderInstance
}

/**
 * 重置启动加载器实例（用于测试）
 */
export function resetStartupLoader(): void {
  if (startupLoaderInstance) {
    startupLoaderInstance.reset()
    startupLoaderInstance = null
  }
}
