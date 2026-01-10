/**
 * CYP-memo UI 状态管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

/**
 * 主题类型
 */
export type Theme = 'light' | 'dark'

/**
 * 字体大小类型
 */
export type FontSize = 'small' | 'medium' | 'large'

/**
 * 语言类型
 */
export type Language = 'zh-CN' | 'en-US'

/**
 * UI 状态管理
 */
export const useUIStore = defineStore('ui', () => {
  // 状态
  const theme = ref<Theme>('light')
  const fontSize = ref<FontSize>('medium')
  const language = ref<Language>('zh-CN')
  const sidebarCollapsed = ref(false)
  const isMobile = ref(false)

  // 计算属性
  const isDarkMode = computed(() => theme.value === 'dark')
  const fontSizeClass = computed(() => `font-${fontSize.value}`)

  /**
   * 设置主题
   */
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    applyTheme()
    saveToLocalStorage()
  }

  /**
   * 切换主题
   */
  function toggleTheme() {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  /**
   * 应用主题到 DOM
   */
  function applyTheme() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  /**
   * 设置字体大小
   */
  function setFontSize(newSize: FontSize) {
    fontSize.value = newSize
    applyFontSize()
    saveToLocalStorage()
  }

  /**
   * 应用字体大小到 DOM
   */
  function applyFontSize() {
    const sizes = {
      small: '14px',
      medium: '16px',
      large: '18px',
    }
    document.documentElement.style.fontSize = sizes[fontSize.value]
  }

  /**
   * 设置语言
   */
  function setLanguage(newLanguage: Language) {
    language.value = newLanguage
    saveToLocalStorage()
  }

  /**
   * 切换侧边栏折叠状态
   */
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    saveToLocalStorage()
  }

  /**
   * 设置侧边栏折叠状态
   */
  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed
    saveToLocalStorage()
  }

  /**
   * 设置移动端状态
   */
  function setMobile(mobile: boolean) {
    isMobile.value = mobile
  }

  /**
   * 保存到本地存储
   */
  function saveToLocalStorage() {
    const uiSettings = {
      theme: theme.value,
      fontSize: fontSize.value,
      language: language.value,
      sidebarCollapsed: sidebarCollapsed.value,
    }
    localStorage.setItem('cyp-memo-ui', JSON.stringify(uiSettings))
  }

  /**
   * 从本地存储加载
   */
  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('cyp-memo-ui')
      if (stored) {
        const uiSettings = JSON.parse(stored)
        theme.value = uiSettings.theme || 'light'
        fontSize.value = uiSettings.fontSize || 'medium'
        language.value = uiSettings.language || 'zh-CN'
        sidebarCollapsed.value = uiSettings.sidebarCollapsed || false

        // 应用设置
        applyTheme()
        applyFontSize()
      }
    } catch (err) {
      console.error('加载 UI 设置失败:', err)
    }
  }

  /**
   * 重置为默认设置
   */
  function reset() {
    theme.value = 'light'
    fontSize.value = 'medium'
    language.value = 'zh-CN'
    sidebarCollapsed.value = false
    applyTheme()
    applyFontSize()
    saveToLocalStorage()
  }

  // 初始化时加载设置
  loadFromLocalStorage()

  // 监听窗口大小变化
  if (typeof window !== 'undefined') {
    const checkMobile = () => {
      setMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
  }

  return {
    // 状态
    theme,
    fontSize,
    language,
    sidebarCollapsed,
    isMobile,
    // 计算属性
    isDarkMode,
    fontSizeClass,
    // 方法
    setTheme,
    toggleTheme,
    setFontSize,
    setLanguage,
    toggleSidebar,
    setSidebarCollapsed,
    setMobile,
    reset,
  }
})
