/**
 * IPC 消息验证工具
 * IPC message validation utilities for secure main-renderer communication
 */

import { IPC_CHANNELS, type IPCChannel } from './ipc-channels.js'
import type {
  ShortcutConfig,
  CachedMemo,
  NotificationOptions,
  NotificationPreferences,
  CredentialRequest,
} from './types.js'

// ============ 验证结果类型 ============

export interface ValidationResult {
  valid: boolean
  error?: string
}

// ============ 通道验证 ============

/**
 * 验证 IPC 通道是否有效
 */
export function isValidChannel(channel: string): channel is IPCChannel {
  return Object.values(IPC_CHANNELS).includes(channel as IPCChannel)
}

/**
 * 获取所有有效的 IPC 通道
 */
export function getAllChannels(): IPCChannel[] {
  return Object.values(IPC_CHANNELS)
}

// ============ 消息验证器 ============

/**
 * 验证字符串类型
 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * 验证数字类型
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * 验证布尔类型
 */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * 验证对象类型
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ============ 快捷键配置验证 ============

/**
 * 验证快捷键格式
 * 有效格式: CommandOrControl+Shift+Key, Ctrl+Alt+Key 等
 */
export function isValidAccelerator(accelerator: string): boolean {
  if (!isString(accelerator) || accelerator.length === 0) {
    return false
  }

  // 快捷键格式正则表达式
  const acceleratorPattern =
    /^(CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)(\+(CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta))*\+([A-Za-z0-9]|F[1-9]|F1[0-2]|Plus|Space|Tab|Capslock|Numlock|Scrolllock|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv)$/i

  return acceleratorPattern.test(accelerator)
}

/**
 * 验证快捷键配置
 */
export function validateShortcutConfig(config: unknown): ValidationResult {
  if (!isObject(config)) {
    return { valid: false, error: 'Config must be an object' }
  }

  const { quickMemo, toggleWindow } = config as Partial<ShortcutConfig>

  if (quickMemo !== undefined) {
    if (!isString(quickMemo)) {
      return { valid: false, error: 'quickMemo must be a string' }
    }
    if (!isValidAccelerator(quickMemo)) {
      return { valid: false, error: 'quickMemo is not a valid accelerator' }
    }
  }

  if (toggleWindow !== undefined) {
    if (!isString(toggleWindow)) {
      return { valid: false, error: 'toggleWindow must be a string' }
    }
    if (!isValidAccelerator(toggleWindow)) {
      return { valid: false, error: 'toggleWindow is not a valid accelerator' }
    }
  }

  return { valid: true }
}

// ============ 缓存备忘录验证 ============

/**
 * 验证缓存的备忘录数据
 */
export function validateCachedMemo(memo: unknown): ValidationResult {
  if (!isObject(memo)) {
    return { valid: false, error: 'Memo must be an object' }
  }

  const { id, title, content, createdAt, updatedAt, version } = memo as Partial<CachedMemo>

  if (!isString(id) || id.length === 0) {
    return { valid: false, error: 'Memo id must be a non-empty string' }
  }

  if (!isString(title)) {
    return { valid: false, error: 'Memo title must be a string' }
  }

  if (!isString(content)) {
    return { valid: false, error: 'Memo content must be a string' }
  }

  if (!isNumber(createdAt) || createdAt < 0) {
    return { valid: false, error: 'Memo createdAt must be a positive number' }
  }

  if (!isNumber(updatedAt) || updatedAt < 0) {
    return { valid: false, error: 'Memo updatedAt must be a positive number' }
  }

  if (!isNumber(version) || version < 0) {
    return { valid: false, error: 'Memo version must be a non-negative number' }
  }

  return { valid: true }
}

// ============ 通知选项验证 ============

/**
 * 验证通知选项
 */
export function validateNotificationOptions(options: unknown): ValidationResult {
  if (!isObject(options)) {
    return { valid: false, error: 'Options must be an object' }
  }

  const { title, body, icon, silent } = options as Partial<NotificationOptions>

  if (!isString(title) || title.length === 0) {
    return { valid: false, error: 'Notification title must be a non-empty string' }
  }

  if (!isString(body)) {
    return { valid: false, error: 'Notification body must be a string' }
  }

  if (icon !== undefined && !isString(icon)) {
    return { valid: false, error: 'Notification icon must be a string' }
  }

  if (silent !== undefined && !isBoolean(silent)) {
    return { valid: false, error: 'Notification silent must be a boolean' }
  }

  return { valid: true }
}

/**
 * 验证通知偏好设置
 */
