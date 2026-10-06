/**
 * CYP-memo 共享库入口
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export * from './config/version'
export * from './config/resolveApiBase'
export * from './security/csp'
export * from './security/sanitizeHtml'
export * from './tls/identity'
export * from './types'
export * from './database'
export type {
  StorageMode,
  StorageConfig,
  QueryOptions,
  IStorageAdapter,
  StorageAdapterFactory,
} from './storage'
export { LocalStorageAdapter, localStorageAdapter } from './storage'
export { RemoteStorageAdapter } from './storage'
export { storageManager, getStorage } from './storage'
export * from './utils/crypto'
export * from './utils/validation'
export * from './utils/format'
export * from './utils/performance'
export * from './utils/worker-pool'
export * from './cache/snapshot-types'
/** SIX-LOG 信封；不 re-export LogLevel（与 types.LogLevel 枚举撞名） */
export {
  redactSensitive,
  buildLogEnvelope,
  type LogLevelName,
  type LogType,
  type LogInput,
  type LogEnvelope,
} from './logging/log-envelope'
export * from './managers/AuthManager'
/** 平行管理员身份已退役：禁止再导出 Admin* 鉴权面 */
export * from './managers/LogManager'
export * from './managers/MemoManager'
export * from './managers/FileManager'
export * from './managers/PermissionManager'
export * from './managers/WelcomeManager'
export * from './managers/DataManager'
export * from './managers/CleanupManager'
export * from './managers/ShareManager'
export * from './managers/InitManager'
export * from './services/VersionChecker'
/** SIX-LOG：浏览器/渲染进程客户端错误上报 */
export {
  reportClientError,
  configureClientErrorReporting,
  installClientErrorReporting,
  reportVueError,
  type ClientErrorReport,
  type ClientErrorReportingOptions,
} from './observability/reportClientError'
