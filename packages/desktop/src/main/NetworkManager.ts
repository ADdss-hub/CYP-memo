/**
 * 网络状态管理器
 * Network Manager for detecting and monitoring network connectivity
 * 
 * 需求: 4.1 - 当桌面客户端检测到无网络连接时，离线模式应自动激活
 */

import { net } from 'electron'

/**
 * 网络状态变化回调类型
 */
export type NetworkStatusCallback = (isOnline: boolean) => void

/**
 * 网络管理器配置
 */
export interface NetworkManagerConfig {
  /** 检查间隔（毫秒），默认 30000 (30秒) */
  checkInterval?: number
  /** 用于检测网络的 URL，默认使用 DNS 检查 */
  checkUrl?: string
  /** 超时时间（毫秒），默认 5000 (5秒) */
  timeout?: number
}

/**
 * 网络状态管理器类
 * 监听网络连接状态变化并自动切换离线模式
 */
export class NetworkManager {
  private isOnlineStatus = true
  private callbacks: Set<NetworkStatusCallback> = new Set()
  private checkIntervalId: NodeJS.Timeout | null = null
  private config: Required<NetworkManagerConfig>
  private initialized = false

  constructor(config?: NetworkManagerConfig) {
    this.config = {
      checkInterval: config?.checkInterval ?? 30000,
      checkUrl: config?.checkUrl ?? 'https://www.google.com',
      timeout: config?.timeout ?? 5000,
    }
  }

  /**
   * 初始化网络管理器
   * 开始监听网络状态变化
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    // 初始检查网络状态
    this.checkNetworkStatus()

    // 设置定期检查
    this.checkIntervalId = setInterval(() => {
      this.checkNetworkStatus()
    }, this.config.checkInterval)

    this.initialized = true
  }

  /**
   * 检查当前网络状态
   * 使用 Electron 的 net 模块检测网络连接
   */
  async checkNetworkStatus(): Promise<boolean> {
    try {
      // 使用 Electron 的 net.isOnline() 进行基本检查
      const electronOnline = net.isOnline()
      
      if (!electronOnline) {
        this.updateOnlineStatus(false)
        return false
      }

      // 进行实际的网络请求验证
      const isReachable = await this.performNetworkCheck()
      this.updateOnlineStatus(isReachable)
      return isReachable
    } catch {
      this.updateOnlineStatus(false)
      return false
    }
  }

  /**
   * 执行网络连接检查
   * 通过发送 HEAD 请求验证网络可达性
   */
  private async performNetworkCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false)
      }, this.config.timeout)

      try {
        const request = net.request({
          method: 'HEAD',
          url: this.config.checkUrl,
        })

        request.on('response', () => {
          clearTimeout(timeoutId)
          resolve(true)
        })

        request.on('error', () => {
          clearTimeout(timeoutId)
          resolve(false)
        })

        request.end()
      } catch {
        clearTimeout(timeoutId)
        resolve(false)
      }
    })
  }

  /**
   * 更新在线状态并通知监听器
   */
  private updateOnlineStatus(isOnline: boolean): void {
    const previousStatus = this.isOnlineStatus
    this.isOnlineStatus = isOnline

    // 只在状态变化时通知
    if (previousStatus !== isOnline) {
      this.notifyStatusChange(isOnline)
    }
  }

  /**
   * 通知所有监听器状态变化
   */
  private notifyStatusChange(isOnline: boolean): void {
    for (const callback of this.callbacks) {
      try {
        callback(isOnline)
      } catch (error) {
        console.error('Error in network status callback:', error)
      }
    }
  }

  /**
   * 获取当前网络状态
   * @returns 是否在线
   */
  isOnline(): boolean {
    return this.isOnlineStatus
  }

  /**
   * 注册网络状态变化监听器
   * @param callback - 状态变化回调函数
   * @returns 取消注册的函数
   */
  onNetworkChange(callback: NetworkStatusCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * 移除网络状态变化监听器
   * @param callback - 要移除的回调函数
   */
  removeNetworkChangeListener(callback: NetworkStatusCallback): void {
    this.callbacks.delete(callback)
  }

  /**
   * 强制设置在线状态（用于测试）
   * @param isOnline - 在线状态
   */
  setOnlineStatus(isOnline: boolean): void {
    this.updateOnlineStatus(isOnline)
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 销毁网络管理器
   * 清理定时器和监听器
   */
  destroy(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId)
      this.checkIntervalId = null
    }
    this.callbacks.clear()
    this.initialized = false
  }
}

// 导出单例实例
let networkManagerInstance: NetworkManager | null = null

/**
 * 获取网络管理器实例
 */
export function getNetworkManager(): NetworkManager {
  if (!networkManagerInstance) {
    networkManagerInstance = new NetworkManager()
  }
  return networkManagerInstance
}

/**
 * 重置网络管理器实例（用于测试）
 */
export function resetNetworkManager(): void {
  if (networkManagerInstance) {
    networkManagerInstance.destroy()
    networkManagerInstance = null
  }
}
