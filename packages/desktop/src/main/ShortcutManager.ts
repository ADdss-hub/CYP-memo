/**
 * 快捷键管理器
 * Manages global keyboard shortcuts registration and configuration
 */

import { globalShortcut, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { ShortcutConfig } from '../shared/types.js'

// 默认快捷键配置
const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  quickMemo: 'CommandOrControl+Shift+M',
  toggleWindow: 'CommandOrControl+Shift+N',
}

// 有效的修饰键
const VALID_MODIFIERS = [
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
]

// 有效的按键（部分常用）
const VALID_KEYS = [
  // 字母键
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  // 数字键
  ...'0123456789'.split(''),
  // 功能键
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  // 特殊键
  'Space',
  'Tab',
  'Capslock',
  'Numlock',
  'Scrolllock',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'MediaPlayPause',
  'PrintScreen',
  'Plus',
  'numadd',
  'numsub',
  'numdec',
  'nummult',
  'numdiv',
]

/**
 * 快捷键回调函数类型
 */
export type ShortcutCallback = () => void

/**
 * 快捷键管理器事件回调
 */
export interface ShortcutManagerCallbacks {
  onQuickMemo?: ShortcutCallback
  onToggleWindow?: ShortcutCallback
}

export class ShortcutManager {
  private config: ShortcutConfig = { ...DEFAULT_SHORTCUT_CONFIG }
  private configPath: string
  private callbacks: ShortcutManagerCallbacks = {}
  private registeredShortcuts: Map<string, ShortcutCallback> = new Map()

  constructor() {
    // 配置文件路径：存储在用户数据目录
    this.configPath = path.join(app.getPath('userData'), 'shortcut-config.json')
  }

  /**
   * 初始化快捷键管理器
   * @param callbacks 事件回调函数
   */
  initialize(callbacks: ShortcutManagerCallbacks = {}): void {
    this.callbacks = callbacks

    // 加载保存的配置
    const savedConfig = this.loadConfig()
    if (savedConfig) {
      this.config = savedConfig
    }

    // 注册默认快捷键
    this.registerDefaultShortcuts()
  }

  /**
   * 注册默认快捷键
   */
  private registerDefaultShortcuts(): void {
    // 注册快速备忘录快捷键
    if (this.config.quickMemo && this.callbacks.onQuickMemo) {
      this.register(this.config.quickMemo, this.callbacks.onQuickMemo)
    }

    // 注册显示/隐藏窗口快捷键
    if (this.config.toggleWindow && this.callbacks.onToggleWindow) {
      this.register(this.config.toggleWindow, this.callbacks.onToggleWindow)
    }
  }

  /**
   * 注册快捷键
   * @param accelerator 快捷键字符串
   * @param callback 回调函数
   * @returns 是否注册成功
   */
  register(accelerator: string, callback: ShortcutCallback): boolean {
    // 验证快捷键格式
    if (!this.validateAccelerator(accelerator)) {
      console.error(`Invalid shortcut format: ${accelerator}`)
      return false
    }

    // 检查是否已被其他应用注册（冲突检测）
    if (this.isRegistered(accelerator)) {
      console.warn(`Shortcut already registered: ${accelerator}`)
      return false
    }

    try {
      const success = globalShortcut.register(accelerator, callback)
      if (success) {
        this.registeredShortcuts.set(accelerator, callback)
      }
      return success
    } catch (error) {
      console.error(`Failed to register shortcut ${accelerator}:`, error)
      return false
    }
  }