export function validateNotificationPreferences(prefs: unknown): ValidationResult {
  if (!isObject(prefs)) {
    return { valid: false, error: 'Preferences must be an object' }
  }

  const { enabled, showOnShare, showOnSync, sound } = prefs as Partial<NotificationPreferences>

  if (enabled !== undefined && !isBoolean(enabled)) {
    return { valid: false, error: 'enabled must be a boolean' }
  }

  if (showOnShare !== undefined && !isBoolean(showOnShare)) {
    return { valid: false, error: 'showOnShare must be a boolean' }
  }

  if (showOnSync !== undefined && !isBoolean(showOnSync)) {
    return { valid: false, error: 'showOnSync must be a boolean' }
  }

  if (sound !== undefined && !isBoolean(sound)) {
    return { valid: false, error: 'sound must be a boolean' }
  }

  return { valid: true }
}

// ============ 凭证请求验证 ============

/**
 * 验证凭证请求
 */
export function validateCredentialRequest(request: unknown): ValidationResult {
  if (!isObject(request)) {
    return { valid: false, error: 'Request must be an object' }
  }

  const { service, account, password } = request as Partial<CredentialRequest>

  if (!isString(service) || service.length === 0) {
    return { valid: false, error: 'Service must be a non-empty string' }
  }

  if (!isString(account) || account.length === 0) {
    return { valid: false, error: 'Account must be a non-empty string' }
  }

  // password 是可选的（用于 get/delete 操作）
  if (password !== undefined && !isString(password)) {
    return { valid: false, error: 'Password must be a string' }
  }

  return { valid: true }
}

// ============ 同步冲突解决验证 ============

/**
 * 验证同步冲突解决请求
 */
export function validateConflictResolution(resolution: unknown): ValidationResult {
  if (!isObject(resolution)) {
    return { valid: false, error: 'Resolution must be an object' }
  }

  const { conflictId, choice } = resolution as { conflictId?: unknown; choice?: unknown }

  if (!isString(conflictId) || conflictId.length === 0) {
    return { valid: false, error: 'conflictId must be a non-empty string' }
  }

  if (choice !== 'local' && choice !== 'remote') {
    return { valid: false, error: 'choice must be "local" or "remote"' }
  }

  return { valid: true }
}

// ============ 服务器端口验证 ============

/**
 * 验证服务器端口
 */
export function validatePort(port: unknown): ValidationResult {
  if (port === undefined || port === null) {
    return { valid: true } // 端口是可选的
  }

  if (!isNumber(port)) {
    return { valid: false, error: 'Port must be a number' }
  }

  if (port < 1 || port > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' }
  }

  return { valid: true }
}

// ============ ID 验证 ============

/**
 * 验证 ID 字符串
 */
export function validateId(id: unknown): ValidationResult {
  if (!isString(id) || id.length === 0) {
    return { valid: false, error: 'ID must be a non-empty string' }
  }

  return { valid: true }
}

// ============ IPC 消息验证器映射 ============

type ValidatorFunction = (data: unknown) => ValidationResult

/**
 * IPC 通道对应的验证器映射
 */
export const channelValidators: Partial<Record<IPCChannel, ValidatorFunction>> = {
  [IPC_CHANNELS.SHORTCUT_UPDATE_CONFIG]: validateShortcutConfig,
  [IPC_CHANNELS.CACHE_GET_MEMO]: validateId,
  [IPC_CHANNELS.CACHE_SET_MEMO]: validateCachedMemo,
  [IPC_CHANNELS.CACHE_DELETE_MEMO]: validateId,
  [IPC_CHANNELS.SYNC_RESOLVE_CONFLICT]: validateConflictResolution,
  [IPC_CHANNELS.CREDENTIAL_SET]: validateCredentialRequest,
  [IPC_CHANNELS.CREDENTIAL_GET]: validateCredentialRequest,
  [IPC_CHANNELS.CREDENTIAL_DELETE]: validateCredentialRequest,
  [IPC_CHANNELS.NOTIFICATION_SHOW]: validateNotificationOptions,
  [IPC_CHANNELS.NOTIFICATION_SET_PREFS]: validateNotificationPreferences,
  [IPC_CHANNELS.SERVER_START]: validatePort,
}

/**
 * 验证 IPC 消息
 */
export function validateIPCMessage(channel: string, data: unknown): ValidationResult {
  // 首先验证通道是否有效
  if (!isValidChannel(channel)) {
    return { valid: false, error: `Invalid IPC channel: ${channel}` }
  }

  // 获取对应的验证器
  const validator = channelValidators[channel]

  // 如果没有验证器，默认通过（某些通道不需要参数）
  if (!validator) {
    return { valid: true }
  }

  // 执行验证
  return validator(data)
}
