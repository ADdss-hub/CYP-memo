/**
 * StartupLoader 单元测试
 * Unit tests for StartupLoader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StartupLoader, resetStartupLoader } from '../src/main/StartupLoader'
import { NetworkManager } from '../src/main/NetworkManager'
import type { CachedMemo, SyncResult } from '../src/shared/types'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
  },
  BrowserWindow: vi.fn(),
  net: {
    isOnline: vi.fn(() => true),
    request: vi.fn(() => ({
      on: vi.fn(),
      end: vi.fn(),
    })),
  },
}))

// Mock CacheManager
const mockCachedMemos: CachedMemo[] = [
  {
    id: 'memo-1',
    title: 'Test Memo 1',
    content: 'Content 1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  },
  {
    id: 'memo-2',
    title: 'Test Memo 2',
    content: 'Content 2',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  },
]

class MockCacheManager {
  private initialized = true
  private memos: CachedMemo[] = [...mockCachedMemos]

  isInitialized(): boolean {
    return this.initialized
  }

  setInitialized(value: boolean): void {
    this.initialized = value
  }

  async getAllCachedMemos(): Promise<CachedMemo[]> {
    return [...this.memos]
  }

  setMemos(memos: CachedMemo[]): void {
    this.memos = memos
  }
}

// Mock SyncManager
class MockSyncManager {
  private initialized = true
  private syncResult: SyncResult = {
    success: true,
    synced: 0,
    conflicts: [],
    errors: [],
  }

  isInitialized(): boolean {
    return this.initialized
  }

  setInitialized(value: boolean): void {
    this.initialized = value
  }

  async sync(): Promise<SyncResult> {
    return this.syncResult
  }

  setSyncResult(result: SyncResult): void {
    this.syncResult = result
  }
}

describe('StartupLoader', () => {
  let loader: StartupLoader
  let networkManager: NetworkManager
  let cacheManager: MockCacheManager
  let syncManager: MockSyncManager

  beforeEach(() => {
    vi.useFakeTimers()
    resetStartupLoader()
    
    networkManager = new NetworkManager()
    cacheManager = new MockCacheManager()
    syncManager = new MockSyncManager()
    
    loader = new StartupLoader({
      cacheManager: cacheManager as any,
      syncManager: syncManager as any,
      networkManager,
      autoSync: false, // Disable auto sync for most tests
      syncDelay: 100,
    })
  })

  afterEach(() => {
    loader.reset()
    networkManager.destroy()
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = loader.getState()
      
      expect(state.loading).toBe(false)
      expect(state.cacheLoaded).toBe(false)
      expect(state.serverSynced).toBe(false)
      expect(state.cachedMemoCount).toBe(0)
    })

    it('should not be loading initially', () => {
      expect(loader.isLoading()).toBe(false)
    })

    it('should not have cache loaded initially', () => {
      expect(loader.isCacheLoaded()).toBe(false)
    })

    it('should not be synced initially', () => {
      expect(loader.isSynced()).toBe(false)
    })
  })

  describe('load', () => {
    it('should load cached data', async () => {
      const state = await loader.load()
      
      expect(state.cacheLoaded).toBe(true)
      expect(state.cachedMemoCount).toBe(2)
      expect(state.loading).toBe(false)
    })

    it('should return empty when cache not initialized', async () => {
      cacheManager.setInitialized(false)
      
      const state = await loader.load()
      
      expect(state.cacheLoaded).toBe(true)
      expect(state.cachedMemoCount).toBe(0)
    })

    it('should notify progress callbacks', async () => {
      const callback = vi.fn()
      loader.onProgress(callback)
      
      await loader.load()
      
      expect(callback).toHaveBeenCalled()
      // Should be called multiple times for different state updates
      expect(callback.mock.calls.length).toBeGreaterThan(0)
    })

    it('should handle errors gracefully', async () => {
      cacheManager.getAllCachedMemos = vi.fn().mockRejectedValue(new Error('Cache error'))
      cacheManager.setInitialized(true)
      
      const state = await loader.load()
      
      expect(state.loading).toBe(false)
      expect(state.cachedMemoCount).toBe(0)
    })
  })

  describe('auto sync', () => {
    it('should trigger background sync when enabled and online', async () => {
      const loaderWithSync = new StartupLoader({
        cacheManager: cacheManager as any,
        syncManager: syncManager as any,
        networkManager,
        autoSync: true,
        syncDelay: 100,
      })

      networkManager.setOnlineStatus(true)
      syncManager.setSyncResult({
        success: true,
        synced: 1,
        conflicts: [],
        errors: [],
      })

      await loaderWithSync.load()
      
      // Fast-forward timers to trigger sync
      await vi.advanceTimersByTimeAsync(200)
      
      const state = loaderWithSync.getState()
      expect(state.serverSynced).toBe(true)
      
      loaderWithSync.reset()
    })

    it('should not sync when offline', async () => {
      const loaderWithSync = new StartupLoader({
        cacheManager: cacheManager as any,
        syncManager: syncManager as any,
        networkManager,
        autoSync: true,
        syncDelay: 100,
      })

      networkManager.setOnlineStatus(false)

      await loaderWithSync.load()
      
      // Fast-forward timers
      await vi.advanceTimersByTimeAsync(200)
      
      const state = loaderWithSync.getState()
      expect(state.serverSynced).toBe(false)
      
      loaderWithSync.reset()
    })
  })

  describe('manualSync', () => {
    it('should sync when online', async () => {
      networkManager.setOnlineStatus(true)
      syncManager.setSyncResult({
        success: true,
        synced: 2,
        conflicts: [],
        errors: [],
      })

      const result = await loader.manualSync()
      
      expect(result).not.toBeNull()
      expect(result?.success).toBe(true)
      expect(result?.synced).toBe(2)
    })

    it('should return error when offline', async () => {
      networkManager.setOnlineStatus(false)

      const result = await loader.manualSync()
      
      expect(result).not.toBeNull()
      expect(result?.success).toBe(false)
      expect(result?.errors).toContain('Network offline')
    })

    it('should return null when sync manager not initialized', async () => {
      syncManager.setInitialized(false)

      const result = await loader.manualSync()
      
      expect(result).toBeNull()
    })
  })

  describe('callbacks', () => {
    it('should allow unsubscribing from progress callbacks', async () => {
      const callback = vi.fn()
      const unsubscribe = loader.onProgress(callback)
      
      unsubscribe()
      
      await loader.load()
      
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('should reset state to initial values', async () => {
      await loader.load()
      expect(loader.isCacheLoaded()).toBe(true)
      
      loader.reset()
      
      expect(loader.isCacheLoaded()).toBe(false)
      expect(loader.isLoading()).toBe(false)
      expect(loader.isSynced()).toBe(false)
    })
  })
})
