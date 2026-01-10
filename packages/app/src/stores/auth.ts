/**
 * CYP-memo 认证状态管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authManager } from '@cyp-memo/shared'
import type { User } from '@cyp-memo/shared'

/**
 * 认证状态管理
 */
export const useAuthStore = defineStore('auth', () => {
  // 状态
  const currentUser = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const isAuthenticated = computed(() => currentUser.value !== null)
  const username = computed(() => currentUser.value?.username ?? '')
  const userId = computed(() => currentUser.value?.id ?? '')
  const isMainAccount = computed(() => currentUser.value?.isMainAccount ?? false)
  const permissions = computed(() => currentUser.value?.permissions ?? [])

  /**
   * 账号密码登录
   */
  async function loginWithPassword(username: string, password: string, remember: boolean = false) {
    isLoading.value = true
    error.value = null

    try {
      const user = await authManager.loginWithPassword(username, password, remember)
      currentUser.value = user
      return user
    } catch (err) {
      error.value = err instanceof Error ? err.message : '登录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 个人令牌登录
   */
  async function loginWithToken(token: string) {
    isLoading.value = true
    error.value = null

    try {
      const user = await authManager.loginWithToken(token)
      currentUser.value = user
      return user
    } catch (err) {
      error.value = err instanceof Error ? err.message : '登录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 账号密码注册
   */
  async function registerWithPassword(
    username: string,
    password: string,
    securityQuestion: { question: string; answerHash: string }
  ) {
    isLoading.value = true
    error.value = null

    try {
      const user = await authManager.registerWithPassword(username, password, securityQuestion)
      currentUser.value = user
      return user
    } catch (err) {
      error.value = err instanceof Error ? err.message : '注册失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 个人令牌注册
   */
  async function registerWithToken() {
    isLoading.value = true
    error.value = null

    try {
      const result = await authManager.registerWithToken()
      currentUser.value = result.user
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : '注册失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 注销
   */
  async function logout() {
    isLoading.value = true
    error.value = null

    try {
      await authManager.logout()
      currentUser.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : '注销失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 自动登录
   */
  async function autoLogin() {
    isLoading.value = true
    error.value = null

    try {
      const user = await authManager.autoLogin()
      if (user) {
        currentUser.value = user
      }
      return user
    } catch (err) {
      error.value = err instanceof Error ? err.message : '自动登录失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 密码找回
   */
  async function resetPassword(username: string, securityAnswer: string, newPassword: string) {
    isLoading.value = true
    error.value = null

    try {
      await authManager.resetPassword(username, securityAnswer, newPassword)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '密码找回失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 清除错误
   */
  function clearError() {
    error.value = null
  }

  /**
   * 验证会话是否有效
   * @returns Promise<{ valid: boolean; reason?: string }> 验证结果
   */
  async function validateSession() {
    if (!currentUser.value) {
      return { valid: false, reason: '未登录' }
    }

    try {
      const result = await authManager.validateSession()
      
      if (!result.valid) {
        // 会话无效，清除当前用户
        currentUser.value = null
      }
      
      return result
    } catch (err) {
      console.error('会话验证失败:', err)
      return { valid: false, reason: '会话验证失败' }
    }
  }

  /**
   * 强制退出（用于会话失效时）
   */
  function forceLogout() {
    currentUser.value = null
    authManager.logout()
  }

  return {
    // 状态
    currentUser,
    isLoading,
    error,
    // 计算属性
    isAuthenticated,
    username,
    userId,
    isMainAccount,
    permissions,
    // 方法
    loginWithPassword,
    loginWithToken,
    registerWithPassword,
    registerWithToken,
    logout,
    autoLogin,
    resetPassword,
    clearError,
    validateSession,
    forceLogout,
  }
})
