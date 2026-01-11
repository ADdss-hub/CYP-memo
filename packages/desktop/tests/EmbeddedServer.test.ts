/**
 * EmbeddedServer 单元测试
 * Tests for embedded Express server management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EmbeddedServer, resetEmbeddedServer } from '../src/main/EmbeddedServer'
import fs from 'fs'
import path from 'path'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-user-data'),
  },
}))

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

describe('EmbeddedServer', () => {
  let server: EmbeddedServer

  beforeEach(() => {
    vi.clearAllMocks()
    resetEmbeddedServer()
    
    // Default mock: directories don't exist
    vi.mocked(fs.existsSync).mockReturnValue(false)
    
    server = new EmbeddedServer()
  })

  afterEach(() => {
    resetEmbeddedServer()
  })

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const status = server.getStatus()
      
      expect(status.running).toBe(false)
      expect(status.port).toBe(5170)
      expect(status.uptime).toBe(0)
    })

    it('should set data directory in user data path', () => {
      const dataDir = server.getDataDir()
      expect(dataDir).toContain('test-user-data')
      expect(dataDir).toContain('server-data')
    })
  })

  describe('getStatus', () => {
    it('should return not running status initially', () => {
      const status = server.getStatus()
      
      expect(status.running).toBe(false)
      expect(status.uptime).toBe(0)
    })
  })

  describe('getUrl', () => {
    it('should return localhost URL with default port', () => {
      const url = server.getUrl()
      expect(url).toBe('http://localhost:5170')
    })
  })

  describe('getDataDir', () => {
    it('should return data directory path', () => {
      const dataDir = server.getDataDir()
      expect(dataDir).toBeDefined()
      expect(typeof dataDir).toBe('string')
    })
  })

  describe('isServerRunning', () => {
    it('should return false when server is not started', () => {
      expect(server.isServerRunning()).toBe(false)
    })
  })

  describe('stop', () => {
    it('should handle stop when server is not running', async () => {
      // Should not throw
      await expect(server.stop()).resolves.toBeUndefined()
    })
  })
})
