/**
 * ServerConnectionManager 单元测试
 * Tests for server connection configuration and management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ServerConnectionManager, resetServerConnectionManager } from '../src/main/ServerConnectionManager'
import { getEmbeddedServer } from '../src/main/EmbeddedServer'
import fs from 'fs'
import path from 'path'

// Mock EmbeddedServer
vi.mock('../src/main/EmbeddedServer', () => ({
  getEmbeddedServer: vi.fn().mockReturnValue({
    isServerRunning: vi.fn().mockReturnValue(false),
    start: vi.fn().mockResolvedValue(5170),
    stop: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockReturnValue('http://localhost:5170'),
  }),
}))

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-user-data'),
  },
}))

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

describe('ServerConnectionManager', () => {
  let manager: ServerConnectionManager

  beforeEach(() => {
    vi.clearAllMocks()
    resetServerConnectionManager()
    
    // Default mock: no existing config file
    vi.mocked(fs.existsSync).mockReturnValue(false)
    
    manager = new ServerConnectionManager()
  })

  afterEach(() => {
    resetServerConnectionManager()
  })

  describe('initialization', () => {
    it('should initialize with default config when no saved config exists', () => {
      manager.initialize()
      
      const config = manager.getConfig()
      expect(config.connectionMode).toBe('remote')
      expect(config.isFirstLaunch).toBe(true)
      expect(config.embeddedPort).toBe(5170)
    })

    it('should load saved config if exists', () => {
      const savedConfig = {
        connectionMode: 'embedded',
        serverUrl: undefined,
        embeddedPort: 5180,
        isFirstLaunch: false,
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedConfig))
      
      manager.initialize()
      
      const config = manager.getConfig()
      expect(config.connectionMode).toBe('embedded')
      expect(config.isFirstLaunch).toBe(false)
      expect(config.embeddedPort).toBe(5180)
    })
  })

  describe('isFirstLaunch', () => {
    it('should return true for new installation', () => {
      manager.initialize()
      expect(manager.isFirstLaunch()).toBe(true)
    })

    it('should return false after setup is completed', () => {
      manager.initialize()
      manager.completeSetup()
      expect(manager.isFirstLaunch()).toBe(false)
    })
  })

  describe('completeSetup', () => {
    it('should mark first launch as complete and save config', () => {
      manager.initialize()
      manager.completeSetup()
      
      expect(manager.isFirstLaunch()).toBe(false)
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('validateUrl', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should reject empty URL', () => {
      const result = manager.validateUrl('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('不能为空')
    })

    it('should reject invalid URL format', () => {
      const result = manager.validateUrl('not-a-url')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('格式无效')
    })

    it('should accept valid HTTP URL for localhost', () => {
      const result = manager.validateUrl('http://localhost:5170')
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe('http://localhost:5170')
    })

    it('should accept valid HTTP URL for 127.0.0.1', () => {
      const result = manager.validateUrl('http://127.0.0.1:5170')
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe('http://127.0.0.1:5170')
    })

    it('should reject HTTP for remote servers (non-localhost)', () => {
      const result = manager.validateUrl('http://example.com')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('HTTPS')
    })

    it('should accept HTTPS for remote servers', () => {
      const result = manager.validateUrl('https://example.com')
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe('https://example.com')
    })

    it('should normalize URL by removing trailing slash', () => {
      const result = manager.validateUrl('https://example.com/')
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe('https://example.com')
    })

    it('should accept URL with path', () => {
      const result = manager.validateUrl('https://example.com/api')
      expect(result.valid).toBe(true)
      expect(result.normalizedUrl).toBe('https://example.com/api')
    })
  })

  describe('getConfig and setConfig', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should return a copy of config', () => {
      const config1 = manager.getConfig()
      const config2 = manager.getConfig()
      
      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // Should be different objects
    })

    it('should update config and save', () => {
      manager.setConfig({ serverUrl: 'https://example.com' })
      
      const config = manager.getConfig()
      expect(config.serverUrl).toBe('https://example.com')
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('getConnectionMode', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should return current connection mode', () => {
      expect(manager.getConnectionMode()).toBe('remote')
      
      manager.setConfig({ connectionMode: 'embedded' })
      expect(manager.getConnectionMode()).toBe('embedded')
    })
  })

  describe('getServerUrl', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should return undefined when no URL is set', () => {
      expect(manager.getServerUrl()).toBeUndefined()
    })

    it('should return server URL when set', () => {
      manager.setConfig({ serverUrl: 'https://example.com' })
      expect(manager.getServerUrl()).toBe('https://example.com')
    })
  })

  describe('getEmbeddedPort', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should return default port', () => {
      expect(manager.getEmbeddedPort()).toBe(5170)
    })

    it('should return configured port', () => {
      manager.setConfig({ embeddedPort: 5180 })
      expect(manager.getEmbeddedPort()).toBe(5180)
    })
  })

  describe('resetToDefault', () => {
    beforeEach(() => {
      manager.initialize()
    })

    it('should reset config to default values', () => {
      manager.setConfig({
        connectionMode: 'embedded',
        serverUrl: 'https://example.com',
        isFirstLaunch: false,
      })
      
      manager.resetToDefault()
      
      const config = manager.getConfig()
      expect(config.connectionMode).toBe('remote')
      expect(config.isFirstLaunch).toBe(true)
      expect(config.serverUrl).toBeUndefined()
    })
  })

  describe('testConnection', () => {
    beforeEach(() => {
      manager.initialize()
      // Reset fetch mock
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should return error for invalid URL', async () => {
      const result = await manager.testConnection('invalid-url')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return success for valid server response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { version: '1.0.0', status: 'ok' },
        }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response)

      const result = await manager.testConnection('http://localhost:5170')
      
      expect(result.success).toBe(true)
      expect(result.version).toBe('1.0.0')
      expect(result.latency).toBeDefined()
    })

    it('should return error for non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response)

      const result = await manager.testConnection('http://localhost:5170')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })

    it('should return error for invalid response format', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ invalid: 'response' }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response)

      const result = await manager.testConnection('http://localhost:5170')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('格式无效')
    })

    it('should return error for network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const result = await manager.testConnection('http://localhost:5170')
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should return error for timeout', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValue(abortError)

      const result = await manager.testConnection('http://localhost:5170')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('超时')
    })
  })

  describe('switchMode', () => {
    beforeEach(() => {
      manager.initialize()
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should switch to embedded mode and start server', async () => {
      const mockEmbeddedServer = getEmbeddedServer()
      vi.mocked(mockEmbeddedServer.isServerRunning).mockReturnValue(false)
      vi.mocked(mockEmbeddedServer.start).mockResolvedValue(5170)
      
      const result = await manager.switchMode('embedded')
      
      expect(result).toBe(true)
      expect(manager.getConnectionMode()).toBe('embedded')
      expect(mockEmbeddedServer.start).toHaveBeenCalled()
    })

    it('should fail to switch to remote mode without URL', async () => {
      const result = await manager.switchMode('remote')
      
      expect(result).toBe(false)
    })

    it('should switch to remote mode with valid URL and successful connection', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { version: '1.0.0', status: 'ok' },
        }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response)

      const result = await manager.switchMode('remote', 'http://localhost:5170')
      
      expect(result).toBe(true)
      expect(manager.getConnectionMode()).toBe('remote')
      expect(manager.getServerUrl()).toBe('http://localhost:5170')
    })

    it('should fail to switch to remote mode when connection test fails', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Connection failed'))

      const result = await manager.switchMode('remote', 'http://localhost:5170')
      
      expect(result).toBe(false)
      // Mode should not change
      expect(manager.getConnectionMode()).toBe('remote')
    })

    it('should stop embedded server when switching from embedded to remote mode', async () => {
      const mockEmbeddedServer = getEmbeddedServer()
      
      // First switch to embedded mode
      vi.mocked(mockEmbeddedServer.isServerRunning).mockReturnValue(false)
      vi.mocked(mockEmbeddedServer.start).mockResolvedValue(5170)
      await manager.switchMode('embedded')
      
      // Now switch to remote mode
      vi.mocked(mockEmbeddedServer.isServerRunning).mockReturnValue(true)
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { version: '1.0.0', status: 'ok' },
        }),
      }
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response)
      
      await manager.switchMode('remote', 'http://localhost:5170')
      
      expect(mockEmbeddedServer.stop).toHaveBeenCalled()
    })
  })
})
