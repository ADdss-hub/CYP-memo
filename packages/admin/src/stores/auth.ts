/**
 * CYP-memo 管理员认证状态管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { adminAuthManager } from '@cyp-memo/shared'
import type { Admin } from '@cyp-memo/shared'
import { AdminRole } from '@cyp-memo/shared'

/**
 * 管理员认证状态管理
 */
export const useAdminAuthStore = defineStore('adminAuth', () => {
  // 状态
  const currentAdmin = ref<Admin | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const isAuthenticated = computed(() => currentAdmin.value !== null)
  const username = computed(() => currentAdmin.value?.username ?? '')
  const adminId = computed(() => currentAdmin.value?.id ?? '')
  const role = computed(() => currentAdmin.value?.role ?? AdminRole.ADMIN)
  const isSuperAdmin = computed(() => currentAdmin.value?.role === AdminRole.SUPER_ADMIN)

  /**
   * 管理员登录
   */
  async function login(username: string, password: string) {
    isLoading.value = true
    error.value = null

    try {
      const admin = await adminAuthManager.login(username, password)
      currentAdmin.value = admin
      return admin
    } catch (err) {
      error.value = err instanceof Error ? err.message : '登录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 管理员注销
   */
  async function logout() {
    isLoading.value = true
    error.value = null

    try {
      await adminAuthManager.logout()
      currentAdmin.value = null
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
      const admin = await adminAuthManager.autoLogin()
      if (admin) {
        currentAdmin.value = admin
      }
      return admin
    } catch (err) {
      error.value = err instanceof Error ? err.message : '自动登录失败'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 修改密码
   */
  async function changePassword(oldPassword: string, newPassword: string) {
    if (!currentAdmin.value) {
      throw new Error('未登录')
    }

    isLoading.value = true
    error.value = null

    try {
      await adminAuthManager.changePassword(currentAdmin.value.id, oldPassword, newPassword)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '修改密码失败'
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

  return {
    // 状态
    currentAdmin,
    isLoading,
    error,
    // 计算属性
    isAuthenticated,
    username,
    adminId,
    role,
    isSuperAdmin,
    // 方法
    login,
    logout,
    autoLogin,
    changePassword,
    clearError,
  }
})