  /**
   * 注销快捷键
   * @param accelerator 快捷键字符串
   */
  unregister(accelerator: string): void {
    try {
      globalShortcut.unregister(accelerator)
      this.registeredShortcuts.delete(accelerator)
    } catch (error) {
      console.error(`Failed to unregister shortcut ${accelerator}:`, error)
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registeredShortcuts.clear()
  }

  /**
   * 检查快捷键是否已注册
   * @param accelerator 快捷键字符串
   * @returns 是否已注册
   */
  isRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator)
  }

  /**
   * 验证快捷键格式
   * @param accelerator 快捷键字符串
   * @returns 是否有效
   */
  validateAccelerator(accelerator: string): boolean {
    if (!accelerator || typeof accelerator !== 'string') {
      return false
    }

    // 分割快捷键字符串
    const parts = accelerator.split('+').map((p) => p.trim())

    if (parts.length === 0) {
      return false
    }

    // 最后一个部分应该是按键
    const key = parts[parts.length - 1]
    const modifiers = parts.slice(0, -1)

    // 验证按键
    if (!this.isValidKey(key)) {
      return false
    }

    // 验证修饰键
    for (const modifier of modifiers) {
      if (!this.isValidModifier(modifier)) {
        return false
      }
    }

    // 至少需要一个修饰键（全局快捷键通常需要）
    if (modifiers.length === 0) {
      return false
    }

    return true
  }

  /**
   * 检查是否是有效的按键
   */
  private isValidKey(key: string): boolean {
    return VALID_KEYS.some((k) => k.toLowerCase() === key.toLowerCase())
  }

  /**
   * 检查是否是有效的修饰键
   */
  private isValidModifier(modifier: string): boolean {
    return VALID_MODIFIERS.some((m) => m.toLowerCase() === modifier.toLowerCase())
  }

  /**
   * 获取当前配置
   */
  getConfig(): ShortcutConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   * @param newConfig 新配置（部分）
   * @returns 是否更新成功
   */
  updateConfig(newConfig: Partial<ShortcutConfig>): boolean {
    const updatedConfig = { ...this.config }
    let hasChanges = false

    // 更新快速备忘录快捷键
    if (newConfig.quickMemo !== undefined && newConfig.quickMemo !== this.config.quickMemo) {
      if (!this.validateAccelerator(newConfig.quickMemo)) {
        console.error(`Invalid quickMemo shortcut: ${newConfig.quickMemo}`)
        return false
      }

      // 检查冲突（排除当前已注册的）
      if (this.checkConflict(newConfig.quickMemo, this.config.quickMemo)) {
        console.error(`Shortcut conflict: ${newConfig.quickMemo}`)
        return false
      }

      // 注销旧快捷键
      if (this.config.quickMemo) {
        this.unregister(this.config.quickMemo)
      }

      // 注册新快捷键
      if (this.callbacks.onQuickMemo) {
        if (!this.register(newConfig.quickMemo, this.callbacks.onQuickMemo)) {
          // 注册失败，恢复旧快捷键
          if (this.config.quickMemo && this.callbacks.onQuickMemo) {
            this.register(this.config.quickMemo, this.callbacks.onQuickMemo)
          }
          return false
        }
      }

      updatedConfig.quickMemo = newConfig.quickMemo
      hasChanges = true
    }

    // 更新显示/隐藏窗口快捷键
    if (
      newConfig.toggleWindow !== undefined &&
      newConfig.toggleWindow !== this.config.toggleWindow
    ) {
      if (!this.validateAccelerator(newConfig.toggleWindow)) {
        console.error(`Invalid toggleWindow shortcut: ${newConfig.toggleWindow}`)
        return false
      }

      // 检查冲突
      if (this.checkConflict(newConfig.toggleWindow, this.config.toggleWindow)) {
        console.error(`Shortcut conflict: ${newConfig.toggleWindow}`)
        return false
      }

      // 注销旧快捷键
      if (this.config.toggleWindow) {
        this.unregister(this.config.toggleWindow)
      }

      // 注册新快捷键
      if (this.callbacks.onToggleWindow) {
        if (!this.register(newConfig.toggleWindow, this.callbacks.onToggleWindow)) {
          // 注册失败，恢复旧快捷键
          if (this.config.toggleWindow && this.callbacks.onToggleWindow) {
            this.register(this.config.toggleWindow, this.callbacks.onToggleWindow)
          }
          return false
        }
      }

      updatedConfig.toggleWindow = newConfig.toggleWindow
      hasChanges = true
    }

    if (hasChanges) {
      this.config = updatedConfig
      this.saveConfig(this.config)
    }

    return true
  }

  /**
   * 检查快捷键冲突
   * @param newAccelerator 新快捷键
   * @param currentAccelerator 当前快捷键（排除）
   * @returns 是否有冲突
   */
  private checkConflict(newAccelerator: string, currentAccelerator?: string): boolean {
    // 如果新快捷键与当前快捷键相同，不算冲突
    if (newAccelerator === currentAccelerator) {
      return false
    }

    // 检查是否与其他已注册的快捷键冲突
    for (const [registered] of this.registeredShortcuts) {
      if (registered !== currentAccelerator && registered === newAccelerator) {
        return true
      }
    }

    // 检查系统级别是否已注册
    if (this.isRegistered(newAccelerator)) {
      return true
    }

    return false
  }

  /**
   * 保存配置到文件
   */
  saveConfig(config: ShortcutConfig): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save shortcut config:', error)
    }
  }

  /**
   * 从文件加载配置
   */
  loadConfig(): ShortcutConfig | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const config = JSON.parse(data) as ShortcutConfig

        // 验证配置数据
        if (this.isValidConfig(config)) {
          return config
        }
      }
    } catch (error) {
      console.error('Failed to load shortcut config:', error)
    }
    return null
  }

  /**
   * 验证配置数据是否有效
   */
  private isValidConfig(config: unknown): config is ShortcutConfig {
    if (!config || typeof config !== 'object') return false
    const c = config as Record<string, unknown>
    return (
      typeof c.quickMemo === 'string' &&
      typeof c.toggleWindow === 'string' &&
      this.validateAccelerator(c.quickMemo) &&
      this.validateAccelerator(c.toggleWindow)
    )
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    // 注销所有当前快捷键
    this.unregisterAll()

    // 恢复默认配置
    this.config = { ...DEFAULT_SHORTCUT_CONFIG }

    // 重新注册默认快捷键
    this.registerDefaultShortcuts()

    // 保存配置
    this.saveConfig(this.config)
  }

  /**
   * 销毁快捷键管理器
   */
  destroy(): void {
    this.unregisterAll()
  }
}

// 导出单例
export const shortcutManager = new ShortcutManager()
