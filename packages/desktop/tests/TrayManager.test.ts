/**
 * TrayManager 单元测试
 * Unit tests for the TrayManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Electron modules - all mock functions must be defined inside the factory
vi.mock('electron', () => {
  const mockSetToolTip = vi.fn()
  const mockSetContextMenu = vi.fn()
  const mockSetImage = vi.fn()
  const mockDisplayBalloon = vi.fn()
  const mockDestroy = vi.fn()
  const mockOn = vi.fn()
  const mockBuildFromTemplate = vi.fn().mockReturnValue({})

  return {
    Tray: vi.fn().mockImplementation(() => ({
      setToolTip: mockSetToolTip,
      setContextMenu: mockSetContextMenu,
      setImage: mockSetImage,
      displayBalloon: mockDisplayBalloon,
      destroy: mockDestroy,
      on: mockOn,
    })),
    Menu: {
      buildFromTemplate: mockBuildFromTemplate,
    },
    nativeImage: {
      createFromPath: vi.fn().mockReturnValue({
        isEmpty: vi.fn().mockReturnValue(false),
        setTemplateImage: vi.fn(),
      }),
      createEmpty: vi.fn().mockReturnValue({
        resize: vi.fn().mockReturnValue({}),
      }),
    },
    app: {
      getPath: vi.fn().mockReturnValue('/mock/path'),
    },
  }
})

// Import after mocking
import { TrayManager, TrayMenuItem, TrayManagerCallbacks } from '../src/main/TrayManager'
import { Tray, Menu } from 'electron'

describe('TrayManager', () => {
  let trayManager: TrayManager

  beforeEach(() => {
    trayManager = new TrayManager()
    vi.clearAllMocks()
  })

  afterEach(() => {
    trayManager.destroy()
  })

  describe('createTray', () => {
    it('should create a tray instance', () => {
      const tray = trayManager.createTray()
      expect(tray).toBeDefined()
      expect(trayManager.getTray()).toBe(tray)
    })

    it('should accept callbacks', () => {
      const callbacks: TrayManagerCallbacks = {
        onShowWindow: vi.fn(),
        onHideWindow: vi.fn(),
        onToggleWindow: vi.fn(),
        onNewMemo: vi.fn(),
        onOpenSettings: vi.fn(),
        onQuit: vi.fn(),
      }

      const tray = trayManager.createTray(callbacks)
      expect(tray).toBeDefined()
    })

    it('should call Tray constructor', () => {
      trayManager.createTray()
      expect(Tray).toHaveBeenCalled()
    })
  })

  describe('setToolTip', () => {
    it('should not throw when tray exists', () => {
      trayManager.createTray()
      expect(() => trayManager.setToolTip('New Tooltip')).not.toThrow()
    })

    it('should not throw when tray does not exist', () => {
      expect(() => trayManager.setToolTip('Test')).not.toThrow()
    })
  })

  describe('setWindowVisible', () => {
    it('should not throw when updating visibility', () => {
      trayManager.createTray()
      expect(() => trayManager.setWindowVisible(false)).not.toThrow()
      expect(() => trayManager.setWindowVisible(true)).not.toThrow()
    })
  })

  describe('setMenu', () => {
    it('should set custom menu items', () => {
      trayManager.createTray()
      
      const customItems: TrayMenuItem[] = [
        { label: 'Custom Item 1', click: vi.fn() },
        { type: 'separator', label: '' },
        { label: 'Custom Item 2', click: vi.fn() },
      ]

      expect(() => trayManager.setMenu(customItems)).not.toThrow()
      expect(Menu.buildFromTemplate).toHaveBeenCalled()
    })

    it('should handle nested submenus', () => {
      trayManager.createTray()

      const itemsWithSubmenu: TrayMenuItem[] = [
        {
          label: 'Parent',
          type: 'submenu',
          submenu: [
            { label: 'Child 1', click: vi.fn() },
            { label: 'Child 2', click: vi.fn() },
          ],
        },
      ]

      expect(() => trayManager.setMenu(itemsWithSubmenu)).not.toThrow()
    })

    it('should not throw when tray does not exist', () => {
      expect(() => trayManager.setMenu([{ label: 'Test' }])).not.toThrow()
    })
  })

  describe('showBalloon', () => {
    it('should not throw when showing balloon', () => {
      trayManager.createTray()
      expect(() => trayManager.showBalloon('Title', 'Content')).not.toThrow()
    })

    it('should not throw when tray does not exist', () => {
      expect(() => trayManager.showBalloon('Title', 'Content')).not.toThrow()
    })
  })

  describe('destroy', () => {
    it('should set tray to null after destroy', () => {
      trayManager.createTray()
      trayManager.destroy()
      expect(trayManager.getTray()).toBeNull()
    })

    it('should not throw when tray does not exist', () => {
      expect(() => trayManager.destroy()).not.toThrow()
    })
  })

  describe('getTray', () => {
    it('should return null before creation', () => {
      expect(trayManager.getTray()).toBeNull()
    })

    it('should return tray instance after creation', () => {
      const tray = trayManager.createTray()
      expect(trayManager.getTray()).toBe(tray)
    })
  })

  describe('setIcon', () => {
    it('should not throw when setting icon', () => {
      trayManager.createTray()
      expect(() => trayManager.setIcon('/path/to/icon.png')).not.toThrow()
    })

    it('should not throw when tray does not exist', () => {
      expect(() => trayManager.setIcon('/path/to/icon.png')).not.toThrow()
    })
  })
})
