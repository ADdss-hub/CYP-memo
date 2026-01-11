/**
 * 测试环境设置
 * Test environment setup
 */

import { vi } from 'vitest'

// Mock Electron modules for testing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'CYP-memo'),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    focus: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 })),
    webContents: {
      openDevTools: vi.fn(),
      send: vi.fn(),
    },
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
  },
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      workAreaSize: { width: 1920, height: 1080 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: vi.fn(() => [
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
}))
