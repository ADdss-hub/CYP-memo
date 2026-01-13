/**
 * 登出管理器
 * Logout Manager for handling user logout cleanup
 * 
 * 清除所有用户缓存数据
 * Clears all user cached data on logout
 * 
 * 需求: 5.5 - 当用户登出时，桌面客户端应清除所有缓存的用户数据
 */

import { getCacheManager, resetCacheManager } from './CacheManager.js'
import { credentialManager } from './CredentialManager.js'

/**
 * 登出清理选项
 */
export interface LogoutCleanupOptions {
  /** 是否清除缓存数据 (默认: true) */
  clearCache?: boolean
  /** 是否清除凭证 (默认: true) */
  clearCredentials?: boolean
  /** 凭证服务名称 (用于清除特定服务的凭证) */
  credentialService?: string
  /** 凭证账户名称 */
  credentialAccount?: string
}

/**
 * 登出清理结果
 */
export interface LogoutCleanupResult {
  /** 是否成功 */
  success: boolean
  /** 清除的缓存数量 */
  clearedCacheCount: number
  /** 是否清除了凭证 */
  clearedCredentials: boolean
  /** 错误信息 (如果有) */
  errors: string[]
}

/**
 * 登出管理器类
 * 处理用户登出时的所有清理工作
 */
export class LogoutManager {
  private static instance: LogoutManager | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): LogoutManager {
    if (!LogoutManager.instance) {
      LogoutManager.instance = new LogoutManager()
    }
    return LogoutManager.instance
  }

  /**
   * 执行登出清理
   * Perform logout cleanup
   * 
   * @param options - 清理选项
   * @returns 清理结果
   */
  async performLogoutCleanup(options: LogoutCleanupOptions = {}): Promise<LogoutCleanupResult> {
    const {
      clearCache = true,
      clearCredentials = true,
      credentialService = 'cyp-memo',
      credentialAccount
    } = options

    const result: LogoutCleanupResult = {
      success: true,
      clearedCacheCount: 0,
      clearedCredentials: false,
      errors: []
    }

    // 清除缓存数据
    if (clearCache) {
      try {
        const cacheManager = getCacheManager()
        if (cacheManager.isInitialized()) {
          // 获取缓存统计以记录清除的数量
          const stats = await cacheManager.getStats()
          result.clearedCacheCount = stats.totalMemos

          // 清除所有缓存
          await cacheManager.clearAll()
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown cache clear error'
        result.errors.push(`Cache clear failed: ${errorMessage}`)
        result.success = false
      }
    }

    // 清除凭证
    if (clearCredentials && credentialAccount) {
      try {
        const deleted = await credentialManager.deleteCredential(credentialService, credentialAccount)
        result.clearedCredentials = deleted
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown credential clear error'
        result.errors.push(`Credential clear failed: ${errorMessage}`)
        // 凭证清除失败不影响整体成功状态
      }
    }

    return result
  }

  /**
   * 清除所有缓存数据
   * Clear all cached data
   * 
   * @returns 是否成功
   */
  async clearAllCache(): Promise<boolean> {
    try {
      const cacheManager = getCacheManager()
      if (cacheManager.isInitialized()) {
        await cacheManager.clearAll()
      }
      return true
    } catch (error) {
      console.error('Failed to clear cache:', error)
      return false
    }
  }

  /**
   * 完全重置缓存管理器
   * Completely reset the cache manager (close and destroy)
   * 
   * @param destroyFiles - 是否删除数据库文件
   */
  async resetCache(destroyFiles: boolean = false): Promise<void> {
    const cacheManager = getCacheManager()
    
    if (destroyFiles) {
      cacheManager.destroy()
    } else {
      cacheManager.close()
    }
    
    resetCacheManager()
  }

  /**
   * 清除特定用户的凭证
   * Clear credentials for a specific user
   * 
   * @param service - 服务名称
   * @param account - 账户名称
   * @returns 是否成功
   */
  async clearUserCredentials(service: string, account: string): Promise<boolean> {
    try {
      return await credentialManager.deleteCredential(service, account)
    } catch (error) {
      console.error('Failed to clear credentials:', error)
      return false
    }
  }
}

// 导出单例实例
export const logoutManager = LogoutManager.getInstance()
