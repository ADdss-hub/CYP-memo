/**
 * 托盘管理器
 * Manages the system tray icon and context menu
 */

import { Tray, Menu, nativeImage, app, MenuItemConstructorOptions } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 托盘菜单项接口
 */
export interface TrayMenuItem {
  label: string
  click?: () => void
  type?: 'normal' | 'separator' | 'submenu'
  submenu?: TrayMenuItem[]
  enabled?: boolean
  visible?: boolean
}

/**
 * 托盘管理器事件回调
 */
export interface TrayManagerCallbacks {
  onShowWindow?: () => void
  onHideWindow?: () => void
  onToggleWindow?: () => void
  onNewMemo?: () => void
  onOpenSettings?: () => void
  onQuit?: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private callbacks: TrayManagerCallbacks = {}
  private isWindowVisible = true

  /**
   * 创建系统托盘图标
   * @param callbacks 事件回调函数
   */
  createTray(callbacks: TrayManagerCallbacks = {}): Tray {
    this.callbacks = callbacks

    // 获取托盘图标路径
    const iconPath = this.getTrayIconPath()
    const icon = this.createTrayIcon(iconPath)

    this.tray = new Tray(icon)
    this.tray.setToolTip('CYP-memo')

    // 设置上下文菜单
    this.updateMenu()

    // 设置托盘图标点击事件
    this.setupTrayEvents()

    return this.tray
  }

  /**
   * 获取托盘图标路径
   */
  private getTrayIconPath(): string {
    // 根据平台选择不同的图标
    // Windows 使用 ico，其他平台使用 png
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    
    // 开发模式和生产模式的路径不同
    const isDev = !app.isPackaged
    if (isDev) {
      // 开发模式：从 dist/main/main/ 到 resources/
      return path.join(__dirname, '../../../resources', iconName)
    }
    // 生产模式：从 resources/resources/ 目录加载
    return path.join(process.resourcesPath || '', 'resources', iconName)
  }

  /**
   * 创建托盘图标
   */
  private createTrayIcon(iconPath: string): Electron.NativeImage {
    let icon: Electron.NativeImage

    try {
      icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        // 如果图标文件不存在，创建一个默认图标
        icon = this.createDefaultIcon()
      }
    } catch {
      // 创建默认图标
      icon = this.createDefaultIcon()
    }

    // macOS 需要设置为模板图标
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    return icon
  }

  /**
   * 创建默认图标（当图标文件不存在时）
   */
  private createDefaultIcon(): Electron.NativeImage {
    // 创建一个简单的 16x16 图标
    const size = process.platform === 'darwin' ? 22 : 16
    return nativeImage.createEmpty().resize({ width: size, height: size })
  }

  /**
   * 设置托盘事件
   */
  private setupTrayEvents(): void {
    if (!this.tray) return

    // 单击托盘图标 - 切换窗口显示/隐藏
    this.tray.on('click', () => {
      this.callbacks.onToggleWindow?.()
    })

    // 双击托盘图标 - 显示窗口（Windows）
    if (process.platform === 'win32') {
      this.tray.on('double-click', () => {
        this.callbacks.onShowWindow?.()
      })
    }
  }

  /**
   * 更新托盘菜单
   */
  updateMenu(): void {
    if (!this.tray) return

    const menuItems = this.buildDefaultMenu()
    const contextMenu = Menu.buildFromTemplate(menuItems)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 构建默认菜单
   */
  private buildDefaultMenu(): MenuItemConstructorOptions[] {
    const showHideLabel = this.isWindowVisible ? '隐藏窗口' : '显示窗口'

    return [
      {
        label: showHideLabel,
        click: () => {
          this.callbacks.onToggleWindow?.()
        },
      },
      { type: 'separator' },
      {
        label: '新建备忘录',
        click: () => {
          this.callbacks.onNewMemo?.()
        },
      },
      {
        label: '设置',
        click: () => {
          this.callbacks.onOpenSettings?.()
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.callbacks.onQuit?.()
        },
      },
    ]
  }

  /**
   * 使用自定义菜单项更新菜单
   */
  setMenu(items: TrayMenuItem[]): void {
    if (!this.tray) return

    const menuItems = this.convertMenuItems(items)
    const contextMenu = Menu.buildFromTemplate(menuItems)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 转换菜单项格式
   */
  private convertMenuItems(items: TrayMenuItem[]): MenuItemConstructorOptions[] {
    return items.map((item) => {
      const menuItem: MenuItemConstructorOptions = {
        label: item.label,
        type: item.type,
        enabled: item.enabled,
        visible: item.visible,
        click: item.click,
      }

      if (item.submenu) {
        menuItem.submenu = this.convertMenuItems(item.submenu)
      }

      return menuItem
    })
  }

  /**
   * 设置托盘图标
   */
  setIcon(iconPath: string): void {
    if (!this.tray) return

    const icon = this.createTrayIcon(iconPath)
    this.tray.setImage(icon)
  }

  /**
   * 设置托盘提示文字
   */
  setToolTip(tooltip: string): void {
    if (!this.tray) return
    this.tray.setToolTip(tooltip)
  }

  /**
   * 显示气泡通知（Windows）
   */
  showBalloon(title: string, content: string): void {
    if (!this.tray || process.platform !== 'win32') return

    this.tray.displayBalloon({
      title,
      content,
      iconType: 'info',
    })
  }

  /**
   * 更新窗口可见性状态（用于更新菜单显示）
   */
  setWindowVisible(visible: boolean): void {
    this.isWindowVisible = visible
    this.updateMenu()
  }

  /**
   * 获取托盘实例
   */
  getTray(): Tray | null {
    return this.tray
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

// 导出单例
export const trayManager = new TrayManager()
