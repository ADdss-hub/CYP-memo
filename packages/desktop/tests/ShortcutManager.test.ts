/**
 * ShortcutManager 单元测试
 * Unit tests for the ShortcutManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShortcutManager } from '../src/main/ShortcutManager'
import fs from 'fs'

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

describe('ShortcutManager', () => {
  let shortcutManager: ShortcutManager

  beforeEach(() => {
    vi.clearAllMocks()
    shortcutManager = new ShortcutManager()
  })

  afterEach(() => {
    shortcutManager.destroy()
  })

  describe('validateAccelerator', () => {
    it('should validate correct shortcut formats', () => {
      expect(shortcutManager.validateAccelerator('CommandOrControl+Shift+M')).toBe(true)
      expect(shortcutManager.validateAccelerator('Ctrl+Alt+N')).toBe(true)
      expect(shortcutManager.validateAccelerator('Alt+F4')).toBe(true)
      expect(shortcutManager.validateAccelerator('Shift+Space')).toBe(true)
      expect(shortcutManager.validateAccelerator('CmdOrCtrl+Shift+A')).toBe(true)
    })

    it('should reject invalid shortcut formats', () => {
      expect(shortcutManager.validateAccelerator('')).toBe(false)
      expect(shortcutManager.validateAccelerator('M')).toBe(false) // No modifier
      expect(shortcutManager.validateAccelerator('InvalidMod+M')).toBe(false)
      expect(shortcutManager.validateAccelerator('Ctrl+')).toBe(false)
      expect(shortcutManager.validateAccelerator('Ctrl+InvalidKey')).toBe(false)
    })

    it('should handle null and undefined', () => {
      expect(shortcutManager.validateAccelerator(null as unknown as string)).toBe(false)
      expect(shortcutManager.validateAccelerator(undefined as unknown as string)).toBe(false)
    })

    it('should validate function keys', () => {
      expect(shortcutManager.validateAccelerator('Ctrl+F1')).toBe(true)
      expect(shortcutManager.validateAccelerator('Alt+F12')).toBe(true)
      expect(shortcutManager.validateAccelerator('Shift+F24')).toBe(true)
    })

    it('should validate special keys', () => {
      expect(shortcutManager.validateAccelerator('Ctrl+Tab')).toBe(true)
      expect(shortcutManager.validateAccelerator('Alt+Enter')).toBe(true)
      expect(shortcutManager.validateAccelerator('Shift+Escape')).toBe(true)
      expect(shortcutManager.validateAccelerator('Ctrl+Delete')).toBe(true)
    })
  })

  describe('getConfig', () => {
    it('should return default config initially', () => {
      const config = shortcutManager.getConfig()
      expect(config.quickMemo).toBe('CommandOrControl+Shift+M')
      expect(config.toggleWindow).toBe('CommandOrControl+Shift+N')
    })

    it('should return a copy of config', () => {
      const config1 = shortcutManager.getConfig()
      const config2 = shortcutManager.getConfig()
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('register', () => {
    it('should register valid shortcuts', () => {
      const callback = vi.fn()
      const result = shortcutManager.register('Ctrl+Shift+T', callback)
      expect(result).toBe(true)
    })

    it('should reject invalid shortcuts', () => {
      const callback = vi.fn()
      const result = shortcutManager.register('InvalidShortcut', callback)
      expect(result).toBe(false)
    })
  })

  describe('unregister', () => {
    it('should unregister shortcuts without error', () => {
      const callback = vi.fn()
      shortcutManager.register('Ctrl+Shift+T', callback)
      expect(() => shortcutManager.unregister('Ctrl+Shift+T')).not.toThrow()
    })
  })

  describe('unregisterAll', () => {
    it('should unregister all shortcuts without error', () => {
      const callback = vi.fn()
      shortcutManager.register('Ctrl+Shift+T', callback)
      shortcutManager.register('Ctrl+Shift+U', callback)
      expect(() => shortcutManager.unregisterAll()).not.toThrow()
    })
  })

  describe('updateConfig', () => {
    it('should update quickMemo shortcut', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      const result = shortcutManager.updateConfig({
        quickMemo: 'Ctrl+Shift+Q',
      })

      expect(result).toBe(true)
      expect(shortcutManager.getConfig().quickMemo).toBe('Ctrl+Shift+Q')
    })

    it('should update toggleWindow shortcut', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      const result = shortcutManager.updateConfig({
        toggleWindow: 'Ctrl+Shift+W',
      })

      expect(result).toBe(true)
      expect(shortcutManager.getConfig().toggleWindow).toBe('Ctrl+Shift+W')
    })

    it('should reject invalid shortcut updates', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      const result = shortcutManager.updateConfig({
        quickMemo: 'InvalidShortcut',
      })

      expect(result).toBe(false)
      // Config should remain unchanged
      expect(shortcutManager.getConfig().quickMemo).toBe('CommandOrControl+Shift+M')
    })
  })

  describe('initialize', () => {
    it('should initialize with callbacks', () => {
      const onQuickMemo = vi.fn()
      const onToggleWindow = vi.fn()

      expect(() =>
        shortcutManager.initialize({
          onQuickMemo,
          onToggleWindow,
        })
      ).not.toThrow()
    })

    it('should initialize without callbacks', () => {
      expect(() => shortcutManager.initialize()).not.toThrow()
    })
  })

  describe('resetToDefault', () => {
    it('should reset config to default values', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      // Change config
      shortcutManager.updateConfig({
        quickMemo: 'Ctrl+Shift+Q',
        toggleWindow: 'Ctrl+Shift+W',
      })

      // Reset
      shortcutManager.resetToDefault()

      const config = shortcutManager.getConfig()
      expect(config.quickMemo).toBe('CommandOrControl+Shift+M')
      expect(config.toggleWindow).toBe('CommandOrControl+Shift+N')
    })
  })

  describe('destroy', () => {
    it('should clean up without error', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      expect(() => shortcutManager.destroy()).not.toThrow()
    })
  })

  describe('saveConfig', () => {
    it('should save config to file', () => {
      const config = {
        quickMemo: 'Ctrl+Shift+Q',
        toggleWindow: 'Ctrl+Shift+W',
      }

      shortcutManager.saveConfig(config)

      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should create directory if not exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      shortcutManager.saveConfig({
        quickMemo: 'Ctrl+Shift+Q',
        toggleWindow: 'Ctrl+Shift+W',
      })

      expect(fs.mkdirSync).toHaveBeenCalled()
    })
  })

  describe('loadConfig', () => {
    it('should return null when config file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const config = shortcutManager.loadConfig()

      expect(config).toBeNull()
    })

    it('should load valid config from file', () => {
      const savedConfig = {
        quickMemo: 'Ctrl+Shift+Q',
        toggleWindow: 'Ctrl+Shift+W',
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedConfig))

      const config = shortcutManager.loadConfig()

      expect(config).toEqual(savedConfig)
    })

    it('should return null for invalid config data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        quickMemo: 'InvalidShortcut',
        toggleWindow: 'Ctrl+Shift+W',
      }))

      const config = shortcutManager.loadConfig()

      expect(config).toBeNull()
    })

    it('should return null for malformed JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json')

      const config = shortcutManager.loadConfig()

      expect(config).toBeNull()
    })
  })

  describe('persistence integration', () => {
    it('should persist config changes through updateConfig', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      shortcutManager.updateConfig({
        quickMemo: 'Ctrl+Shift+Q',
      })

      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should persist config on resetToDefault', () => {
      shortcutManager.initialize({
        onQuickMemo: vi.fn(),
        onToggleWindow: vi.fn(),
      })

      shortcutManager.resetToDefault()

      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })
})
