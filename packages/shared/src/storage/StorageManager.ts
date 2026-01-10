/**
 * CYP-memo 存储管理器
 * 统一管理存储适配器的创建和切换
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { IStorageAdapter, StorageConfig, StorageMode } from './StorageAdapter'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import { RemoteStorageAdapter } from './RemoteStorageAdapter'

/**
 * 存储配置键名（用于 localStorage）
 */
const STORAGE_CONFIG_KEY = 'cyp-memo-storage-config'

/**
 * 默认存储配置
 */
const DEFAULT_CONFIG: StorageConfig = {
  mode: 'local',
}

/**
 * 存储管理器
 * 负责创建、管理和切换存储适配器
 */
class StorageManager {
  private adapter: IStorageAdapter | null = null
  private config: StorageConfig = DEFAULT_CONFIG
  private initialized = false

  /**
   * 获取当前存储适配器
   */
  getAdapter(): IStorageAdapter {
    if (!this.adapter) {
      throw new Error('存储管理器未初始化，请先调用 initialize()')
    }
    return this.adapter
  }

  /**
   * 获取当前存储模式
   */
  getMode(): StorageMode {
    return this.config.mode
  }

  /**
   * 获取当前配置
   */
  getConfig(): StorageConfig {
    return { ...this.config }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 初始化存储管理器
   * 从 localStorage 读取配置，或使用默认配置
   */
  async initialize(config?: StorageConfig): Promise<void> {
    if (this.initialized && !config) {
      return
    }

    // 如果提供了配置，使用提供的配置
    // 否则尝试从 localStorage 读取
    if (config) {
      this.config = config
    } else {
      this.loadConfig()
    }

    // 创建适配器
    this.adapter = this.createAdapter(this.config)
    
    // 初始化适配器
    await this.adapter.initialize()
    
    this.initialized = true
  }

  /**
   * 切换存储模式
   * 注意：切换模式不会自动迁移数据
   */
  async switchMode(config: StorageConfig): Promise<void> {
    // 保存配置
    this.config = config
    this.saveConfig()

    // 创建新适配器
    const newAdapter = this.createAdapter(config)
    await newAdapter.initialize()

    this.adapter = newAdapter
  }

  /**
   * 迁移数据到新存储
   * @param targetConfig 目标存储配置
   */
  async migrateData(targetConfig: StorageConfig): Promise<void> {
    if (!this.adapter) {
      throw new Error('存储管理器未初始化')
    }

    // 导出当前数据
    const data = await this.adapter.exportAllData()

    // 创建目标适配器
    const targetAdapter = this.createAdapter(targetConfig)
    await targetAdapter.initialize()

    // 导入数据到目标存储
    await targetAdapter.importData(data)

    // 切换到目标适配器
    this.adapter = targetAdapter
    this.config = targetConfig
    this.saveConfig()
  }

  /**
   * 创建存储适配器
   */
  private createAdapter(config: StorageConfig): IStorageAdapter {
    switch (config.mode) {
      case 'local':
        return new LocalStorageAdapter()
      case 'remote':
        return new RemoteStorageAdapter(config)
      default:
        throw new Error(`不支持的存储模式: ${config.mode}`)
    }
  }

  /**
   * 从 localStorage 加载配置
   */
  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY)
      if (saved) {
        this.config = JSON.parse(saved)
      }
    } catch {
      // 解析失败，使用默认配置
      this.config = DEFAULT_CONFIG
    }
  }

  /**
   * 保存配置到 localStorage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(this.config))
    } catch {
      console.warn('无法保存存储配置到 localStorage')
    }
  }

  /**
   * 测试远程连接
   */
  async testRemoteConnection(apiUrl: string, apiKey?: string): Promise<boolean> {
    try {
      const testAdapter = new RemoteStorageAdapter({
        mode: 'remote',
        apiUrl,
        apiKey,
      })
      await testAdapter.initialize()
      return true
    } catch {
      return false
    }
  }
}

/**
 * 存储管理器单例
 */
export const storageManager = new StorageManager()

/**
 * 获取当前存储适配器的便捷方法
 */
export function getStorage(): IStorageAdapter {
  return storageManager.getAdapter()
}
