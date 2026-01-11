/**
 * CYP-memo 桌面客户端 Preload 脚本
 * Preload script for secure IPC communication between main and renderer processes
 * 
 * 需求 9.5: 主进程应验证来自渲染进程的所有 IPC 消息
 * 
 * 安全原则:
 * 1. 使用 contextBridge 安全地暴露 API
 * 2. 只暴露必要的功能，不暴露 Node.js 或 Electron 原生 API
 * 3. 所有 IPC 调用都通过 invoke 模式，确保请求-响应模式
 * 4. 事件监听器使用安全的回调模式
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  validateShortcutConfig,
  validateCachedMemo,
  validateNotificationOptions,
  validateNotificationPreferences,
  validateId,
  validatePort,
} from '../shared/ipc-validator'
import type {
  ElectronAPI,
  ShortcutConfig,
  CachedMemo,
  NotificationOptions,
  NotificationPreferences,
  SyncOperation,
  SyncResult,
  SyncConflict,
  ServerConnectionConfig,
  ConnectionMode,
  Platform,
  PlatformFeatures,
  DragDropResult,
} from '../shared/types'

/**
 * 安全的 IPC 调用包装器
 * 在发送到主进程之前进行客户端验证
 */
function safeInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  // 验证通道是否在允许列表中
  const allowedChannels = Object.values(IPC_CHANNELS)
  if (!allowedChannels.includes(channel as typeof allowedChannels[number])) {
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

/**
 * 暴露给渲染进程的安全 API
 * 所有 API 都经过安全封装，只暴露必要的功能
 */
const electronAPI: ElectronAPI = {
  // 窗口操作
  window: {
    minimize: () => safeInvoke<void>(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => safeInvoke<void>(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => safeInvoke<void>(IPC_CHANNELS.WINDOW_CLOSE),
    toggle: () => safeInvoke<void>(IPC_CHANNELS.WINDOW_TOGGLE),
  },

  // 托盘操作
  tray: {
    setTooltip: (tooltip: string) => {
      if (typeof tooltip !== 'string') {
        return Promise.reject(new Error('Tooltip must be a string'))
      }
      return safeInvoke<void>(IPC_CHANNELS.TRAY_SET_TOOLTIP, tooltip)
    },
    showBalloon: (title: string, content: string) => {
      if (typeof title !== 'string' || typeof content !== 'string') {
        return Promise.reject(new Error('Title and content must be strings'))
      }
      return safeInvoke<void>(IPC_CHANNELS.TRAY_SHOW_BALLOON, title, content)
    },
  },

  // 快捷键操作
  shortcut: {
    getConfig: () => safeInvoke<ShortcutConfig>(IPC_CHANNELS.SHORTCUT_GET_CONFIG),
    updateConfig: (config: Partial<ShortcutConfig>) => {
      const validation = validateShortcutConfig(config)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.SHORTCUT_UPDATE_CONFIG, config)
    },
  },

  // 缓存操作
  cache: {
    getMemo: (id: string) => {
      const validation = validateId(id)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<CachedMemo | null>(IPC_CHANNELS.CACHE_GET_MEMO, id)
    },
    getAllMemos: () => safeInvoke<CachedMemo[]>(IPC_CHANNELS.CACHE_GET_ALL_MEMOS),
    setMemo: (memo: CachedMemo) => {
      const validation = validateCachedMemo(memo)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<void>(IPC_CHANNELS.CACHE_SET_MEMO, memo)
    },
    deleteMemo: (id: string) => {
      const validation = validateId(id)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<void>(IPC_CHANNELS.CACHE_DELETE_MEMO, id)
    },
    clear: () => safeInvoke<void>(IPC_CHANNELS.CACHE_CLEAR),
  },

  // 同步操作
  sync: {
    getStatus: () => safeInvoke(IPC_CHANNELS.SYNC_STATUS),
    start: () => safeInvoke<SyncResult>(IPC_CHANNELS.SYNC_START),
    resolveConflict: (resolution: { conflictId: string; choice: 'local' | 'remote' }) => {
      if (!resolution.conflictId || !['local', 'remote'].includes(resolution.choice)) {
        return Promise.reject(new Error('Invalid conflict resolution'))
      }
      return safeInvoke<void>(IPC_CHANNELS.SYNC_RESOLVE_CONFLICT, { 
        entityId: resolution.conflictId, 
        resolution: resolution.choice 
      })
    },
    addOperation: (operation: SyncOperation) => {
      if (!operation.id || !operation.type || !operation.entityType || !operation.entityId) {
        return Promise.reject(new Error('Invalid sync operation'))
      }
      return safeInvoke<void>(IPC_CHANNELS.SYNC_ADD_OPERATION, operation)
    },
    getPending: () => safeInvoke<SyncOperation[]>(IPC_CHANNELS.SYNC_GET_PENDING),
  },

  // 网络状态操作
  network: {
    isOnline: () => safeInvoke<boolean>(IPC_CHANNELS.NETWORK_STATUS),
    check: () => safeInvoke<boolean>(IPC_CHANNELS.NETWORK_CHECK),
  },

  // 启动加载操作
  startup: {
    load: () => safeInvoke(IPC_CHANNELS.STARTUP_LOAD),
    manualSync: () => safeInvoke<SyncResult | null>(IPC_CHANNELS.STARTUP_MANUAL_SYNC),
    getState: () => safeInvoke(IPC_CHANNELS.STARTUP_STATE),
    onCacheLoaded: (callback: (data: { memos: CachedMemo[] }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.STARTUP_CACHE_LOADED, (_event, data) => callback(data))
    },
    onSyncComplete: (callback: (data: { result: SyncResult; memos: CachedMemo[] }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.STARTUP_SYNC_COMPLETE, (_event, data) => callback(data))
    },
    onSyncConflicts: (callback: (data: { conflicts: SyncConflict[] }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.STARTUP_SYNC_CONFLICTS, (_event, data) => callback(data))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.STARTUP_CACHE_LOADED)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.STARTUP_SYNC_COMPLETE)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.STARTUP_SYNC_CONFLICTS)
    },
  },

  // 凭证操作
  credential: {
    set: (service: string, account: string, password: string) => {
      if (!service || !account || typeof password !== 'string') {
        return Promise.reject(new Error('Invalid credential parameters'))
      }
      return safeInvoke<void>(IPC_CHANNELS.CREDENTIAL_SET, { service, account, password })
    },
    get: (service: string, account: string) => {
      if (!service || !account) {
        return Promise.reject(new Error('Service and account are required'))
      }
      return safeInvoke<string | null>(IPC_CHANNELS.CREDENTIAL_GET, { service, account })
    },
    delete: (service: string, account: string) => {
      if (!service || !account) {
        return Promise.reject(new Error('Service and account are required'))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.CREDENTIAL_DELETE, { service, account })
    },
  },

  // 更新操作
  update: {
    check: () => safeInvoke(IPC_CHANNELS.UPDATE_CHECK),
    download: () => safeInvoke<void>(IPC_CHANNELS.UPDATE_DOWNLOAD),
    install: () => safeInvoke<void>(IPC_CHANNELS.UPDATE_INSTALL),
    onUpdateAvailable: (callback: (info: { version: string; releaseDate: string; releaseNotes: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, (_event, info) => callback(info))
    },
    onDownloadProgress: (callback: (progress: number) => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_PROGRESS, (_event, progress) => callback(progress))
    },
    onUpdateDownloaded: (callback: () => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOADED, () => callback())
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_AVAILABLE)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_PROGRESS)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOADED)
    },
  },

  // 通知操作
  notification: {
    show: (options: NotificationOptions) => {
      const validation = validateNotificationOptions(options)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<void>(IPC_CHANNELS.NOTIFICATION_SHOW, options)
    },
    setPreferences: (prefs: NotificationPreferences) => {
      const validation = validateNotificationPreferences(prefs)
      if (!validation.valid) {
        return Promise.reject(new Error(validation.error))
      }
      return safeInvoke<void>(IPC_CHANNELS.NOTIFICATION_SET_PREFS, prefs)
    },
    getPreferences: () => safeInvoke<NotificationPreferences>(IPC_CHANNELS.NOTIFICATION_GET_PREFS),
  },

  // 服务器操作
  server: {
    start: (port?: number) => {
      if (port !== undefined) {
        const validation = validatePort(port)
        if (!validation.valid) {
          return Promise.reject(new Error(validation.error))
        }
      }
      return safeInvoke<number>(IPC_CHANNELS.SERVER_START, port)
    },
    stop: () => safeInvoke<void>(IPC_CHANNELS.SERVER_STOP),
    getStatus: () => safeInvoke(IPC_CHANNELS.SERVER_STATUS),
    getConfig: () => safeInvoke<ServerConnectionConfig>(IPC_CHANNELS.SERVER_CONFIG_GET),
    setConfig: (config: Partial<ServerConnectionConfig>) => 
      safeInvoke<void>(IPC_CHANNELS.SERVER_CONFIG_SET, config),
    isFirstLaunch: () => safeInvoke<boolean>(IPC_CHANNELS.SERVER_CONFIG_IS_FIRST_LAUNCH),
    completeSetup: () => safeInvoke<void>(IPC_CHANNELS.SERVER_CONFIG_COMPLETE_SETUP),
    validateUrl: (url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('URL must be a string'))
      }
      return safeInvoke(IPC_CHANNELS.SERVER_VALIDATE_URL, url)
    },
    testConnection: (url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('URL must be a string'))
      }
      return safeInvoke(IPC_CHANNELS.SERVER_TEST_CONNECTION, url)
    },
    switchMode: (mode: ConnectionMode, serverUrl?: string) => {
      if (!['remote', 'embedded'].includes(mode)) {
        return Promise.reject(new Error('Invalid connection mode'))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.SERVER_SWITCH_MODE, { mode, serverUrl })
    },
  },

  // 平台相关操作
  platformInfo: {
    getPlatform: () => process.platform as Platform,
    getFeatures: () => {
      const platform = process.platform
      return {
        supportsTaskbarProgress: platform === 'win32',
        supportsDockBadge: platform === 'darwin',
        supportsDesktopIntegration: platform === 'linux',
        supportsNativeNotifications: true,
      } as PlatformFeatures
    },
    setProgress: (value: number) => {
      if (typeof value !== 'number' || value < -1 || value > 1) {
        return Promise.reject(new Error('Progress value must be between -1 and 1'))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.PLATFORM_SET_PROGRESS, value)
    },
    clearProgress: () => safeInvoke<boolean>(IPC_CHANNELS.PLATFORM_CLEAR_PROGRESS),
    setBadgeCount: (count: number) => {
      if (typeof count !== 'number' || count < 0) {
        return Promise.reject(new Error('Badge count must be a non-negative number'))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.PLATFORM_SET_BADGE, count)
    },
    clearBadgeCount: () => safeInvoke<boolean>(IPC_CHANNELS.PLATFORM_CLEAR_BADGE),
  },

  // 拖放操作
  dragDrop: {
    processFiles: (filePaths: string[]) => {
      if (!Array.isArray(filePaths) || !filePaths.every(p => typeof p === 'string')) {
        return Promise.reject(new Error('File paths must be an array of strings'))
      }
      return safeInvoke<DragDropResult>(IPC_CHANNELS.DRAG_DROP_PROCESS, filePaths)
    },
    validateFiles: (filePaths: string[]) => {
      if (!Array.isArray(filePaths) || !filePaths.every(p => typeof p === 'string')) {
        return Promise.reject(new Error('File paths must be an array of strings'))
      }
      return safeInvoke(IPC_CHANNELS.DRAG_DROP_VALIDATE, filePaths)
    },
    startDrag: (filePath: string) => {
      if (typeof filePath !== 'string') {
        return Promise.reject(new Error('File path must be a string'))
      }
      return safeInvoke<boolean>(IPC_CHANNELS.DRAG_DROP_START, filePath)
    },
  },

  // 平台信息
  platform: process.platform,

  // 导航事件监听
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.NAVIGATE, (_event, path: string) => {
      callback(path)
    })
  },

  // 移除导航事件监听
  removeNavigateListener: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.NAVIGATE)
  },
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 暴露版本信息（只读）
contextBridge.exposeInMainWorld('electronVersion', {
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
})

// 暴露环境信息（只读）
contextBridge.exposeInMainWorld('electronEnv', {
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
})
