/**
 * 更新管理器
 * 管理应用的自动更新功能
 * 
 * 需求:
 * - 7.1: 启动时检查更新
 * - 7.2: 后台下载更新
 * - 7.3: 更新进度显示
 * - 7.4: 更新准备就绪提示
 * - 7.5: 下载失败重试（最多3次）
 * - 7.6: 代码签名验证
 * - 7.7: 定时检查更新（每小时）
 * - 7.8: 更新日志显示
 * 
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import pkg from 'electron-updater'
const { autoUpdater } = pkg
import type { UpdateCheckResult, UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater'
import { app } from 'electron'
import type { UpdateInfo } from '../shared/types.js'

// 最大重试次数
const MAX_RETRY_COUNT = 3

// 重试延迟（毫秒）
const RETRY_DELAY = 5000

// 默认检查间隔（1小时）
const DEFAULT_CHECK_INTERVAL = 60 * 60 * 1000

// 最小检查间隔（5分钟）
const MIN_CHECK_INTERVAL = 5 * 60 * 1000

export interface UpdateManagerCallbacks {
  onUpdateAvailable?: (info: UpdateInfo) => void
  onDownloadProgress?: (progress: number) => void
  onUpdateDownloaded?: () => void
  onError?: (error: Error) => void
  onCheckingForUpdate?: () => void
  onUpdateNotAvailable?: () => void
}

export interface UpdateManagerConfig {
  /** 检查间隔（毫秒） */
  checkInterval?: number
  /** 是否自动检查 */
  autoCheck?: boolean
  /** 是否自动下载 */
  autoDownload?: boolean
}

export class UpdateManager {
  private callbacks: UpdateManagerCallbacks = {}
  private config: UpdateManagerConfig
  private retryCount = 0
  private isDownloading = false
  private isChecking = false
  private updateAvailable = false
  private downloadedVersion: string | null = null
  private latestUpdateInfo: UpdateInfo | null = null
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private lastCheckTime: Date | null = null

  constructor(config: UpdateManagerConfig = {}) {
    this.config = {
      checkInterval: config.checkInterval || DEFAULT_CHECK_INTERVAL,
      autoCheck: config.autoCheck ?? true,
      autoDownload: config.autoDownload ?? false,
    }
    this.setupAutoUpdater()
  }

