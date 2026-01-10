/**
 * CYP-memo 设置状态管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppSettings } from '@cyp-memo/shared'

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: AppSettings = {
  isFirstTime: true,
  welcomeCompleted: false,
  theme: 'light',
  fontSize: 'medium',
  language: 'zh-CN',
  autoCleanLogs: true,
  logRetentionHours: 12,
}

/**
 * 本地存储键名
 */
const STORAGE_KEY = 'cyp-memo-settings'

/**
 * 设置状态管理
 */
export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const isFirstTime = computed(() => settings.value.isFirstTime)
  const welcomeCompleted = computed(() => settings.value.welcomeCompleted)
  const autoCleanLogs = computed(() => settings.value.autoCleanLogs)
  const logRetentionHours = computed(() => settings.value.logRetentionHours)

  /**
   * 加载设置
   */
  async function loadSettings() {
    isLoading.value = true
    error.value = null

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载设置失败'
      console.error('加载设置失败:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 保存设置
   */
  async function saveSettings() {
    isLoading.value = true
    error.value = null

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存设置失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 更新设置
   */
  async function updateSettings(updates: Partial<AppSettings>) {
    settings.value = { ...settings.value, ...updates }
    await saveSettings()
  }

  /**
   * 设置首次使用标记
   */
  async function setFirstTime(value: boolean) {
    await updateSettings({ isFirstTime: value })
  }

  /**
   * 设置欢迎完成标记
   */
  async function setWelcomeCompleted(value: boolean) {
    await updateSettings({ welcomeCompleted: value })
  }

  /**
   * 设置主题
   */
  async function setTheme(theme: 'light' | 'dark') {
    await updateSettings({ theme })
  }

  /**
   * 设置字体大小
   */
  async function setFontSize(fontSize: 'small' | 'medium' | 'large') {
    await updateSettings({ fontSize })
  }

  /**
   * 设置语言
   */
  async function setLanguage(language: string) {
    await updateSettings({ language })
  }

  /**
   * 设置自动清理日志
   */
  async function setAutoCleanLogs(value: boolean) {
    await updateSettings({ autoCleanLogs: value })
  }

  /**
   * 设置日志保留时间
   */
  async function setLogRetentionHours(hours: number) {
    if (hours < 1) {
      throw new Error('日志保留时间必须大于 0')
    }
    await updateSettings({ logRetentionHours: hours })
  }

  /**
   * 重置为默认设置
   */
  async function resetToDefaults() {
    settings.value = { ...DEFAULT_SETTINGS }
    await saveSettings()
  }

  /**
   * 清除所有设置
   */
  async function clearSettings() {
    localStorage.removeItem(STORAGE_KEY)
    settings.value = { ...DEFAULT_SETTINGS }
  }

  /**
   * 导出设置
   */
  function exportSettings(): string {
    return JSON.stringify(settings.value, null, 2)
  }

  /**
   * 导入设置
   */
  async function importSettings(jsonString: string) {
    try {
      const imported = JSON.parse(jsonString)
      settings.value = { ...DEFAULT_SETTINGS, ...imported }
      await saveSettings()
    } catch (err) {
      error.value = '导入设置失败：格式无效'
      throw new Error('导入设置失败：格式无效')
    }
  }

  /**
   * 清除错误
   */
  function clearError() {
    error.value = null
  }

  // 初始化时加载设置
  loadSettings()

  return {
    // 状态
    settings,
    isLoading,
    error,
    // 计算属性
    isFirstTime,
    welcomeCompleted,
    autoCleanLogs,
    logRetentionHours,
    // 方法
    loadSettings,
    saveSettings,
    updateSettings,
    setFirstTime,
    setWelcomeCompleted,
    setTheme,
    setFontSize,
    setLanguage,
    setAutoCleanLogs,
    setLogRetentionHours,
    resetToDefaults,
    clearSettings,
    exportSettings,
    importSettings,
    clearError,
  }
})
