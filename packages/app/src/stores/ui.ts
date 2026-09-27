/**
 * CYP-memo UI 状态管理（侧栏/移动端）
 * 主题与字号权威在 settings store，禁止本 store 改写 html.dark / data-theme
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'cyp-memo-ui'

/**
 * UI 状态管理（仅布局态；主题见 settings）
 */
export const useUIStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const isMobile = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    saveToLocalStorage()
  }

  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed
    saveToLocalStorage()
  }

  function setMobile(mobile: boolean) {
    isMobile.value = mobile
  }

  function saveToLocalStorage() {
    try {
      const prev = readRaw()
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...prev,
          sidebarCollapsed: sidebarCollapsed.value,
        })
      )
    } catch {
      /* ignore */
    }
  }

  function readRaw(): Record<string, unknown> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return {}
      const parsed = JSON.parse(stored)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  function loadFromLocalStorage() {
    try {
      const uiSettings = readRaw()
      if (typeof uiSettings.sidebarCollapsed === 'boolean') {
        sidebarCollapsed.value = uiSettings.sidebarCollapsed
      }
    } catch (err) {
      console.error('加载 UI 设置失败:', err)
    }
  }

  function reset() {
    sidebarCollapsed.value = false
    saveToLocalStorage()
  }

  loadFromLocalStorage()

  if (typeof window !== 'undefined') {
    const checkMobile = () => {
      setMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
  }

  return {
    sidebarCollapsed,
    isMobile,
    toggleSidebar,
    setSidebarCollapsed,
    setMobile,
    reset,
  }
})
