/**
 * 桌面客户端类型定义
 * Type definitions for the desktop client
 */

// ============ 窗口相关类型 ============

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

// ============ 快捷键相关类型 ============

export interface ShortcutConfig {
  quickMemo: string // 默认: 'CommandOrControl+Shift+M'
  toggleWindow: string // 默认: 'CommandOrControl+Shift+N'
}

// ============ 缓存相关类型 ============

export interface CachedMemo {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  version: number
}

export interface CacheStats {
  totalMemos: number
  totalSize: number
  lastSyncTime: number | null
}

// ============ 同步相关类型 ============

export interface SyncOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entityType: 'memo' | 'tag' | 'file'
  entityId: string
  data: unknown
  timestamp: number
}

export interface SyncConflict {
  localVersion: unknown
  remoteVersion: unknown
  entityId: string
  entityType: string
}

export interface SyncStatus {
  isOnline: boolean
  pendingOperations: number
  lastSyncTime: number | null
  conflicts: SyncConflict[]
}

export interface SyncResult {
  success: boolean
  synced: number
  conflicts: SyncConflict[]
  errors: string[]
}

// ============ 启动加载相关类型 ============

export interface StartupLoadState {
  loading: boolean
  cacheLoaded: boolean
  serverSynced: boolean
  cachedMemoCount: number
  syncResult?: SyncResult
  error?: string
}

// ============ 通知相关类型 ============

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  silent?: boolean
  data?: unknown
}

export interface NotificationPreferences {
  enabled: boolean
  showOnShare: boolean
  showOnSync: boolean
  sound: boolean
}

// ============ 更新相关类型 ============

export interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes: string
  downloadUrl: string
}

// ============ 服务器相关类型 ============

export interface ServerStatus {
  running: boolean
  port: number
  uptime: number
}

export type ConnectionMode = 'remote' | 'embedded'

export interface ServerConnectionConfig {
  connectionMode: ConnectionMode
  serverUrl?: string
  embeddedPort?: number
  isFirstLaunch: boolean
  lastConnectedAt?: number
}

export interface ServerValidationResult {
  valid: boolean
  error?: string
  normalizedUrl?: string
}

export interface ServerConnectionTestResult {
  success: boolean
  latency?: number
  version?: string
  error?: string
}

// ============ 凭证相关类型 ============

export interface CredentialRequest {
  service: string
  account: string
  password?: string
}

// ============ 应用配置类型 ============

export interface AppConfig {
  connectionMode: 'remote' | 'embedded'
  serverUrl?: string
  windowState: WindowState
  shortcuts: ShortcutConfig
  notifications: NotificationPreferences
  autoUpdate: boolean
  theme: 'light' | 'dark' | 'system'
  isFirstLaunch: boolean
}

// ============ 平台相关类型 ============

export type Platform = 'win32' | 'darwin' | 'linux'

export interface PlatformFeatures {
  supportsTaskbarProgress: boolean
  supportsDockBadge: boolean
  supportsDesktopIntegration: boolean
  supportsNativeNotifications: boolean
}

export interface TaskbarProgress {
  mode: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused'
  value?: number // 0-1 for normal mode
}

// ============ 路径相关类型 ============

export interface PathInfo {
  original: string
  normalized: string
  isAbsolute: boolean
  directory: string
  filename: string
  extension: string
  basename: string
}

export interface FilePermissions {
  readable: boolean
  writable: boolean
  executable: boolean
}

// ============ 拖放相关类型 ============

export interface DroppedFile {
  name: string
  path: string
  size: number
  type: string
  lastModified: number
}

export interface DragDropResult {
  success: boolean
  files: DroppedFile[]
  errors: string[]
}

export interface DragDropOptions {
  allowedExtensions?: string[]
  maxFileSize?: number // in bytes
  maxFiles?: number
}

