/**
 * ConflictResolver 单元测试
 * Unit tests for ConflictResolver
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConflictResolver, resetConflictResolver } from '../src/main/ConflictResolver'
import type { SyncConflict } from '../src/shared/types'

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
  },
}))

describe('ConflictResolver', () => {
  let resolver: ConflictResolver

  beforeEach(() => {
    resetConflictResolver()
    resolver = new ConflictResolver()
  })

  afterEach(() => {
    resolver.clearConflicts()
  })

  describe('detectConflict', () => {
    it('should detect conflict when versions diverge', () => {
      const localData = { version: 3, updatedAt: Date.now() }
      const remoteData = { version: 5, updatedAt: Date.now() }

      expect(resolver.detectConflict(localData, remoteData)).toBe(true)
    })

    it('should not detect conflict when local is direct successor', () => {
      const localData = { version: 3, updatedAt: Date.now() }
      const remoteData = { version: 2, updatedAt: Date.now() }

      expect(resolver.detectConflict(localData, remoteData)).toBe(false)
    })

    it('should not detect conflict when remote is direct successor', () => {
      const localData = { version: 2, updatedAt: Date.now() }
      const remoteData = { version: 3, updatedAt: Date.now() }

      expect(resolver.detectConflict(localData, remoteData)).toBe(false)
    })

    it('should not detect conflict when versions are equal', () => {
      const localData = { version: 3, updatedAt: Date.now() }
      const remoteData = { version: 3, updatedAt: Date.now() }

      expect(resolver.detectConflict(localData, remoteData)).toBe(false)
    })
  })

  describe('addConflict', () => {
    it('should add a conflict to pending list', () => {
      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { title: 'Local', version: 2 },
        remoteVersion: { title: 'Remote', version: 3 },
      }

      resolver.addConflict(conflict)

      expect(resolver.getConflictCount()).toBe(1)
      expect(resolver.getConflict('memo-1')).toEqual(conflict)
    })

    it('should replace existing conflict with same entityId', () => {
      const conflict1: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { title: 'Local 1' },
        remoteVersion: { title: 'Remote 1' },
      }

      const conflict2: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { title: 'Local 2' },
        remoteVersion: { title: 'Remote 2' },
      }

      resolver.addConflict(conflict1)
      resolver.addConflict(conflict2)

      expect(resolver.getConflictCount()).toBe(1)
      expect(resolver.getConflict('memo-1')).toEqual(conflict2)
    })
  })

  describe('getAllConflicts', () => {
    it('should return all pending conflicts', () => {
      const conflict1: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      }

      const conflict2: SyncConflict = {
        entityId: 'memo-2',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      }

      resolver.addConflict(conflict1)
      resolver.addConflict(conflict2)

      const conflicts = resolver.getAllConflicts()
      expect(conflicts).toHaveLength(2)
    })
  })

  describe('resolveConflict', () => {
    it('should resolve conflict and remove from pending', async () => {
      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { title: 'Local' },
        remoteVersion: { title: 'Remote' },
      }

      resolver.addConflict(conflict)
      expect(resolver.getConflictCount()).toBe(1)

      const result = await resolver.resolveConflict('memo-1', 'local')

      expect(result.entityId).toBe('memo-1')
      expect(result.resolution).toBe('local')
      expect(resolver.getConflictCount()).toBe(0)
    })

    it('should throw error if conflict not found', async () => {
      await expect(resolver.resolveConflict('non-existent', 'local')).rejects.toThrow(
        'No conflict found for entity non-existent'
      )
    })

    it('should notify callbacks on resolution', async () => {
      const callback = vi.fn()
      resolver.onConflictResolved(callback)

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      }

      resolver.addConflict(conflict)
      await resolver.resolveConflict('memo-1', 'remote')

      expect(callback).toHaveBeenCalledWith({
        entityId: 'memo-1',
        resolution: 'remote',
        mergedData: undefined,
      })
    })
  })

  describe('autoResolveConflict', () => {
    it('should resolve using local strategy', async () => {
      resolver.setConfig({ autoResolve: true, autoResolveStrategy: 'local' })

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { updatedAt: 1000 },
        remoteVersion: { updatedAt: 2000 },
      }

      resolver.addConflict(conflict)
      const result = await resolver.autoResolveConflict(conflict)

      expect(result.resolution).toBe('local')
    })

    it('should resolve using remote strategy', async () => {
      resolver.setConfig({ autoResolve: true, autoResolveStrategy: 'remote' })

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { updatedAt: 2000 },
        remoteVersion: { updatedAt: 1000 },
      }

      resolver.addConflict(conflict)
      const result = await resolver.autoResolveConflict(conflict)

      expect(result.resolution).toBe('remote')
    })

    it('should resolve using newest strategy - local newer', async () => {
      resolver.setConfig({ autoResolve: true, autoResolveStrategy: 'newest' })

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { updatedAt: 2000 },
        remoteVersion: { updatedAt: 1000 },
      }

      resolver.addConflict(conflict)
      const result = await resolver.autoResolveConflict(conflict)

      expect(result.resolution).toBe('local')
    })

    it('should resolve using newest strategy - remote newer', async () => {
      resolver.setConfig({ autoResolve: true, autoResolveStrategy: 'newest' })

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: { updatedAt: 1000 },
        remoteVersion: { updatedAt: 2000 },
      }

      resolver.addConflict(conflict)
      const result = await resolver.autoResolveConflict(conflict)

      expect(result.resolution).toBe('remote')
    })
  })

  describe('clearConflicts', () => {
    it('should clear all pending conflicts', () => {
      resolver.addConflict({
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      })

      resolver.addConflict({
        entityId: 'memo-2',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      })

      expect(resolver.getConflictCount()).toBe(2)

      resolver.clearConflicts()

      expect(resolver.getConflictCount()).toBe(0)
    })
  })

  describe('callbacks', () => {
    it('should allow unsubscribing from callbacks', async () => {
      const callback = vi.fn()
      const unsubscribe = resolver.onConflictResolved(callback)

      unsubscribe()

      const conflict: SyncConflict = {
        entityId: 'memo-1',
        entityType: 'memo',
        localVersion: {},
        remoteVersion: {},
      }

      resolver.addConflict(conflict)
      await resolver.resolveConflict('memo-1', 'local')

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('config', () => {
    it('should get and set config', () => {
      resolver.setConfig({ autoResolve: true, autoResolveStrategy: 'remote' })

      const config = resolver.getConfig()
      expect(config.autoResolve).toBe(true)
      expect(config.autoResolveStrategy).toBe('remote')
    })
  })
})
