/**
 * CYP-memo 桌面客户端主进程入口
 * Main process entry point for the Electron desktop client
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { windowManager } from './WindowManager.js'
import { menuManager } from './MenuManager.js'
import { trayManager } from './TrayManager.js'
import { shortcutManager } from './ShortcutManager.js'
import { credentialManager } from './CredentialManager.js'
import { getCacheManager } from './CacheManager.js'
import { logoutManager } from './LogoutManager.js'
import { getNetworkManager } from './NetworkManager.js'
import { getSyncManager } from './SyncManager.js'
import { getConflictResolver } from './ConflictResolver.js'
import { getStartupLoader } from './StartupLoader.js'
import { getNotificationManager } from './NotificationManager.js'
import { getUpdateManager } from './UpdateManager.js'
import { getServerConnectionManager } from './ServerConnectionManager.js'
import { getEmbeddedServer } from './EmbeddedServer.js'
import { getSecurityManager } from './SecurityManager.js'
import { IPC_CHANNELS } from '../shared/ipc-channels.js'
import type { ShortcutConfig, CachedMemo, SyncOperation, NotificationOptions, NotificationPreferences, ServerConnectionConfig, ConnectionMode } from '../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 开发模式标志
const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174'

/**
 * 设置 IPC 处理器
 */
