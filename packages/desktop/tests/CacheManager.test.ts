/**
 * 缓存管理器测试
 * Tests for CacheManager
 * 
 * Note: These tests mock better-sqlite3 since it's a native module
 * that requires compilation for the specific Node.js version.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// Mock better-sqlite3 before importing CacheManager
const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(() => [])
  })),
  transaction: vi.fn((fn) => fn),
  close: vi.fn()
}

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb)
}))

// Import after mocking
import { CacheManager } from '../src/main/CacheManager'
import type { CachedMemo } from '../src/shared/types'
import { encrypt, generateKey } from '../src/main/CryptoUtils'

describe('CacheManager', () => {
  let cacheManager: CacheManager
  let testDbPath: string

  beforeEach(() => {
    vi.clearAllMocks()
    testDbPath = path.join(os.tmpdir(), `test-cache-${Date.now()}.db`)
    cacheManager = new CacheManager({ dbPath: testDbPath })
  })

  afterEach(() => {
    // Clean up test files
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath)
      }
      if (fs.existsSync(testDbPath + '.salt')) {
        fs.unlinkSync(testDbPath + '.salt')
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  const createTestMemo = (id: string, title: string = 'Test Memo'): CachedMemo => ({
    id,
    title,
    content: `Content for ${title}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1
  })

  describe('initialization', () => {
    it('should initialize with master password', async () => {
      await cacheManager.initialize('test-password')
      
      expect(cacheManager.isInitialized()).toBe(true)
    })

    it('should create salt file on initialization', async () => {
      await cacheManager.initialize('test-password')
      
      expect(fs.existsSync(testDbPath + '.salt')).toBe(true)
    })

    it('should not reinitialize if already initialized', async () => {
      await cacheManager.initialize('test-password')
      await cacheManager.initialize('different-password') // Should be ignored
      
      expect(cacheManager.isInitialized()).toBe(true)
    })

    it('should create database tables on initialization', async () => {
      await cacheManager.initialize('test-password')
      
      expect(mockDb.exec).toHaveBeenCalled()
    })
  })

  describe('cacheMemo', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should cache a memo', async () => {
      const memo = createTestMemo('memo-1')
      
      await cacheManager.cacheMemo(memo)
      
      expect(mockDb.prepare).toHaveBeenCalled()
    })

    it('should throw error if not initialized', async () => {
      const uninitializedManager = new CacheManager({ dbPath: testDbPath + '.uninit' })
      const memo = createTestMemo('memo-1')
      
      await expect(uninitializedManager.cacheMemo(memo)).rejects.toThrow('not initialized')
    })
  })

  describe('cacheMemos', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should cache multiple memos using transaction', async () => {
      const memos = [
        createTestMemo('memo-1', 'Memo 1'),
        createTestMemo('memo-2', 'Memo 2'),
        createTestMemo('memo-3', 'Memo 3')
      ]
      
      await cacheManager.cacheMemos(memos)
      
      expect(mockDb.transaction).toHaveBeenCalled()
    })
  })

  describe('getCachedMemo', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should return null for non-existent memo', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn(() => undefined)
      })
      
      const result = await cacheManager.getCachedMemo('non-existent')
      
      expect(result).toBeNull()
    })
  })

  describe('getAllCachedMemos', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should return empty array when no memos', async () => {
      mockDb.prepare.mockReturnValueOnce({
        all: vi.fn(() => [])
      })
      
      const all = await cacheManager.getAllCachedMemos()
      
      expect(all).toEqual([])
    })
  })

  describe('deleteCachedMemo', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should call delete statement', async () => {
      const runMock = vi.fn()
      mockDb.prepare.mockReturnValueOnce({
        run: runMock
      })
      
      await cacheManager.deleteCachedMemo('memo-1')
      
      expect(runMock).toHaveBeenCalledWith('memo-1')
    })
  })

  describe('clearAll', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should execute delete statements', async () => {
      await cacheManager.clearAll()
      
      // Should call exec for DELETE statements
      expect(mockDb.exec).toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    beforeEach(async () => {
      await cacheManager.initialize('test-password')
    })

    it('should return stats object', async () => {
      mockDb.prepare
        .mockReturnValueOnce({ get: vi.fn(() => ({ count: 5 })) })
        .mockReturnValueOnce({ get: vi.fn(() => ({ size: 1024 })) })
        .mockReturnValueOnce({ get: vi.fn(() => undefined) })
      
      const stats = await cacheManager.getStats()
      
      expect(stats).toHaveProperty('totalMemos')
      expect(stats).toHaveProperty('totalSize')
      expect(stats).toHaveProperty('lastSyncTime')
    })
  })

  describe('close', () => {
    it('should close database connection', async () => {
      await cacheManager.initialize('test-password')
      cacheManager.close()
      
      expect(cacheManager.isInitialized()).toBe(false)
      expect(mockDb.close).toHaveBeenCalled()
    })
  })
})
