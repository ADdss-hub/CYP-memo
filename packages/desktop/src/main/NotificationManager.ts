/**
 * 通知管理器
 * Manages system notifications for the desktop client
 * 
 * Requirements:
 * - 6.1: Show notification when a new memo is shared
 * - 6.2: Show notification when sync completes with changes
 * - 6.3: Handle notification click to open related memo/view
 * - 6.4: Respect notification preferences (enabled/disabled)
 * - 6.5: Use native system notification API for each platform
 */

import { Notification, nativeImage, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { NotificationOptions, NotificationPreferences } from '../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 默认通知偏好设置
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  showOnShare: true,
  showOnSync: true,
  sound: true,
}

/**
 * 通知点击回调
 */
export interface NotificationClickCallback {
  (data?: unknown): void
}

/**
 * 通知管理器类
 */
export class NotificationManager {
  private preferences: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  private configPath: string
  private onClickCallback: NotificationClickCallback | null = null

  constructor() {
    // 配置文件路径：存储在用户数据目录
    this.configPath = path.join(app.getPath('userData'), 'notification-config.json')
    // 加载保存的配置
    this.loadPreferences()
  }

  /**
   * 检查系统是否支持通知
   */
  isSupported(): boolean {
    return Notification.isSupported()
  }

  /**
   * 显示通知
   * @param options 通知选项
   */
  show(options: NotificationOptions): void {
    // 检查通知是否启用
    if (!this.preferences.enabled) {
      return
    }

    // 检查系统是否支持通知
    if (!this.isSupported()) {
      return
    }

    // 创建通知
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: this.getNotificationIcon(options.icon),
      silent: options.silent ?? !this.preferences.sound,
    })

    // 处理通知点击事件
    notification.on('click', () => {
      this.handleNotificationClick(options.data)
    })

    // 显示通知
    notification.show()
  }

  /**
   * 显示分享通知
   * @param memoTitle 备忘录标题
   * @param sharedBy 分享者
   * @param memoId 备忘录ID
   */
  showShareNotification(memoTitle: string, sharedBy: string, memoId?: string): void {
    if (!this.preferences.showOnShare) {
      return
    }

    this.show({
      title: '收到新的分享',
      body: `${sharedBy} 分享了备忘录: ${memoTitle}`,
      data: { type: 'share', memoId },
    })
  }

  /**
   * 显示同步完成通知
   * @param syncedCount 同步的数量
   * @param hasConflicts 是否有冲突
   */
  showSyncNotification(syncedCount: number, hasConflicts: boolean): void {
    if (!this.preferences.showOnSync) {
      return
    }

    // 只有在有变更时才显示通知
    if (syncedCount === 0 && !hasConflicts) {
      return
    }

    let body: string
    if (hasConflicts) {
      body = `同步完成，有 ${syncedCount} 项更新，存在冲突需要处理`
    } else {
      body = `同步完成，共 ${syncedCount} 项更新`
    }

    this.show({
      title: '同步完成',
      body,
      data: { type: 'sync', hasConflicts },
    })
  }

  /**
   * 获取通知图标
   */
  private getNotificationIcon(customIcon?: string): Electron.NativeImage | undefined {
    if (customIcon) {
      try {
        const icon = nativeImage.createFromPath(customIcon)
        if (!icon.isEmpty()) {
          return icon
        }
      } catch {
        // 忽略错误，使用默认图标
      }
    }

    // 尝试使用应用图标
    const iconPath = this.getDefaultIconPath()
    if (iconPath) {
      try {
        const icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) {
          return icon
        }
      } catch {
        // 忽略错误
      }
    }

    return undefined
  }

  /**
   * 获取默认图标路径
   */
  private getDefaultIconPath(): string | null {
    const isDev = process.env.NODE_ENV === 'development'
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'

    if (isDev) {
      return path.join(__dirname, '../../resources', iconName)
    }

    if (process.resourcesPath) {
      return path.join(process.resourcesPath, 'resources', iconName)
    }

    return null
  }

  /**
   * 处理通知点击
   */
  private handleNotificationClick(data?: unknown): void {
    if (this.onClickCallback) {
      this.onClickCallback(data)
    }
  }

  /**
   * 设置通知点击回调
   * @param callback 点击回调函数
   */
  setClickCallback(callback: NotificationClickCallback): void {
    this.onClickCallback = callback
  }

  /**
   * 设置通知偏好
   * @param prefs 通知偏好设置
   */
  setPreferences(prefs: NotificationPreferences): void {
    this.preferences = { ...this.preferences, ...prefs }
    this.savePreferences()
  }

  /**
   * 获取通知偏好
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences }
  }

  /**
   * 检查通知是否启用
   */
  isEnabled(): boolean {
    return this.preferences.enabled
  }

  /**
   * 保存偏好设置到文件
   */
  private savePreferences(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.preferences, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save notification preferences:', error)
    }
  }

  /**
   * 从文件加载偏好设置
   */
  private loadPreferences(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const prefs = JSON.parse(data) as NotificationPreferences

        // 验证配置数据
        if (this.isValidPreferences(prefs)) {
          this.preferences = prefs
        }
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error)
    }
  }

  /**
   * 验证偏好设置数据是否有效
   */
  private isValidPreferences(prefs: unknown): prefs is NotificationPreferences {
    if (!prefs || typeof prefs !== 'object') return false
    const p = prefs as Record<string, unknown>
    return (
      typeof p.enabled === 'boolean' &&
      typeof p.showOnShare === 'boolean' &&
      typeof p.showOnSync === 'boolean' &&
      typeof p.sound === 'boolean'
    )
  }

  /**
   * 重置为默认偏好设置
   */
  resetToDefault(): void {
    this.preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
    this.savePreferences()
  }
}

// 单例实例
let notificationManagerInstance: NotificationManager | null = null

/**
 * 获取通知管理器实例
 */
export function getNotificationManager(): NotificationManager {
  if (!notificationManagerInstance) {
    notificationManagerInstance = new NotificationManager()
  }
  return notificationManagerInstance
}

/**
 * 重置通知管理器（用于测试）
 */
export function resetNotificationManager(): void {
  notificationManagerInstance = null
}

// 导出默认实例
export const notificationManager = getNotificationManager()
