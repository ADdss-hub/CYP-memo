/**
 * 桌面客户端组合式函数导出
 * Desktop client composables exports
 */

export {
  isElectron,
  getElectronAPI,
  useElectron,
  useWindow,
  useNavigation,
  useNetworkStatus,
  useNotifications,
  usePlatformFeatures,
} from './useElectron'

// 重新导出以便于使用
export type { ElectronAPI } from '../shared/types'
