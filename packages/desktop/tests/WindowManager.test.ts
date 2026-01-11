/**
 * WindowManager 单元测试
 * Unit tests for the WindowManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { WindowState } from '../src/shared/types'

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

describe('WindowManager', () => {
  let WindowManager: typeof import('../src/main/WindowManager').WindowManager

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module cache to get fresh instance
    vi.resetModules()
    const module = await import('../src/main/WindowManager')
    WindowManager = module.WindowManager
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default window state', () => {
      const manager = new WindowManager()
      const state = manager.getWindowState()
      
      expect(state.width).toBe(1200)
      expect(state.height).toBe(800)
      expect(state.isMaximized).toBe(false)
    })
  })

  describe('saveWindowState', () => {
    it('should save window state to file', () => {
      const manager = new WindowManager()
      const state: WindowState = {
        x: 100,
        y: 200,
        width: 1000,
        height: 700,
        isMaximized: false,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)

      manager.saveWindowState(state)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('window-state.json'),
        JSON.stringify(state, null, 2),
        'utf-8'
      )
    })

    it('should create directory if it does not exist', () => {
      const manager = new WindowManager()
      const state: WindowState = {
        x: 100,
        y: 200,
        width: 1000,
        height: 700,
        isMaximized: false,
      }

      vi.mocked(fs.existsSync).mockReturnValue(false)

      manager.saveWindowState(state)

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      )
    })
  })


  describe('restoreWindowState', () => {
    it('should restore window state from file', () => {
      const manager = new WindowManager()
      const savedState: WindowState = {
        x: 150,
        y: 250,
        width: 1100,
        height: 750,
        isMaximized: true,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState))

      const state = manager.restoreWindowState()

      expect(state).toEqual(savedState)
    })

    it('should return null if file does not exist', () => {
      const manager = new WindowManager()

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const state = manager.restoreWindowState()

      expect(state).toBeNull()
    })

    it('should return null for invalid JSON', () => {
      const manager = new WindowManager()

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      const state = manager.restoreWindowState()

      expect(state).toBeNull()
    })

    it('should return null for invalid window state', () => {
      const manager = new WindowManager()
      const invalidState = {
        x: 100,
        y: 200,
        width: 500, // Below minimum
        height: 400, // Below minimum
        isMaximized: false,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidState))

      const state = manager.restoreWindowState()

      expect(state).toBeNull()
    })
  })

  describe('isPositionOnScreen', () => {
    it('should return true for position within screen bounds', () => {
      const manager = new WindowManager()
      
      // Position within the mocked display (0,0 to 1920,1080)
      expect(manager.isPositionOnScreen(100, 100)).toBe(true)
      expect(manager.isPositionOnScreen(0, 0)).toBe(true)
      expect(manager.isPositionOnScreen(1000, 500)).toBe(true)
    })

    it('should return false for position outside all screens', () => {
      const manager = new WindowManager()
      
      // Position far outside the mocked display
      expect(manager.isPositionOnScreen(-500, -500)).toBe(false)
      expect(manager.isPositionOnScreen(5000, 5000)).toBe(false)
    })

    it('should allow slight negative offset (within tolerance)', () => {
      const manager = new WindowManager()
      
      // Position slightly outside but within tolerance (-100)
      expect(manager.isPositionOnScreen(-50, -50)).toBe(true)
    })
  })

  describe('visibility methods', () => {
    it('should track visibility state', () => {
      const manager = new WindowManager()
      
      // Before creating window, should return false
      expect(manager.isVisible()).toBe(false)
    })

    it('should have toggleVisibility method', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.toggleVisibility()).not.toThrow()
    })

    it('should have show method', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.show()).not.toThrow()
    })

    it('should have hide method', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.hide()).not.toThrow()
    })

    it('should have close method that hides to tray', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.close()).not.toThrow()
    })

    it('should have minimize method', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.minimize()).not.toThrow()
    })

    it('should have maximize method', () => {
      const manager = new WindowManager()
      
      // Should not throw when no window exists
      expect(() => manager.maximize()).not.toThrow()
    })
  })

  describe('setQuitting', () => {
    it('should set quitting flag', () => {
      const manager = new WindowManager()
      
      // Should not throw
      expect(() => manager.setQuitting(true)).not.toThrow()
      expect(() => manager.setQuitting(false)).not.toThrow()
    })
  })

  describe('getMainWindow', () => {
    it('should return null before window is created', () => {
      const manager = new WindowManager()
      
      expect(manager.getMainWindow()).toBeNull()
    })
  })
})
