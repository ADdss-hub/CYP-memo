/**
 * Electron API 组合式函数
 * Composable for accessing Electron API in Vue components
 * 
 * 需求 10.1: 桌面客户端应在每个平台上提供原生外观和体验
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ElectronAPI, Platform, PlatformFeatures } from '../../shared/types'

/**
 * 检查是否在 Electron 环境中运行
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

/**
 * 获取 Electron API
 */
export function getElectronAPI(): ElectronAPI | null {
  if (isElectron()) {
    return window.electronAPI
  }
  return null
}

/**
 * 使用 Electron API 的组合式函数
 */
export function useElectron() {
  const api = getElectronAPI()
  const isElectronEnv = ref(isElectron())
  const platform = ref<Platform | 'web'>('web')
  const features = ref<PlatformFeatures | null>(null)

  // 版本信息
  const versions = ref<{
    electron: string
    chrome: string
    node: string
  } | null>(null)

  onMounted(() => {
    if (api) {
      platform.value = api.platformInfo.getPlatform()
      features.value = api.platformInfo.getFeatures()
    }
    
    if (window.electronVersion) {
      versions.value = window.electronVersion
    }
  })

  // 计算属性
  const isWindows = computed(() => platform.value === 'win32')
  const isMac = computed(() => platform.value === 'darwin')
  const isLinux = computed(() => platform.value === 'linux')

  return {
    api,
    isElectronEnv,
    platform,
    features,
    versions,
    isWindows,
    isMac,
    isLinux,
  }
}

/**
 * 窗口操作组合式函数
 */
export function useWindow() {
  const api = getElectronAPI()

  const minimize = async () => {
    await api?.window.minimize()
  }

  const maximize = async () => {
    await api?.window.maximize()
  }

  const close = async () => {
    await api?.window.close()
  }

  const toggle = async () => {
    await api?.window.toggle()
  }

  return {
    minimize,
    maximize,
    close,
    toggle,
  }
}

/**
 * 导航监听组合式函数
 */
export function useNavigation(onNavigate: (path: string) => void) {
  const api = getElectronAPI()

  onMounted(() => {
    if (api) {
      api.onNavigate(onNavigate)
    }
  })

  onUnmounted(() => {
    if (api) {
      api.removeNavigateListener()
    }
  })
}

/**
 * 网络状态组合式函数
 */
export function useNetworkStatus() {
  const api = getElectronAPI()
  const isOnline = ref(true)
  const checking = ref(false)

  const checkStatus = async () => {
    if (!api) {
      isOnline.value = navigator.onLine
      return isOnline.value
    }

    checking.value = true
    try {
      isOnline.value = await api.network.check()
    } finally {
      checking.value = false
    }
    return isOnline.value
  }

  onMounted(async () => {
    await checkStatus()
  })

  return {
    isOnline,
    checking,
    checkStatus,
  }
}

/**
 * 通知组合式函数
 */
export function useNotifications() {
  const api = getElectronAPI()

  const show = async (title: string, body: string, data?: unknown) => {
    if (!api) {
      // 降级到 Web Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body })
      }
      return
    }

    await api.notification.show({ title, body, data })
  }

  const getPreferences = async () => {
    return api?.notification.getPreferences()
  }

  const setPreferences = async (prefs: Parameters<ElectronAPI['notification']['setPreferences']>[0]) => {
    await api?.notification.setPreferences(prefs)
  }

  return {
    show,
    getPreferences,
    setPreferences,
  }
}

/**
 * 平台功能组合式函数
 */
export function usePlatformFeatures() {
  const api = getElectronAPI()
  const features = ref<PlatformFeatures | null>(null)

  onMounted(() => {
    if (api) {
      features.value = api.platformInfo.getFeatures()
    }
  })

  const setProgress = async (value: number) => {
    if (!api || !features.value?.supportsTaskbarProgress) return false
    return api.platformInfo.setProgress(value)
  }

  const clearProgress = async () => {
    if (!api || !features.value?.supportsTaskbarProgress) return false
    return api.platformInfo.clearProgress()
  }

  const setBadgeCount = async (count: number) => {
    if (!api || !features.value?.supportsDockBadge) return false
    return api.platformInfo.setBadgeCount(count)
  }

  const clearBadgeCount = async () => {
    if (!api || !features.value?.supportsDockBadge) return false
    return api.platformInfo.clearBadgeCount()
  }

  return {
    features,
    setProgress,
    clearProgress,
    setBadgeCount,
    clearBadgeCount,
  }
}
