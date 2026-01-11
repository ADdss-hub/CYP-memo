/**
 * 登出管理器测试
 * Tests for LogoutManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Use vi.hoisted to create mock objects that can be used in vi.mock
const { mockCacheInstance, mockCredentialInstance } = vi.hoisted(() => ({
  mockCacheInstance: {
    isInitialized: vi.fn(() => true),
    getStats: vi.fn(() => Promise.resolve({ totalMemos: 5, totalSize: 1024, lastSyncTime: null })),
    clearAll: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    destroy: vi.fn()
  },
  mockCredentialInstance: {
    deleteCredential: vi.fn(() => Promise.resolve(true))
  }
}))

// Mock modules
vi.mock('../src/main/CacheManager', () => ({
  getCacheManager: vi.fn(() => mockCacheInstance),
  resetCacheManager: vi.fn()
}))

vi.mock('../src/main/CredentialManager', () => ({
  credentialManager: mockCredentialInstance
}))

// Import after mocking
import { LogoutManager, logoutManager } from '../src/main/LogoutManager'

describe('LogoutManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockCacheInstance.isInitialized.mockReturnValue(true)
    mockCacheInstance.getStats.mockResolvedValue({ totalMemos: 5, totalSize: 1024, lastSyncTime: null })
    mockCacheInstance.clearAll.mockResolvedValue(undefined)
    mockCredentialInstance.deleteCredential.mockResolvedValue(true)
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = LogoutManager.getInstance()
      const instance2 = LogoutManager.getInstance()
      
      expect(instance1).toBe(instance2)
    })

    it('should export logoutManager singleton', () => {
      expect(logoutManager).toBeDefined()
      expect(logoutManager).toBe(LogoutManager.getInstance())
    })
  })

  describe('performLogoutCleanup', () => {
    it('should clear cache by default', async () => {
      const result = await logoutManager.performLogoutCleanup()
      
      expect(mockCacheInstance.clearAll).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.clearedCacheCount).toBe(5)
    })

    it('should not clear cache when clearCache is false', async () => {
      const result = await logoutManager.performLogoutCleanup({ clearCache: false })
      
      expect(mockCacheInstance.clearAll).not.toHaveBeenCalled()
      expect(result.clearedCacheCount).toBe(0)
    })

    it('should clear credentials when account is provided', async () => {
      const result = await logoutManager.performLogoutCleanup({
        clearCredentials: true,
        credentialAccount: 'test-user'
      })
      
      expect(mockCredentialInstance.deleteCredential).toHaveBeenCalledWith('cyp-memo', 'test-user')
      expect(result.clearedCredentials).toBe(true)
    })

    it('should not clear credentials when account is not provided', async () => {
      const result = await logoutManager.performLogoutCleanup({
        clearCredentials: true
      })
      
      expect(mockCredentialInstance.deleteCredential).not.toHaveBeenCalled()
      expect(result.clearedCredentials).toBe(false)
    })

    it('should handle cache clear errors', async () => {
      mockCacheInstance.clearAll.mockRejectedValue(new Error('Cache error'))
      
      const result = await logoutManager.performLogoutCleanup()
      
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Cache clear failed: Cache error')
    })

    it('should skip cache clear when not initialized', async () => {
      mockCacheInstance.isInitialized.mockReturnValue(false)
      
      const result = await logoutManager.performLogoutCleanup()
      
      expect(mockCacheInstance.clearAll).not.toHaveBeenCalled()
      expect(result.clearedCacheCount).toBe(0)
    })
  })

  describe('clearAllCache', () => {
    it('should clear all cache and return true', async () => {
      const result = await logoutManager.clearAllCache()
      
      expect(mockCacheInstance.clearAll).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should return false on error', async () => {
      mockCacheInstance.clearAll.mockRejectedValue(new Error('Error'))
      
      const result = await logoutManager.clearAllCache()
      
      expect(result).toBe(false)
    })

    it('should return true when cache not initialized', async () => {
      mockCacheInstance.isInitialized.mockReturnValue(false)
      
      const result = await logoutManager.clearAllCache()
      
      expect(result).toBe(true)
    })
  })

  describe('clearUserCredentials', () => {
    it('should clear credentials and return true', async () => {
      const result = await logoutManager.clearUserCredentials('service', 'account')
      
      expect(mockCredentialInstance.deleteCredential).toHaveBeenCalledWith('service', 'account')
      expect(result).toBe(true)
    })

    it('should return false on error', async () => {
      mockCredentialInstance.deleteCredential.mockRejectedValue(new Error('Error'))
      
      const result = await logoutManager.clearUserCredentials('service', 'account')
      
      expect(result).toBe(false)
    })
  })
})
