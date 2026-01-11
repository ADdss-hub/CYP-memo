/**
 * NotificationManager 单元测试
 * Unit tests for the NotificationManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Electron modules
vi.mock('electron', () => {
  const mockShow = vi.fn()
  const mockOn = vi.fn()
  
  return {
    Notification: Object.assign(
      vi.fn().mockImplementation(() => ({
        show: mockShow,
        on: mockOn,
      })),
      {
        isSupported: vi.fn().mockReturnValue(true),
      }
    ),
    nativeImage: {
      createFromPath: vi.fn().mockReturnValue({
        isEmpty: vi.fn().mockReturnValue(false),
      }),
    },
    app: {
      getPath: vi.fn().mockReturnValue('/mock/path'),
    },
  }
})

// Mock fs module with default export
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as object
  return {
    ...actual,
    default: {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

// Import after mocking
import { NotificationManager, resetNotificationManager } from '../src/main/NotificationManager'
import { Notification } from 'electron'
import type { NotificationOptions, NotificationPreferences } from '../src/shared/types'

describe('NotificationManager', () => {
  let notificationManager: NotificationManager

  beforeEach(() => {
    vi.clearAllMocks()
    resetNotificationManager()
    notificationManager = new NotificationManager()
  })

  afterEach(() => {
    resetNotificationManager()
  })

  describe('isSupported', () => {
    it('should return true when notifications are supported', () => {
      expect(notificationManager.isSupported()).toBe(true)
    })
  })

  describe('show', () => {
    it('should create and show a notification', () => {
      const options: NotificationOptions = {
        title: 'Test Title',
        body: 'Test Body',
      }

      notificationManager.show(options)

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Title',
          body: 'Test Body',
        })
      )
    })

    it('should not show notification when disabled', () => {
      notificationManager.setPreferences({ enabled: false, showOnShare: true, showOnSync: true, sound: true })
      vi.clearAllMocks()
      
      const options: NotificationOptions = {
        title: 'Test Title',
        body: 'Test Body',
      }

      notificationManager.show(options)

      expect(Notification).not.toHaveBeenCalled()
    })

    it('should respect silent option', () => {
      const options: NotificationOptions = {
        title: 'Test Title',
        body: 'Test Body',
        silent: true,
      }

      notificationManager.show(options)

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true,
        })
      )
    })
  })

  describe('showShareNotification', () => {
    it('should show share notification when enabled', () => {
      notificationManager.showShareNotification('Test Memo', 'John', 'memo-123')

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '收到新的分享',
          body: 'John 分享了备忘录: Test Memo',
        })
      )
    })

    it('should not show share notification when showOnShare is disabled', () => {
      notificationManager.setPreferences({ enabled: true, showOnShare: false, showOnSync: true, sound: true })
      vi.clearAllMocks()
      
      notificationManager.showShareNotification('Test Memo', 'John', 'memo-123')

      expect(Notification).not.toHaveBeenCalled()
    })
  })

  describe('showSyncNotification', () => {
    it('should show sync notification when there are changes', () => {
      notificationManager.showSyncNotification(5, false)

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '同步完成',
          body: '同步完成，共 5 项更新',
        })
      )
    })

    it('should show sync notification with conflicts', () => {
      notificationManager.showSyncNotification(3, true)

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '同步完成',
          body: '同步完成，有 3 项更新，存在冲突需要处理',
        })
      )
    })

    it('should not show sync notification when no changes and no conflicts', () => {
      notificationManager.showSyncNotification(0, false)

      expect(Notification).not.toHaveBeenCalled()
    })

    it('should not show sync notification when showOnSync is disabled', () => {
      notificationManager.setPreferences({ enabled: true, showOnShare: true, showOnSync: false, sound: true })
      vi.clearAllMocks()
      
      notificationManager.showSyncNotification(5, false)

      expect(Notification).not.toHaveBeenCalled()
    })
  })

  describe('setPreferences', () => {
    it('should update preferences', () => {
      const newPrefs: NotificationPreferences = {
        enabled: false,
        showOnShare: false,
        showOnSync: false,
        sound: false,
      }

      notificationManager.setPreferences(newPrefs)

      expect(notificationManager.getPreferences()).toEqual(newPrefs)
    })

    it('should merge partial preferences', () => {
      notificationManager.setPreferences({ enabled: false } as NotificationPreferences)

      const prefs = notificationManager.getPreferences()
      expect(prefs.enabled).toBe(false)
      expect(prefs.showOnShare).toBe(true) // Default value
    })
  })

  describe('getPreferences', () => {
    it('should return default preferences', () => {
      const prefs = notificationManager.getPreferences()

      expect(prefs).toEqual({
        enabled: true,
        showOnShare: true,
        showOnSync: true,
        sound: true,
      })
    })

    it('should return a copy of preferences', () => {
      const prefs1 = notificationManager.getPreferences()
      const prefs2 = notificationManager.getPreferences()

      expect(prefs1).not.toBe(prefs2)
      expect(prefs1).toEqual(prefs2)
    })
  })

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(notificationManager.isEnabled()).toBe(true)
    })

    it('should return false when disabled', () => {
      notificationManager.setPreferences({ enabled: false, showOnShare: true, showOnSync: true, sound: true })
      expect(notificationManager.isEnabled()).toBe(false)
    })
  })

  describe('setClickCallback', () => {
    it('should set click callback', () => {
      const callback = vi.fn()
      notificationManager.setClickCallback(callback)

      // The callback is stored internally, we can verify it was set
      // by checking that no error is thrown
      expect(() => notificationManager.setClickCallback(callback)).not.toThrow()
    })
  })

  describe('resetToDefault', () => {
    it('should reset preferences to default values', () => {
      notificationManager.setPreferences({
        enabled: false,
        showOnShare: false,
        showOnSync: false,
        sound: false,
      })
      
      notificationManager.resetToDefault()
      
      expect(notificationManager.getPreferences()).toEqual({
        enabled: true,
        showOnShare: true,
        showOnSync: true,
        sound: true,
      })
    })
  })
})