function setupIPCHandlers(): void {
  // 窗口操作
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    windowManager.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    windowManager.maximize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    windowManager.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE, () => {
    windowManager.toggleVisibility()
  })

  // 托盘操作
  ipcMain.handle(IPC_CHANNELS.TRAY_SET_TOOLTIP, (_event, tooltip: string) => {
    trayManager.setToolTip(tooltip)
  })

  ipcMain.handle(IPC_CHANNELS.TRAY_SHOW_BALLOON, (_event, title: string, content: string) => {
    trayManager.showBalloon(title, content)
  })

  // 快捷键操作
  ipcMain.handle(IPC_CHANNELS.SHORTCUT_GET_CONFIG, () => {
    return shortcutManager.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.SHORTCUT_UPDATE_CONFIG, (_event, config: Partial<ShortcutConfig>) => {
    return shortcutManager.updateConfig(config)
  })

  // 凭证操作
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_SET, async (_event, { service, account, password }: { service: string; account: string; password: string }) => {
    await credentialManager.setCredential(service, account, password)
  })

  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_GET, async (_event, { service, account }: { service: string; account: string }) => {
    return await credentialManager.getCredential(service, account)
  })

  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_DELETE, async (_event, { service, account }: { service: string; account: string }) => {
    return await credentialManager.deleteCredential(service, account)
  })

  // 缓存操作
  ipcMain.handle(IPC_CHANNELS.CACHE_GET_MEMO, async (_event, id: string) => {
    const cacheManager = getCacheManager()
    if (!cacheManager.isInitialized()) {
      return null
    }
    return await cacheManager.getCachedMemo(id)
  })

  ipcMain.handle(IPC_CHANNELS.CACHE_GET_ALL_MEMOS, async () => {
    const cacheManager = getCacheManager()
    if (!cacheManager.isInitialized()) {
      return []
    }
    return await cacheManager.getAllCachedMemos()
  })

  ipcMain.handle(IPC_CHANNELS.CACHE_SET_MEMO, async (_event, memo: CachedMemo) => {
    const cacheManager = getCacheManager()
    if (!cacheManager.isInitialized()) {
      throw new Error('Cache not initialized')
    }
    await cacheManager.cacheMemo(memo)
  })

  ipcMain.handle(IPC_CHANNELS.CACHE_DELETE_MEMO, async (_event, id: string) => {
    const cacheManager = getCacheManager()
    if (!cacheManager.isInitialized()) {
      return
    }
    await cacheManager.deleteCachedMemo(id)
  })

  ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR, async () => {
    // 登出清理 - 清除所有用户缓存数据
    // 需求 5.5: 当用户登出时，桌面客户端应清除所有缓存的用户数据
    return await logoutManager.clearAllCache()
  })

  // 网络状态操作
  ipcMain.handle(IPC_CHANNELS.NETWORK_STATUS, () => {
    const networkManager = getNetworkManager()
    return networkManager.isOnline()
  })

  ipcMain.handle(IPC_CHANNELS.NETWORK_CHECK, async () => {
    const networkManager = getNetworkManager()
    return await networkManager.checkNetworkStatus()
  })

  // 同步操作
  ipcMain.handle(IPC_CHANNELS.SYNC_STATUS, async () => {
    const syncManager = getSyncManager()
    if (!syncManager.isInitialized()) {
      return {
        isOnline: getNetworkManager().isOnline(),
        pendingOperations: 0,
        lastSyncTime: null,
        conflicts: [],
      }
    }
    return await syncManager.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_START, async () => {
    const syncManager = getSyncManager()
    if (!syncManager.isInitialized()) {
      return {
        success: false,
        synced: 0,
        conflicts: [],
        errors: ['Sync manager not initialized'],
      }
    }
    return await syncManager.sync()
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_RESOLVE_CONFLICT, async (_event, { entityId, resolution }: { entityId: string; resolution: 'local' | 'remote' }) => {
    const conflictResolver = getConflictResolver()
    return await conflictResolver.resolveConflict(entityId, resolution)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_ADD_OPERATION, async (_event, operation: SyncOperation) => {
    const syncManager = getSyncManager()
    if (!syncManager.isInitialized()) {
      throw new Error('Sync manager not initialized')
    }
    await syncManager.addPendingOperation(operation)
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_GET_PENDING, async () => {
    const syncManager = getSyncManager()
    if (!syncManager.isInitialized()) {
      return []
    }
    return await syncManager.getPendingOperations()
  })

  // 启动加载操作
  ipcMain.handle(IPC_CHANNELS.STARTUP_LOAD, async () => {
    const startupLoader = getStartupLoader()
    return await startupLoader.load()
  })

  ipcMain.handle(IPC_CHANNELS.STARTUP_MANUAL_SYNC, async () => {
    const startupLoader = getStartupLoader()
    return await startupLoader.manualSync()
  })

  ipcMain.handle(IPC_CHANNELS.STARTUP_STATE, () => {
    const startupLoader = getStartupLoader()
    return startupLoader.getState()
  })

  // 通知操作
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SHOW, (_event, options: NotificationOptions) => {
    const notificationManager = getNotificationManager()
    notificationManager.show(options)
  })

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SET_PREFS, (_event, prefs: NotificationPreferences) => {
    const notificationManager = getNotificationManager()
    notificationManager.setPreferences(prefs)
  })

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_PREFS, () => {
    const notificationManager = getNotificationManager()
    return notificationManager.getPreferences()
  })

  // 更新操作
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    const updateManager = getUpdateManager()
    return await updateManager.checkForUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    const updateManager = getUpdateManager()
    await updateManager.downloadUpdate()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    const updateManager = getUpdateManager()
    updateManager.installAndRestart()
  })

  // 服务器连接配置操作
  // 需求 8.1: 首次启动配置向导
  ipcMain.handle(IPC_CHANNELS.SERVER_CONFIG_GET, () => {
    const serverConnectionManager = getServerConnectionManager()
    return serverConnectionManager.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_CONFIG_SET, (_event, config: Partial<ServerConnectionConfig>) => {
    const serverConnectionManager = getServerConnectionManager()
    serverConnectionManager.setConfig(config)
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_CONFIG_IS_FIRST_LAUNCH, () => {
    const serverConnectionManager = getServerConnectionManager()
    return serverConnectionManager.isFirstLaunch()
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_CONFIG_COMPLETE_SETUP, () => {
    const serverConnectionManager = getServerConnectionManager()
    serverConnectionManager.completeSetup()
  })

  // 需求 8.2: 服务器 URL 验证和连接测试
  ipcMain.handle(IPC_CHANNELS.SERVER_VALIDATE_URL, (_event, url: string) => {
    const serverConnectionManager = getServerConnectionManager()
    return serverConnectionManager.validateUrl(url)
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_TEST_CONNECTION, async (_event, url: string) => {
    const serverConnectionManager = getServerConnectionManager()
    return await serverConnectionManager.testConnection(url)
  })

  // 需求 8.5, 8.6: 连接模式切换
  ipcMain.handle(IPC_CHANNELS.SERVER_SWITCH_MODE, async (_event, { mode, serverUrl }: { mode: ConnectionMode; serverUrl?: string }) => {
    const serverConnectionManager = getServerConnectionManager()
    return await serverConnectionManager.switchMode(mode, serverUrl)
  })

  // 内置服务器操作
  // 需求 8.3: 在本地端口启动嵌入式 Express 服务器
  ipcMain.handle(IPC_CHANNELS.SERVER_START, async (_event, port?: number) => {
    const embeddedServer = getEmbeddedServer()
    return await embeddedServer.start(port)
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_STOP, async () => {
    const embeddedServer = getEmbeddedServer()
    await embeddedServer.stop()
  })

  ipcMain.handle(IPC_CHANNELS.SERVER_STATUS, () => {
    const embeddedServer = getEmbeddedServer()
    return embeddedServer.getStatus()
  })
}

/**
 * 创建系统托盘
 */
function createTray(): void {
  trayManager.createTray({
    onToggleWindow: () => {
      windowManager.toggleVisibility()
      trayManager.setWindowVisible(windowManager.isVisible())
    },
    onShowWindow: () => {
      windowManager.show()
      trayManager.setWindowVisible(true)
    },
    onHideWindow: () => {
      windowManager.hide()
      trayManager.setWindowVisible(false)
    },
    onNewMemo: () => {
      // 显示窗口并导航到新建备忘录页面
      windowManager.show()
      trayManager.setWindowVisible(true)
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('navigate', '/memo/new')
      }
    },
    onOpenSettings: () => {
      // 显示窗口并导航到设置页面
      windowManager.show()
      trayManager.setWindowVisible(true)
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('navigate', '/settings')
      }
    },
    onQuit: () => {
      windowManager.setQuitting(true)
      shortcutManager.destroy()
      trayManager.destroy()
      app.quit()
    },
  })
}

/**
 * 初始化全局快捷键
 */
function initializeShortcuts(): void {
  shortcutManager.initialize({
    onQuickMemo: () => {
      // 显示窗口并导航到新建备忘录页面
      windowManager.show()
      trayManager.setWindowVisible(true)
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send('navigate', '/memo/new')
      }
    },
    onToggleWindow: () => {
      windowManager.toggleVisibility()
      trayManager.setWindowVisible(windowManager.isVisible())
    },
  })
}

/**
 * 初始化通知管理器
 * 设置通知点击回调，处理通知点击事件
 */
function initializeNotifications(): void {
  const notificationManager = getNotificationManager()
  
  notificationManager.setClickCallback((data) => {
    // 显示窗口
    windowManager.show()
    trayManager.setWindowVisible(true)
    
    const mainWindow = windowManager.getMainWindow()
    if (!mainWindow) return
    
    // 根据通知类型导航到相应页面
    if (data && typeof data === 'object') {
      const notificationData = data as { type?: string; memoId?: string; hasConflicts?: boolean }
      
      if (notificationData.type === 'share' && notificationData.memoId) {
        // 导航到分享的备忘录
        mainWindow.webContents.send('navigate', `/memo/${notificationData.memoId}`)
      } else if (notificationData.type === 'sync') {
        if (notificationData.hasConflicts) {
          // 导航到同步冲突页面
          mainWindow.webContents.send('navigate', '/sync/conflicts')
        } else {
          // 导航到备忘录列表
          mainWindow.webContents.send('navigate', '/memo')
        }
      }
    }
  })
}

/**
 * 初始化自动更新
 * 需求 7.1: 启动时检查更新
 * 需求 7.7: 定时检查更新
 */
function initializeAutoUpdate(): void {
  // 开发模式下不检查更新
  if (isDev) {
    console.log('[Main] Skipping auto-update in development mode')
    return
  }

  const updateManager = getUpdateManager()
  const notificationManager = getNotificationManager()

  // 设置更新回调
  updateManager.setCallbacks({
    onCheckingForUpdate: () => {
      console.log('[Main] Checking for updates...')
    },
    onUpdateAvailable: (info) => {
      console.log(`[Main] New version available: ${info.version}`)
      // 显示系统通知
      notificationManager.show({
        title: '发现新版本',
        body: `CYP-memo ${info.version} 已发布，点击查看详情`,
        data: { type: 'update', version: info.version },
      })
      // 通知渲染进程
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, info)
      }
    },
    onDownloadProgress: (progress) => {
      // 通知渲染进程下载进度
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATE_PROGRESS, progress)
      }
    },
    onUpdateDownloaded: () => {
      console.log('[Main] Update downloaded, ready to install')
      // 显示系统通知
      notificationManager.show({
        title: '更新已就绪',
        body: '新版本已下载完成，重启应用即可安装',
        data: { type: 'update-ready' },
      })
      // 通知渲染进程
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATE_DOWNLOADED)
      }
    },
    onUpdateNotAvailable: () => {
      console.log('[Main] No update available')
    },
    onError: (error) => {
      console.error('[Main] Update error:', error.message)
    },
  })

  // 延迟检查更新（等待应用完全启动）
  setTimeout(() => {
    updateManager.checkForUpdates().catch((error) => {
      console.error('[Main] Failed to check for updates:', error.message)
    })
    
    // 启动定时检查更新（每小时检查一次）
    updateManager.startAutoCheck()
  }, 5000)
}

