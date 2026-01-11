/**
 * 服务器连接管理器
 * Manages server connection configuration, first-launch setup, and connection mode switching
 * 
 * Requirements: 8.1, 8.2, 8.5, 8.6
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type {
  ServerConnectionConfig,
  ServerValidationResult,
  ServerConnectionTestResult,
  ConnectionMode,
} from '../shared/types'
import { getEmbeddedServer } from './EmbeddedServer'

// 默认配置
const DEFAULT_CONFIG: ServerConnectionConfig = {
  connectionMode: 'remote',
  serverUrl: undefined,
  embeddedPort: 5170,
  isFirstLaunch: true,
  lastConnectedAt: undefined,
}

// URL 验证正则表达式
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

/**
 * 服务器连接管理器类
 */
export class ServerConnectionManager {
  private config: ServerConnectionConfig = { ...DEFAULT_CONFIG }
  private configPath: string
  private initialized = false

  constructor() {
    // 配置文件路径：存储在用户数据目录
    this.configPath = path.join(app.getPath('userData'), 'server-connection-config.json')
  }

  /**
   * 初始化服务器连接管理器
   */
  initialize(): void {
    if (this.initialized) return

    // 加载保存的配置
    const savedConfig = this.loadConfig()
    if (savedConfig) {
      this.config = savedConfig
    }

    this.initialized = true
    console.log('[ServerConnectionManager] Initialized with config:', {
      connectionMode: this.config.connectionMode,
      serverUrl: this.config.serverUrl,
      isFirstLaunch: this.config.isFirstLaunch,
    })
  }

  /**
   * 检查是否是首次启动
   * 需求 8.1: 首次启动时提示用户选择连接模式
   */
  isFirstLaunch(): boolean {
    return this.config.isFirstLaunch
  }

  /**
   * 完成首次启动设置
   * 需求 8.1: 保存用户选择
   */
  completeSetup(): void {
    this.config.isFirstLaunch = false
    this.saveConfig()
    console.log('[ServerConnectionManager] First launch setup completed')
  }

  /**
   * 获取当前配置
   */
  getConfig(): ServerConnectionConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  setConfig(newConfig: Partial<ServerConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.saveConfig()
  }

  /**
   * 获取当前连接模式
   */
  getConnectionMode(): ConnectionMode {
    return this.config.connectionMode
  }

  /**
   * 获取服务器 URL
   */
  getServerUrl(): string | undefined {
    return this.config.serverUrl
  }

  /**
   * 获取内置服务器端口
   */
  getEmbeddedPort(): number {
    return this.config.embeddedPort || 5170
  }

