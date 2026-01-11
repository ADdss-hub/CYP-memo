/**
 * PlatformManager 单元测试
 * Unit tests for PlatformManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PlatformManager, Platform, PlatformFeatures, TaskbarProgress } from '../src/main/PlatformManager'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
    dock: {
      setBadge: vi.fn(),
      bounce: vi.fn(() => 1),
      cancelBounce: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    },
    setBadgeCount: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}))

describe('PlatformManager', () => {
  let platformManager: PlatformManager
  let mockWindow: {
    setProgressBar: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    platformManager = new PlatformManager()
    mockWindow = {
      setProgressBar: vi.fn(),
    }
  })

  afterEach(() => {
    platformManager.destroy()
    vi.clearAllMocks()
  })

  describe('Platform Detection', () => {
    it('should return the current platform', () => {
      const platform = platformManager.getPlatform()
      expect(['win32', 'darwin', 'linux']).toContain(platform)
    })

    it('should correctly identify Windows', () => {
      const isWin = platformManager.isWindows()
      expect(typeof isWin).toBe('boolean')
      if (process.platform === 'win32') {
        expect(isWin).toBe(true)
      }
    })

    it('should correctly identify macOS', () => {
      const isMac = platformManager.isMacOS()
      expect(typeof isMac).toBe('boolean')
      if (process.platform === 'darwin') {
        expect(isMac).toBe(true)
      }
    })

    it('should correctly identify Linux', () => {
      const isLinux = platformManager.isLinux()
      expect(typeof isLinux).toBe('boolean')
      if (process.platform === 'linux') {
        expect(isLinux).toBe(true)
      }
    })
  })

  describe('Platform Features', () => {
    it('should return platform features object', () => {
      const features = platformManager.getFeatures()
      
      expect(features).toHaveProperty('supportsTaskbarProgress')
      expect(features).toHaveProperty('supportsDockBadge')
      expect(features).toHaveProperty('supportsDesktopIntegration')
      expect(features).toHaveProperty('supportsNativeNotifications')
      
      expect(typeof features.supportsTaskbarProgress).toBe('boolean')
      expect(typeof features.supportsDockBadge).toBe('boolean')
      expect(typeof features.supportsDesktopIntegration).toBe('boolean')
      expect(typeof features.supportsNativeNotifications).toBe('boolean')
    })

    it('should indicate native notifications are supported on all platforms', () => {
      const features = platformManager.getFeatures()
      expect(features.supportsNativeNotifications).toBe(true)
    })
  })

  describe('Window Management', () => {
    it('should set and clear main window reference', () => {
      platformManager.setMainWindow(mockWindow as any)
      // No direct way to verify, but should not throw
      platformManager.setMainWindow(null)
    })
  })

  describe('Taskbar Progress (Windows)', () => {
    beforeEach(() => {
      platformManager.setMainWindow(mockWindow as any)
    })

    it('should return false when no window is set', () => {
      platformManager.setMainWindow(null)
      const result = platformManager.setTaskbarProgress({ mode: 'normal', value: 0.5 })
      
      // Will return false if not on Windows or no window
      if (!platformManager.isWindows()) {
        expect(result).toBe(false)
      }
    })

    it('should clear taskbar progress', () => {
      const result = platformManager.clearTaskbarProgress()
      
      if (platformManager.isWindows()) {
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1)
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('Cross-platform Progress', () => {
    beforeEach(() => {
      platformManager.setMainWindow(mockWindow as any)
    })

    it('should set progress value', () => {
      const result = platformManager.setProgress(0.5)
      
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.5)
      expect(result).toBe(true)
    })

    it('should clamp progress value between 0 and 1', () => {
      platformManager.setProgress(1.5)
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(1)

      platformManager.setProgress(-0.5)
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0)
    })

    it('should clear progress', () => {
      const result = platformManager.clearProgress()
      
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1)
      expect(result).toBe(true)
    })

    it('should return false when no window is set', () => {
      platformManager.setMainWindow(null)
      
      expect(platformManager.setProgress(0.5)).toBe(false)
      expect(platformManager.clearProgress()).toBe(false)
    })
  })

  describe('Badge Count (Cross-platform)', () => {
    it('should set badge count', () => {
      const result = platformManager.setBadgeCount(5)
      // Result depends on platform
      expect(typeof result).toBe('boolean')
    })

    it('should clear badge count', () => {
      const result = platformManager.clearBadgeCount()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('Path Helpers', () => {
    it('should return user data path', () => {
      const path = platformManager.getUserDataPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })

    it('should return app data path', () => {
      const path = platformManager.getAppDataPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })

    it('should return documents path', () => {
      const path = platformManager.getDocumentsPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })

    it('should return temp path', () => {
      const path = platformManager.getTempPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })

    it('should return logs path', () => {
      const path = platformManager.getLogsPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup on destroy', () => {
      platformManager.setMainWindow(mockWindow as any)
      platformManager.destroy()
      
      // After destroy, operations should fail gracefully
      expect(platformManager.setProgress(0.5)).toBe(false)
    })
  })
})