// ============ Electron API 类型 ============

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    toggle: () => Promise<void>
  }
  tray: {
    setTooltip: (tooltip: string) => Promise<void>
    showBalloon: (title: string, content: string) => Promise<void>
  }
  shortcut: {
    getConfig: () => Promise<ShortcutConfig>
    updateConfig: (config: Partial<ShortcutConfig>) => Promise<boolean>
  }
  cache: {
    getMemo: (id: string) => Promise<CachedMemo | null>
    getAllMemos: () => Promise<CachedMemo[]>
    setMemo: (memo: CachedMemo) => Promise<void>
    deleteMemo: (id: string) => Promise<void>
    clear: () => Promise<void>
  }
  sync: {
    getStatus: () => Promise<SyncStatus>
    start: () => Promise<SyncResult>
    resolveConflict: (resolution: { conflictId: string; choice: 'local' | 'remote' }) => Promise<void>
    addOperation: (operation: SyncOperation) => Promise<void>
    getPending: () => Promise<SyncOperation[]>
  }
  network: {
    isOnline: () => Promise<boolean>
    check: () => Promise<boolean>
  }
  startup: {
    load: () => Promise<StartupLoadState>
    manualSync: () => Promise<SyncResult | null>
    getState: () => Promise<StartupLoadState>
    onCacheLoaded: (callback: (data: { memos: CachedMemo[] }) => void) => void
    onSyncComplete: (callback: (data: { result: SyncResult; memos: CachedMemo[] }) => void) => void
    onSyncConflicts: (callback: (data: { conflicts: SyncConflict[] }) => void) => void
    removeListeners: () => void
  }
  credential: {
    set: (service: string, account: string, password: string) => Promise<void>
    get: (service: string, account: string) => Promise<string | null>
    delete: (service: string, account: string) => Promise<boolean>
  }
  update: {
    check: () => Promise<UpdateInfo | null>
    download: () => Promise<void>
    install: () => Promise<void>
    onUpdateAvailable: (callback: (info: { version: string; releaseDate: string; releaseNotes: string }) => void) => void
    onDownloadProgress: (callback: (progress: number) => void) => void
    onUpdateDownloaded: (callback: () => void) => void
    removeListeners: () => void
  }
  notification: {
    show: (options: NotificationOptions) => Promise<void>
    setPreferences: (prefs: NotificationPreferences) => Promise<void>
    getPreferences: () => Promise<NotificationPreferences>
  }
  server: {
    start: (port?: number) => Promise<number>
    stop: () => Promise<void>
    getStatus: () => Promise<ServerStatus>
    getConfig: () => Promise<ServerConnectionConfig>
    setConfig: (config: Partial<ServerConnectionConfig>) => Promise<void>
    isFirstLaunch: () => Promise<boolean>
    completeSetup: () => Promise<void>
    validateUrl: (url: string) => Promise<ServerValidationResult>
    testConnection: (url: string) => Promise<ServerConnectionTestResult>
    switchMode: (mode: ConnectionMode, serverUrl?: string) => Promise<boolean>
  }
  // 平台相关 API
  platformInfo: {
    getPlatform: () => Platform
    getFeatures: () => PlatformFeatures
    setProgress: (value: number) => Promise<boolean>
    clearProgress: () => Promise<boolean>
    setBadgeCount: (count: number) => Promise<boolean>
    clearBadgeCount: () => Promise<boolean>
  }
  // 拖放相关 API
  dragDrop: {
    processFiles: (filePaths: string[]) => Promise<DragDropResult>
    validateFiles: (filePaths: string[]) => Promise<{ valid: string[]; invalid: { path: string; reason: string }[] }>
    startDrag: (filePath: string) => Promise<boolean>
  }
  platform: NodeJS.Platform
  onNavigate: (callback: (path: string) => void) => void
  removeNavigateListener: () => void
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI: ElectronAPI
    electronVersion?: {
      electron: string
      chrome: string
      node: string
    }
    electronEnv?: {
      isElectron: boolean
      platform: string
      arch: string
    }
  }
}
