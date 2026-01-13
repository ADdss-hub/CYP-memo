/**
 * 窗口管理器
 * Manages the main application window, including state persistence and visibility
 */

import { BrowserWindow, screen, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { WindowState } from '../shared/types.js'

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 默认窗口配置
const DEFAULT_WINDOW_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
  isMaximized: false,
}

const MIN_WINDOW_WIDTH = 800
const MIN_WINDOW_HEIGHT = 600

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private windowState: WindowState = { ...DEFAULT_WINDOW_STATE }
  private configPath: string
  private isQuitting = false

  constructor() {
    // 配置文件路径：存储在用户数据目录
    this.configPath = path.join(app.getPath('userData'), 'window-state.json')
  }

  /**
   * 创建主窗口
   */
  createMainWindow(preloadPath: string, isDev: boolean, devServerUrl?: string): BrowserWindow {
    // 恢复窗口状态
    const savedState = this.restoreWindowState()
    if (savedState) {
      this.windowState = savedState
    }

    // 检查窗口位置是否在屏幕内
    if (!this.isPositionOnScreen(this.windowState.x, this.windowState.y)) {
      // 居中显示在主显示器上
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize
      this.windowState.x = Math.round((width - this.windowState.width) / 2)
      this.windowState.y = Math.round((height - this.windowState.height) / 2)
    }

    this.mainWindow = new BrowserWindow({
      x: this.windowState.x,
      y: this.windowState.y,
      width: this.windowState.width,
      height: this.windowState.height,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      title: 'CYP-memo',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
      titleBarStyle: 'default',
    })


    // 如果之前是最大化状态，恢复最大化
    if (this.windowState.isMaximized) {
      this.mainWindow.maximize()
    }

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
    })

    // 监听窗口状态变化
    this.setupWindowStateListeners()

    // 加载应用
    if (isDev && devServerUrl) {
      this.mainWindow.loadURL(devServerUrl)
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    return this.mainWindow
  }

  /**
   * 设置窗口状态监听器
   */
  private setupWindowStateListeners(): void {
    if (!this.mainWindow) return

    // 监听窗口移动
    this.mainWindow.on('move', () => {
      this.updateWindowState()
    })

    // 监听窗口大小变化
    this.mainWindow.on('resize', () => {
      this.updateWindowState()
    })

    // 监听最大化
    this.mainWindow.on('maximize', () => {
      this.windowState.isMaximized = true
      this.saveWindowState(this.windowState)
    })

    // 监听取消最大化
    this.mainWindow.on('unmaximize', () => {
      this.windowState.isMaximized = false
      this.updateWindowState()
    })

    // 监听窗口关闭 - 最小化到托盘而不是退出
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault()
        this.mainWindow?.hide()
      }
    })

    // 监听窗口关闭完成
    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }

  /**
   * 更新窗口状态（非最大化时）
   */
  private updateWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isMaximized()) return

    const bounds = this.mainWindow.getBounds()
    this.windowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: false,
    }
    this.saveWindowState(this.windowState)
  }


  /**
   * 获取当前窗口状态
   */
  getWindowState(): WindowState {
    return { ...this.windowState }
  }

  /**
   * 保存窗口状态到文件
   */
  saveWindowState(state: WindowState): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(state, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save window state:', error)
    }
  }

  /**
   * 从文件恢复窗口状态
   */
  restoreWindowState(): WindowState | null {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const state = JSON.parse(data) as WindowState
        // 验证状态数据
        if (this.isValidWindowState(state)) {
          return state
        }
      }
    } catch (error) {
      console.error('Failed to restore window state:', error)
    }
    return null
  }

  /**
   * 验证窗口状态数据是否有效
   */
  private isValidWindowState(state: unknown): state is WindowState {
    if (!state || typeof state !== 'object') return false
    const s = state as Record<string, unknown>
    return (
      typeof s.x === 'number' &&
      typeof s.y === 'number' &&
      typeof s.width === 'number' &&
      typeof s.height === 'number' &&
      typeof s.isMaximized === 'boolean' &&
      s.width >= MIN_WINDOW_WIDTH &&
      s.height >= MIN_WINDOW_HEIGHT
    )
  }

  /**
   * 检查位置是否在任意屏幕内
   */
  isPositionOnScreen(x: number, y: number): boolean {
    const displays = screen.getAllDisplays()
    for (const display of displays) {
      const { x: dx, y: dy, width, height } = display.bounds
      // 检查窗口左上角是否在显示器范围内（留出一定边距）
      if (x >= dx - 100 && x < dx + width && y >= dy - 100 && y < dy + height) {
        return true
      }
    }
    return false
  }


  /**
   * 切换窗口可见性
   */
  toggleVisibility(): void {
    if (!this.mainWindow) return

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide()
    } else {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * 显示窗口
   */
  show(): void {
    if (!this.mainWindow) return
    this.mainWindow.show()
    this.mainWindow.focus()
  }

  /**
   * 隐藏窗口
   */
  hide(): void {
    if (!this.mainWindow) return
    this.mainWindow.hide()
  }

  /**
   * 最小化窗口
   */
  minimize(): void {
    if (!this.mainWindow) return
    this.mainWindow.minimize()
  }

  /**
   * 最大化/还原窗口
   */
  maximize(): void {
    if (!this.mainWindow) return
    if (this.mainWindow.isMaximized()) {
      this.mainWindow.unmaximize()
    } else {
      this.mainWindow.maximize()
    }
  }

  /**
   * 关闭窗口（隐藏到托盘）
   */
  close(): void {
    if (!this.mainWindow) return
    this.mainWindow.hide()
  }

  /**
   * 设置是否正在退出应用
   */
  setQuitting(quitting: boolean): void {
    this.isQuitting = quitting
  }

  /**
   * 获取主窗口实例
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * 检查窗口是否可见
   */
  isVisible(): boolean {
    return this.mainWindow?.isVisible() ?? false
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    if (this.mainWindow) {
      this.isQuitting = true
      this.mainWindow.destroy()
      this.mainWindow = null
    }
  }
}

// 导出单例
export const windowManager = new WindowManager()
