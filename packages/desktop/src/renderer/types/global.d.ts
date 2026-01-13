/**
 * 全局类型声明
 * Global type declarations for the desktop renderer
 */

// 导入 ElectronAPI 类型
import type { 
  ElectronAPI,
  ServerConnectionConfig,
  NotificationPreferences,
  ShortcutConfig,
  ServerStatus,
  ServerValidationResult,
  ServerConnectionTestResult,
  ConnectionMode,
  UpdateInfo,
  SyncStatus,
  SyncResult,
  SyncConflict,
  CachedMemo,
  StartupLoadState,
  Platform,
  PlatformFeatures,
  DragDropResult
} from '../../shared/types'

// 重新导出类型以便其他文件使用
export type {
  ElectronAPI,
  ServerConnectionConfig,
  NotificationPreferences,
  ShortcutConfig,
  ServerStatus,
  ServerValidationResult,
  ServerConnectionTestResult,
  ConnectionMode,
  UpdateInfo,
  SyncStatus,
  SyncResult,
  SyncConflict,
  CachedMemo,
  StartupLoadState,
  Platform,
  PlatformFeatures,
  DragDropResult
}

// 扩展 Window 接口以包含 Electron API
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
