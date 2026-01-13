/**
 * 菜单管理器
 * 创建中文应用菜单
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { Menu, app, shell, BrowserWindow, dialog } from 'electron'

// 开发模式标志 - 使用 app.isPackaged 判断是否为打包后的应用
// 打包后的应用 app.isPackaged 为 true，此时不是开发模式
const isDev = !app.isPackaged

export class MenuManager {
  private mainWindow: BrowserWindow | null = null

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * 创建应用菜单
   */
  createMenu(): void {
    const isMac = process.platform === 'darwin'

    const template: Electron.MenuItemConstructorOptions[] = [
      // macOS 应用菜单
      ...(isMac ? [{
        label: app.name,
        submenu: [
          { label: '关于 CYP-memo', role: 'about' as const },
          { type: 'separator' as const },
          { label: '偏好设置...', accelerator: 'Cmd+,', click: () => this.navigateTo('/settings') },
          { type: 'separator' as const },
          { label: '服务', role: 'services' as const },
          { type: 'separator' as const },
          { label: '隐藏 CYP-memo', role: 'hide' as const },
          { label: '隐藏其他', role: 'hideOthers' as const },
          { label: '显示全部', role: 'unhide' as const },
          { type: 'separator' as const },
          { label: '退出 CYP-memo', role: 'quit' as const }
        ]
      }] : []),

      // 文件菜单
      {
        label: '文件',
        submenu: [
          { label: '新建备忘录', accelerator: 'CmdOrCtrl+N', click: () => this.navigateTo('/memo/new') },
          { type: 'separator' },
          { label: '导入数据...', click: () => this.navigateTo('/data?action=import') },
          { label: '导出数据...', click: () => this.navigateTo('/data?action=export') },
          { type: 'separator' },
          ...(isMac ? [] : [
            { label: '设置', accelerator: 'Ctrl+,', click: () => this.navigateTo('/settings') },
            { type: 'separator' as const },
            { label: '退出', role: 'quit' as const }
          ])
        ]
      },

      // 编辑菜单
      {
        label: '编辑',
        submenu: [
          { label: '撤销', role: 'undo' },
          { label: '重做', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', role: 'cut' },
          { label: '复制', role: 'copy' },
          { label: '粘贴', role: 'paste' },
          ...(isMac ? [
            { label: '粘贴并匹配样式', role: 'pasteAndMatchStyle' as const },
            { label: '删除', role: 'delete' as const },
            { label: '全选', role: 'selectAll' as const }
          ] : [
            { label: '删除', role: 'delete' as const },
            { type: 'separator' as const },
            { label: '全选', role: 'selectAll' as const }
          ])
        ]
      },

      // 视图菜单
      {
        label: '视图',
        submenu: [
          { label: '重新加载', role: 'reload' },
          { label: '强制重新加载', role: 'forceReload' },
          // 开发者工具仅在开发模式下显示
          ...(isDev ? [{ label: '开发者工具', role: 'toggleDevTools' as const }] : []),
          { type: 'separator' as const },
          { label: '实际大小', role: 'resetZoom' },
          { label: '放大', role: 'zoomIn' },
          { label: '缩小', role: 'zoomOut' },
          { type: 'separator' as const },
          { label: '全屏', role: 'togglefullscreen' }
        ]
      },

      // 窗口菜单
      {
        label: '窗口',
        submenu: [
          { label: '最小化', role: 'minimize' },
          { label: '缩放', role: 'zoom' },
          ...(isMac ? [
            { type: 'separator' as const },
            { label: '前置全部窗口', role: 'front' as const }
          ] : [
            { label: '关闭', role: 'close' as const }
          ])
        ]
      },

      // 帮助菜单
      {
        label: '帮助',
        submenu: [
          { 
            label: '使用帮助', 
            click: async () => {
              await shell.openExternal('https://github.com/ADdss-hub/CYP-memo#readme')
            }
          },
          { 
            label: '报告问题', 
            click: async () => {
              await shell.openExternal('https://github.com/ADdss-hub/CYP-memo/issues')
            }
          },
          { type: 'separator' },
          { 
            label: '关于 CYP-memo', 
            click: () => this.showAbout()
          }
        ]
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  }

  /**
   * 导航到指定路径
   */
  private navigateTo(path: string): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('navigate', path)
    }
  }

  /**
   * 显示关于对话框
   */
  private showAbout(): void {
    dialog.showMessageBox({
      type: 'info',
      title: '关于 CYP-memo',
      message: 'CYP-memo',
      detail: `版本: ${app.getVersion()}\n\n容器备忘录系统 - 桌面客户端\n\n作者: CYP\n邮箱: nasDSSCYP@outlook.com`,
      buttons: ['确定']
    })
  }
}

// 导出单例
export const menuManager = new MenuManager()