  /**
   * 配置 autoUpdater
   */
  private setupAutoUpdater(): void {
    // 禁用自动下载，手动控制下载流程（除非配置了自动下载）
    autoUpdater.autoDownload = this.config.autoDownload ?? false
    
    // 禁用自动安装，让用户选择安装时机
    autoUpdater.autoInstallOnAppQuit = true

    // 允许预发布版本（可配置）
    autoUpdater.allowPrerelease = false

    // 允许降级（通常不需要）
    autoUpdater.allowDowngrade = false

    // 设置日志级别
    autoUpdater.logger = {
      info: (message: string) => console.log('[UpdateManager]', message),
      warn: (message: string) => console.warn('[UpdateManager]', message),
      error: (message: string) => console.error('[UpdateManager]', message),
      debug: (message: string) => console.log('[UpdateManager:debug]', message),
    }

    // 设置事件监听
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateManager] Checking for updates...')
      this.isChecking = true
      this.callbacks.onCheckingForUpdate?.()
    })

    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      console.log('[UpdateManager] Update available:', info.version)
      this.isChecking = false
      this.updateAvailable = true
      this.retryCount = 0 // 重置重试计数
      
      const updateInfo = this.convertUpdateInfo(info)
      this.latestUpdateInfo = updateInfo
      this.callbacks.onUpdateAvailable?.(updateInfo)
    })

    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      console.log('[UpdateManager] No update available, current version:', info.version)
      this.isChecking = false
      this.updateAvailable = false
      this.callbacks.onUpdateNotAvailable?.()
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      const percent = Math.round(progress.percent * 100) / 100
      console.log(`[UpdateManager] Download progress: ${percent}% (${this.formatBytes(progress.transferred)}/${this.formatBytes(progress.total)})`)
      this.callbacks.onDownloadProgress?.(progress.percent)
    })

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      console.log('[UpdateManager] Update downloaded:', info.version)
      this.isDownloading = false
      this.downloadedVersion = info.version
      this.retryCount = 0
      this.callbacks.onUpdateDownloaded?.()
    })

    autoUpdater.on('error', (error: Error) => {
      console.error('[UpdateManager] Update error:', error.message)
      this.isChecking = false
      this.handleError(error)
    })
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 转换 electron-updater 的 UpdateInfo 为应用定义的 UpdateInfo
   */
  private convertUpdateInfo(info: ElectronUpdateInfo): UpdateInfo {
    return {
      version: info.version,
      releaseDate: info.releaseDate || new Date().toISOString(),
      releaseNotes: this.extractReleaseNotes(info.releaseNotes),
      downloadUrl: info.files?.[0]?.url || '',
    }
  }

  /**
   * 提取发布说明文本
   */
  private extractReleaseNotes(notes: string | Array<{ note: string | null }> | null | undefined): string {
    if (!notes) return ''
    if (typeof notes === 'string') return notes
    if (Array.isArray(notes)) {
      return notes.map(n => n.note || '').filter(Boolean).join('\n')
    }
    return ''
  }

  /**
   * 处理错误，实现重试逻辑
   * 需求 7.5: 下载失败重试（最多3次）
   */
  private handleError(error: Error): void {
    this.isDownloading = false

    // 如果正在下载且未超过重试次数，尝试重试
    if (this.updateAvailable && this.retryCount < MAX_RETRY_COUNT) {
      this.retryCount++
      console.log(`[UpdateManager] Retrying download (${this.retryCount}/${MAX_RETRY_COUNT})...`)
      
      setTimeout(() => {
        this.downloadUpdate().catch(console.error)
      }, RETRY_DELAY)
    } else {
      // 超过重试次数或其他错误，通知回调
      this.callbacks.onError?.(error)
    }
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: UpdateManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 检查更新
   * 需求 7.1: 启动时检查更新
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.isChecking) {
      console.log('[UpdateManager] Already checking for updates')
      return this.latestUpdateInfo
    }

    try {
      this.lastCheckTime = new Date()
      const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates()
      
      if (result && result.updateInfo) {
        const info = result.updateInfo
        // 比较版本号，确认是否有新版本
        if (this.isNewerVersion(info.version, this.getCurrentVersion())) {
          this.updateAvailable = true
          const updateInfo = this.convertUpdateInfo(info)
          this.latestUpdateInfo = updateInfo
          return updateInfo
        }
      }
      
      return null
    } catch (error) {
      console.error('[UpdateManager] Check for updates failed:', error)
      this.isChecking = false
      throw error
    }
  }

  /**
   * 启动定时检查更新
   * 需求 7.7: 定时检查更新
   */
  startAutoCheck(): void {
    if (this.checkTimer) {
      console.log('[UpdateManager] Auto check already running')
      return
    }

    const interval = Math.max(this.config.checkInterval || DEFAULT_CHECK_INTERVAL, MIN_CHECK_INTERVAL)
    console.log(`[UpdateManager] Starting auto check with interval: ${interval / 1000 / 60} minutes`)

    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        console.error('[UpdateManager] Auto check failed:', error.message)
      })
    }, interval)
  }

  /**
   * 停止定时检查更新
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
      console.log('[UpdateManager] Auto check stopped')
    }
  }

  /**
   * 设置检查间隔
   */
  setCheckInterval(interval: number): void {
    this.config.checkInterval = Math.max(interval, MIN_CHECK_INTERVAL)
    
    // 如果正在运行自动检查，重新启动
    if (this.checkTimer) {
      this.stopAutoCheck()
      this.startAutoCheck()
    }
  }

  /**
   * 获取上次检查时间
   */
  getLastCheckTime(): Date | null {
    return this.lastCheckTime
  }

  /**
   * 获取最新的更新信息
   */
  getLatestUpdateInfo(): UpdateInfo | null {
    return this.latestUpdateInfo
  }

  /**
   * 检查是否正在检查更新
   */
  isCheckingForUpdates(): boolean {
    return this.isChecking
  }

  /**
   * 下载更新
   * 需求 7.2, 7.3: 后台下载更新，显示进度
   */
  async downloadUpdate(): Promise<void> {
    if (!this.updateAvailable) {
      throw new Error('No update available')
    }

    if (this.isDownloading) {
      console.log('[UpdateManager] Download already in progress')
      return
    }

    this.isDownloading = true
    
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      // 错误会通过 'error' 事件处理
      throw error
    }
  }

  /**
   * 安装更新并重启
   * 需求 7.4: 更新准备就绪后安装
   */
  installAndRestart(): void {
    if (!this.downloadedVersion) {
      console.warn('[UpdateManager] No downloaded update to install')
      return
    }

    console.log('[UpdateManager] Installing update and restarting...')
    // 需求 7.6: 代码签名验证由 electron-updater 自动处理
    autoUpdater.quitAndInstall(false, true)
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): string {
    return app.getVersion()
  }

  /**
   * 检查是否有更新可用
   */
  isUpdateAvailable(): boolean {
    return this.updateAvailable
  }

  /**
   * 检查更新是否已下载
   */
  isUpdateDownloaded(): boolean {
    return this.downloadedVersion !== null
  }

  /**
   * 获取已下载的版本号
   */
  getDownloadedVersion(): string | null {
    return this.downloadedVersion
  }

  /**
   * 获取当前重试次数
   */
  getRetryCount(): number {
    return this.retryCount
  }

  /**
   * 比较版本号，判断 newVersion 是否比 currentVersion 新
   */
  private isNewerVersion(newVersion: string, currentVersion: string): boolean {
    const parseVersion = (v: string): number[] => {
      return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
    }

    const newParts = parseVersion(newVersion)
    const currentParts = parseVersion(currentVersion)

    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newPart = newParts[i] || 0
      const currentPart = currentParts[i] || 0
      
      if (newPart > currentPart) return true
      if (newPart < currentPart) return false
    }

    return false
  }

  /**
   * 设置更新服务器 URL（用于自托管更新服务器）
   */
  setFeedURL(url: string): void {
    autoUpdater.setFeedURL({ provider: 'generic', url })
  }

  /**
   * 设置是否允许预发布版本
   */
  setAllowPrerelease(allow: boolean): void {
    autoUpdater.allowPrerelease = allow
  }

  /**
   * 设置是否自动下载
   */
  setAutoDownload(auto: boolean): void {
    autoUpdater.autoDownload = auto
  }
}

// 单例实例
let updateManagerInstance: UpdateManager | null = null

/**
 * 获取 UpdateManager 单例
 */
export function getUpdateManager(): UpdateManager {
  if (!updateManagerInstance) {
    updateManagerInstance = new UpdateManager()
  }
  return updateManagerInstance
}

/**
 * 初始化 UpdateManager（带配置）
 */
export function initUpdateManager(config?: UpdateManagerConfig): UpdateManager {
  if (updateManagerInstance) {
    updateManagerInstance.stopAutoCheck()
  }
  updateManagerInstance = new UpdateManager(config)
  return updateManagerInstance
}

/**
 * 重置 UpdateManager（用于测试）
 */
export function resetUpdateManager(): void {
  if (updateManagerInstance) {
    updateManagerInstance.stopAutoCheck()
  }
  updateManagerInstance = null
}