/**
 * 初始化安全功能
 * 需求 9.3: HTTPS 强制
 * 需求 9.4: 内容安全策略
 */
function initializeSecurity(): void {
  const securityManager = getSecurityManager()
  const serverConnectionManager = getServerConnectionManager()

  // 获取远程服务器 URL（如果配置了）
  const config = serverConnectionManager.getConfig()
  const remoteServerUrl = config.connectionMode === 'remote' ? config.serverUrl : undefined

  // 强制 HTTPS（需求 9.3）
  securityManager.enforceHttps()

  // 配置内容安全策略（需求 9.4）
  securityManager.configureCSP({
    isDev,
    remoteServerUrl,
  })

  console.log('[Main] Security features initialized')
}

/**
 * 应用初始化
 */
async function initialize(): Promise<void> {
  // 单实例锁定
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return
  }

  // 处理第二个实例启动
  app.on('second-instance', () => {
    const mainWindow = windowManager.getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })


  // 等待应用就绪
  await app.whenReady()

  // 初始化安全功能（需求 9.3, 9.4）
  // 必须在创建窗口之前初始化，以确保所有请求都受到保护
  initializeSecurity()

  // 设置 IPC 处理器
  setupIPCHandlers()

  // 创建主窗口
  const preloadPath = path.join(__dirname, '../preload/index.js')
  const mainWindow = windowManager.createMainWindow(preloadPath, isDev, VITE_DEV_SERVER_URL)

  // 创建中文菜单
  menuManager.setMainWindow(mainWindow)
  menuManager.createMenu()

  // 创建系统托盘
  createTray()

  // 初始化全局快捷键
  initializeShortcuts()

  // 初始化通知管理器点击回调
  initializeNotifications()

  // 初始化自动更新（需求 7.1）
  initializeAutoUpdate()

  // macOS: 点击 dock 图标时显示窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow(preloadPath, isDev, VITE_DEV_SERVER_URL)
    } else {
      windowManager.show()
    }
  })

  // 应用退出前保存状态
  app.on('before-quit', () => {
    windowManager.setQuitting(true)
    shortcutManager.destroy()
    trayManager.destroy()
  })
}

// 所有窗口关闭时的处理
app.on('window-all-closed', () => {
  // 在非 macOS 平台上，关闭所有窗口时退出应用
  // 但由于我们实现了最小化到托盘，这里不需要退出
  if (process.platform !== 'darwin') {
    // 不退出，保持托盘运行
    // app.quit()
  }
})

// 启动应用
initialize().catch(console.error)
