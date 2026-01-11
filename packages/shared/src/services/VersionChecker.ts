/**
 * 版本检测服务
 * 用于检测应用是否有新版本可用
 * 
 * 支持多种检测方式：
 * 1. 从服务器 API 获取版本信息
 * 2. 从 GitHub Releases 获取最新版本
 * 
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { VERSION } from '../config/version'

/**
 * 版本信息接口
 */
export interface VersionInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
  downloadUrl?: string
  isNewer: boolean
}

/**
 * 版本检测配置
 */
export interface VersionCheckerConfig {
  /** 服务器 API 地址 */
  serverUrl?: string
  /** GitHub 仓库（格式：owner/repo） */
  githubRepo?: string
  /** 检测间隔（毫秒），默认 1 小时 */
  checkInterval?: number
  /** 是否自动检测 */
  autoCheck?: boolean
}

/**
 * 版本检测回调
 */
export interface VersionCheckerCallbacks {
  onNewVersion?: (info: VersionInfo) => void
  onError?: (error: Error) => void
}

/**
 * 比较版本号
 * @returns 1 如果 v1 > v2, -1 如果 v1 < v2, 0 如果相等
 */
export function compareVersions(v1: string, v2: string): number {
  const parseVersion = (v: string): number[] => {
    return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  }

  const parts1 = parseVersion(v1)
  const parts2 = parseVersion(v2)
  const maxLength = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }

  return 0
}

/**
 * 版本检测服务类
 */
export class VersionChecker {
  private config: VersionCheckerConfig
  private callbacks: VersionCheckerCallbacks = {}
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private lastCheck: Date | null = null
  private cachedVersion: VersionInfo | null = null

  constructor(config: VersionCheckerConfig = {}) {
    this.config = {
      checkInterval: 60 * 60 * 1000, // 默认 1 小时
      autoCheck: false,
      ...config,
    }
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): string {
    return VERSION.full
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: VersionCheckerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 从服务器 API 检测版本
   */
  async checkFromServer(): Promise<VersionInfo | null> {
    if (!this.config.serverUrl) {
      throw new Error('Server URL not configured')
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/api/health`)
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }

      const data = await response.json()
      const serverVersion = data.data?.version

      if (!serverVersion) {
        return null
      }

      const isNewer = compareVersions(serverVersion, this.getCurrentVersion()) > 0

      const versionInfo: VersionInfo = {
        version: serverVersion,
        isNewer,
      }

      this.cachedVersion = versionInfo
      this.lastCheck = new Date()

      if (isNewer) {
        this.callbacks.onNewVersion?.(versionInfo)
      }

      return versionInfo
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.callbacks.onError?.(err)
      throw err
    }
  }

  /**
   * 从 GitHub Releases 检测版本
   */
  async checkFromGitHub(): Promise<VersionInfo | null> {
    if (!this.config.githubRepo) {
      throw new Error('GitHub repo not configured')
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.config.githubRepo}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          // 没有发布版本
          return null
        }
        throw new Error(`GitHub API returned ${response.status}`)
      }

      const release = await response.json()
      const tagName = release.tag_name as string
      const version = tagName.replace(/^v/, '')
      const isNewer = compareVersions(version, this.getCurrentVersion()) > 0

      const versionInfo: VersionInfo = {
        version,
        releaseDate: release.published_at,
        releaseNotes: release.body || '',
        downloadUrl: release.html_url,
        isNewer,
      }

      this.cachedVersion = versionInfo
      this.lastCheck = new Date()

      if (isNewer) {
        this.callbacks.onNewVersion?.(versionInfo)
      }

      return versionInfo
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.callbacks.onError?.(err)
      throw err
    }
  }

  /**
   * 检测新版本（自动选择检测方式）
   */
  async check(): Promise<VersionInfo | null> {
    // 优先使用 GitHub
    if (this.config.githubRepo) {
      return this.checkFromGitHub()
    }
    // 其次使用服务器 API
    if (this.config.serverUrl) {
      return this.checkFromServer()
    }
    throw new Error('No version check source configured')
  }

  /**
   * 启动自动检测
   */
  startAutoCheck(): void {
    if (this.checkTimer) {
      return
    }

    // 立即检测一次
    this.check().catch(console.error)

    // 设置定时检测
    this.checkTimer = setInterval(() => {
      this.check().catch(console.error)
    }, this.config.checkInterval!)
  }

  /**
   * 停止自动检测
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  /**
   * 获取上次检测时间
   */
  getLastCheckTime(): Date | null {
    return this.lastCheck
  }

  /**
   * 获取缓存的版本信息
   */
  getCachedVersion(): VersionInfo | null {
    return this.cachedVersion
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedVersion = null
    this.lastCheck = null
  }
}

// 默认实例
let defaultChecker: VersionChecker | null = null

/**
 * 获取默认版本检测器
 */
export function getVersionChecker(config?: VersionCheckerConfig): VersionChecker {
  if (!defaultChecker) {
    defaultChecker = new VersionChecker(config)
  } else if (config) {
    // 如果提供了新配置，创建新实例
    defaultChecker = new VersionChecker(config)
  }
  return defaultChecker
}

/**
 * 重置版本检测器（用于测试）
 */
export function resetVersionChecker(): void {
  if (defaultChecker) {
    defaultChecker.stopAutoCheck()
    defaultChecker = null
  }
}
