/**
 * CYP-memo 认证存储管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 本地存储键名
 */
const STORAGE_KEY_AUTH = 'cyp-memo-auth'
const STORAGE_KEY_REMEMBER = 'cyp-memo-remember'

/**
 * 认证信息接口
 */
export interface AuthInfo {
  userId: string
  username: string
  loginType: 'password' | 'token'
  timestamp: number
}

/**
 * 记住密码信息接口
 */
export interface RememberInfo {
  username: string
  password: string
}

/**
 * 认证存储管理器
 * 负责本地存储的读写操作
 */
export class AuthStorage {
  /**
   * 保存认证信息到本地存储
   */
  saveAuthInfo(authInfo: AuthInfo): void {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(authInfo))
  }

  /**
   * 从本地存储获取认证信息
   */
  getAuthInfo(): AuthInfo | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_AUTH)
      if (!data) {
        return null
      }
      return JSON.parse(data) as AuthInfo
    } catch {
      return null
    }
  }

  /**
   * 清除本地存储的认证信息
   */
  clearAuthInfo(): void {
    localStorage.removeItem(STORAGE_KEY_AUTH)
  }

  /**
   * 保存记住密码信息到本地存储
   */
  saveRememberInfo(info: RememberInfo): void {
    localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(info))
  }

  /**
   * 获取记住的密码信息
   */
  getRememberInfo(): RememberInfo | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_REMEMBER)
      if (!data) {
        return null
      }
      return JSON.parse(data) as RememberInfo
    } catch {
      return null
    }
  }

  /**
   * 清除记住密码信息
   */
  clearRememberInfo(): void {
    localStorage.removeItem(STORAGE_KEY_REMEMBER)
  }
}

/**
 * AuthStorage 单例实例
 */
export const authStorage = new AuthStorage()
