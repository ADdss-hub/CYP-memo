/**
 * 安全管理器
 * Manages security features including HTTPS enforcement and Content Security Policy
 * 
 * Requirements: 9.3, 9.4
 */

import { session, app } from 'electron'
import { buildAppCsp } from '@cyp-memo/shared'

/**
 * HTTPS 验证结果
 */
export interface HttpsValidationResult {
  valid: boolean
  error?: string
  isLocalhost?: boolean
}

/**
 * CSP 配置选项
 */
export interface CSPOptions {
  /** 是否为本机联调工具链（未打包 / HMR；非独立配置面） */
  isLocalTooling?: boolean
  /** 允许的远程服务器 URL */
  remoteServerUrl?: string
}

/**
 * 安全管理器类
 * 需求 9.3: HTTPS 强制
 * 需求 9.4: 内容安全策略
 */
export class SecurityManager {
  private initialized = false
  private cspEnabled = false

  /**
   * 初始化安全管理器
   */
  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    console.log('[SecurityManager] Initialized')
  }

  /**
   * 验证 URL 是否使用 HTTPS
   * 需求 9.3: 当与远程服务器通信时，桌面客户端应仅使用 HTTPS
   * 
   * @param url - 要验证的 URL
   * @returns 验证结果
   */
  validateHttps(url: string): HttpsValidationResult {
    if (!url || typeof url !== 'string') {
      return {
        valid: false,
        error: 'URL 不能为空',
      }
    }

    const trimmedUrl = url.trim().toLowerCase()

    // 检查是否为本地地址（localhost 或 127.0.0.1）
    const isLocalhost = this.isLocalhostUrl(trimmedUrl)

    // 本地地址允许使用 HTTP
    if (isLocalhost) {
      return {
        valid: true,
        isLocalhost: true,
      }
    }

    // 远程地址必须使用 HTTPS
    if (!trimmedUrl.startsWith('https://')) {
      return {
        valid: false,
        error: '远程服务器必须使用 HTTPS 协议',
        isLocalhost: false,
      }
    }

    return {
      valid: true,
      isLocalhost: false,
    }
  }

  /**
   * 检查 URL 是否为本地地址
   */
  isLocalhostUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase()
    return (
      lowerUrl.includes('localhost') ||
      lowerUrl.includes('127.0.0.1') ||
      lowerUrl.includes('[::1]')
    )
  }

  /**
   * 强制 HTTPS 请求拦截
   * 需求 9.3: 拒绝非 HTTPS 连接
   * 
   * 此方法设置请求拦截器，阻止对远程服务器的非 HTTPS 请求
   */
  enforceHttps(): void {
    const defaultSession = session.defaultSession

    // 拦截所有请求
    defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url

      // 允许 devtools、chrome-extension 等内部协议
      if (
        url.startsWith('devtools://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('chrome://') ||
        url.startsWith('file://') ||
        url.startsWith('data:')
      ) {
        callback({ cancel: false })
        return
      }

      // 检查是否为 HTTP 请求
      if (url.startsWith('http://')) {
        // 允许本地地址使用 HTTP
        if (this.isLocalhostUrl(url)) {
          callback({ cancel: false })
          return
        }

        // 阻止远程 HTTP 请求
        console.warn(`[SecurityManager] Blocked insecure HTTP request: ${url}`)
        callback({ cancel: true })
        return
      }

      // 允许其他请求（HTTPS 等）
      callback({ cancel: false })
    })

    console.log('[SecurityManager] HTTPS enforcement enabled')
  }

  /**
   * 配置内容安全策略
   * 需求 9.4: 实施内容安全策略以防止 XSS 攻击
   * 
   * @param options - CSP 配置选项
   */
  configureCSP(options: CSPOptions = {}): void {
    const { isLocalTooling = false, remoteServerUrl } = options
    const defaultSession = session.defaultSession

    // 构建 CSP 指令
    const cspDirectives = this.buildCSPDirectives(isLocalTooling, remoteServerUrl)

    // 设置响应头
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [cspDirectives],
        },
      })
    })

    this.cspEnabled = true
    console.log('[SecurityManager] Content Security Policy configured')
  }

  /**
   * 构建 CSP 指令字符串（前端安全防护：与 shared buildAppCsp 单一事实源，禁止平行策略）
   */
  private buildCSPDirectives(isLocalTooling: boolean, remoteServerUrl?: string): string {
    return buildAppCsp(isLocalTooling, remoteServerUrl)
  }

  /**
   * 检查 CSP 是否已启用
   */
  isCSPEnabled(): boolean {
    return this.cspEnabled
  }

  /**
   * 获取当前 CSP 配置（用于调试）
   */
  getCSPConfig(isLocalTooling: boolean, remoteServerUrl?: string): string {
    return this.buildCSPDirectives(isLocalTooling, remoteServerUrl)
  }
}

// 单例实例
let securityManager: SecurityManager | null = null

/**
 * 获取安全管理器实例
 */
export function getSecurityManager(): SecurityManager {
  if (!securityManager) {
    securityManager = new SecurityManager()
    securityManager.initialize()
  }
  return securityManager
}

/**
 * 重置安全管理器（仅用于测试）
 */
export function resetSecurityManager(): void {
  securityManager = null
}