  /**
   * 验证服务器 URL 格式
   * 需求 8.2: 验证服务器 URL
   */
  validateUrl(url: string): ServerValidationResult {
    if (!url || typeof url !== 'string') {
      return {
        valid: false,
        error: 'URL 不能为空',
      }
    }

    const trimmedUrl = url.trim()

    // 检查 URL 格式
    if (!URL_REGEX.test(trimmedUrl)) {
      return {
        valid: false,
        error: 'URL 格式无效，请输入有效的 HTTP 或 HTTPS 地址',
      }
    }

    // 规范化 URL（移除末尾斜杠）
    let normalizedUrl = trimmedUrl
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1)
    }

    // 需求 9.3: 检查是否使用 HTTPS（远程服务器应使用 HTTPS）
    const isLocalhost = normalizedUrl.includes('localhost') || normalizedUrl.includes('127.0.0.1')
    if (!isLocalhost && !normalizedUrl.startsWith('https://')) {
      return {
        valid: false,
        error: '远程服务器必须使用 HTTPS 协议',
      }
    }

    return {
      valid: true,
      normalizedUrl,
    }
  }

  /**
   * 测试服务器连接
   * 需求 8.2: 实现连接测试
   */
  async testConnection(url: string): Promise<ServerConnectionTestResult> {
    const validation = this.validateUrl(url)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      }
    }

    const testUrl = validation.normalizedUrl!
    const startTime = Date.now()

    try {
      // 使用 fetch 测试健康检查端点
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 秒超时

      const response = await fetch(`${testUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const latency = Date.now() - startTime

      if (!response.ok) {
        return {
          success: false,
          latency,
          error: `服务器返回错误状态: ${response.status}`,
        }
      }

      const data = await response.json()
      
      if (data.success && data.data) {
        return {
          success: true,
          latency,
          version: data.data.version,
        }
      }

      return {
        success: false,
        latency,
        error: '服务器响应格式无效',
      }
    } catch (error) {
      const latency = Date.now() - startTime
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            latency,
            error: '连接超时，请检查服务器地址是否正确',
          }
        }
        
        // 处理网络错误
        if (error.message.includes('fetch')) {
          return {
            success: false,
            latency,
            error: '无法连接到服务器，请检查网络和服务器地址',
          }
        }

        return {
          success: false,
          latency,
          error: error.message,
        }
      }

      return {
        success: false,
        latency,
        error: '连接测试失败',
      }
    }
  }

  /**
   * 切换连接模式
   * 需求 8.5: 在设置中切换连接模式
   * 需求 8.6: 处理服务器不可达情况
   */
  async switchMode(mode: ConnectionMode, serverUrl?: string): Promise<boolean> {
    const embeddedServer = getEmbeddedServer()
    
    if (mode === 'remote') {
      if (!serverUrl) {
        console.error('[ServerConnectionManager] Remote mode requires server URL')
        return false
      }

      // 验证并测试连接
      const testResult = await this.testConnection(serverUrl)
      if (!testResult.success) {
        console.error('[ServerConnectionManager] Connection test failed:', testResult.error)
        // 需求 8.6: 返回失败，让调用者处理（提供切换到离线模式或重试的选项）
        return false
      }

      // 如果之前是内置服务器模式，停止内置服务器
      if (this.config.connectionMode === 'embedded' && embeddedServer.isServerRunning()) {
        console.log('[ServerConnectionManager] Stopping embedded server before switching to remote mode')
        await embeddedServer.stop()
      }

      // 更新配置
      const validation = this.validateUrl(serverUrl)
      this.config.connectionMode = 'remote'
      this.config.serverUrl = validation.normalizedUrl
      this.config.lastConnectedAt = Date.now()
      this.saveConfig()

      console.log('[ServerConnectionManager] Switched to remote mode:', validation.normalizedUrl)
      return true
    } else {
      // 切换到内置服务器模式
      // 需求 8.3: 启动内置服务器
      try {
        if (!embeddedServer.isServerRunning()) {
          const port = this.config.embeddedPort || 5170
          console.log('[ServerConnectionManager] Starting embedded server on port', port)
          await embeddedServer.start(port)
        }

        this.config.connectionMode = 'embedded'
        this.config.serverUrl = embeddedServer.getUrl()
        this.config.lastConnectedAt = Date.now()
        this.saveConfig()

        console.log('[ServerConnectionManager] Switched to embedded mode')
        return true
      } catch (error) {
        console.error('[ServerConnectionManager] Failed to start embedded server:', error)
        return false
      }
    }
  }

  /**
   * 获取当前有效的服务器 URL
   * 根据连接模式返回远程服务器 URL 或内置服务器 URL
   */
  getEffectiveServerUrl(): string | undefined {
    if (this.config.connectionMode === 'embedded') {
      const embeddedServer = getEmbeddedServer()
      return embeddedServer.getUrl()
    }
    return this.config.serverUrl
  }

  /**
   * 确保服务器可用
   * 如果是内置模式且服务器未运行，则启动服务器
   */
  async ensureServerAvailable(): Promise<boolean> {
    if (this.config.connectionMode === 'embedded') {
      const embeddedServer = getEmbeddedServer()
      if (!embeddedServer.isServerRunning()) {
        try {
          const port = this.config.embeddedPort || 5170
          await embeddedServer.start(port)
          return true
        } catch (error) {
          console.error('[ServerConnectionManager] Failed to start embedded server:', error)
          return false
        }
      }
      return true
    } else {
      // 远程模式：测试连接
      if (!this.config.serverUrl) {
        return false
      }
      const testResult = await this.testConnection(this.config.serverUrl)
      return testResult.success
    }
  }

  /**
   * 保存配置到文件
   */
  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (error) {
      console.error('[ServerConnectionManager] Failed to save config:', error)
    }
  }

  /**
   * 从文件加载配置
   */
  private loadConfig(): ServerConnectionConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const config = JSON.parse(data) as ServerConnectionConfig

        // 验证配置数据
        if (this.isValidConfig(config)) {
          return config
        }
      }
    } catch (error) {
      console.error('[ServerConnectionManager] Failed to load config:', error)
    }
    return null
  }

  /**
   * 验证配置数据是否有效
   */
  private isValidConfig(config: unknown): config is ServerConnectionConfig {
    if (!config || typeof config !== 'object') return false
    const c = config as Record<string, unknown>
    
    // 验证必需字段
    if (c.connectionMode !== 'remote' && c.connectionMode !== 'embedded') {
      return false
    }
    
    if (typeof c.isFirstLaunch !== 'boolean') {
      return false
    }

    // 如果是远程模式，验证 URL
    if (c.connectionMode === 'remote' && c.serverUrl) {
      const validation = this.validateUrl(c.serverUrl as string)
      if (!validation.valid) {
        return false
      }
    }

    return true
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.saveConfig()
    console.log('[ServerConnectionManager] Reset to default config')
  }
}

// 单例实例
let serverConnectionManager: ServerConnectionManager | null = null

/**
 * 获取服务器连接管理器实例
 */
export function getServerConnectionManager(): ServerConnectionManager {
  if (!serverConnectionManager) {
    serverConnectionManager = new ServerConnectionManager()
    serverConnectionManager.initialize()
  }
  return serverConnectionManager
}

/**
 * 重置服务器连接管理器（仅用于测试）
 */
export function resetServerConnectionManager(): void {
  serverConnectionManager = null
}
