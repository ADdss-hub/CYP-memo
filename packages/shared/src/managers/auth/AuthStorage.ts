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
 * 记住登录信息（仅用户名；禁止明文密码入库）
 */
export interface RememberInfo {
  username: string
  /** 是否勾选「记住」——仅作回填勾选状态，不含口令 */
  remember?: boolean
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
   * 保存「记住用户名」信息（禁止写入 password）
   */
  saveRememberInfo(info: RememberInfo): void {
    const username = (info.username || '').trim()
    if (!username) {
      this.clearRememberInfo()
      return
    }
    const payload: RememberInfo = {
      username,
      remember: info.remember !== false,
    }
    localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(payload))
  }

  /**
   * 获取记住的用户名信息；若历史数据含 password 字段则剥离并回写净化
   */
  getRememberInfo(): RememberInfo | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_REMEMBER)
      if (!data) {
        return null
      }
      const parsed = JSON.parse(data) as RememberInfo & { password?: string }
      const username = (parsed.username || '').trim()
      if (!username) {
        return null
      }
      // 迁移：清除历史明文密码
      if (typeof parsed.password === 'string') {
        const cleaned: RememberInfo = { username, remember: true }
        localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(cleaned))
        return cleaned
      }
      return {
        username,
        remember: parsed.remember !== false,
      }
    } catch {
      return null
    }
  }

  /**
   * 清除记住用户名信息
   */
  clearRememberInfo(): void {
    localStorage.removeItem(STORAGE_KEY_REMEMBER)
  }
}

/**
 * AuthStorage 单例实例
 */
export const authStorage = new AuthStorage()
