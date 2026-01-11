/**
 * NetworkManager 单元测试
 * Unit tests for NetworkManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NetworkManager, resetNetworkManager } from '../src/main/NetworkManager'

// Mock electron net module
vi.mock('electron', () => ({
  net: {
    isOnline: vi.fn(() => true),
    request: vi.fn(() => ({
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'response') {
          setTimeout(callback, 10)
        }
      }),
      end: vi.fn(),
    })),
  },
}))

describe('NetworkManager', () => {
  let networkManager: NetworkManager

  beforeEach(() => {
    vi.useFakeTimers()
    resetNetworkManager()
    networkManager = new NetworkManager({
      checkInterval: 1000,
      timeout: 500,
    })
  })

  afterEach(() => {
    networkManager.destroy()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should not be initialized by default', () => {
      expect(networkManager.isInitialized()).toBe(false)
    })

    it('should be initialized after calling initialize()', () => {
      networkManager.initialize()
      expect(networkManager.isInitialized()).toBe(true)
    })

    it('should not reinitialize if already initialized', () => {
      networkManager.initialize()
      networkManager.initialize() // Should not throw
      expect(networkManager.isInitialized()).toBe(true)
    })
  })

  describe('isOnline', () => {
    it('should return true by default', () => {
      expect(networkManager.isOnline()).toBe(true)
    })

    it('should return the current online status', () => {
      networkManager.setOnlineStatus(false)
      expect(networkManager.isOnline()).toBe(false)
      
      networkManager.setOnlineStatus(true)
      expect(networkManager.isOnline()).toBe(true)
    })
  })

  describe('onNetworkChange', () => {
    it('should register a callback', () => {
      const callback = vi.fn()
      networkManager.onNetworkChange(callback)
      
      networkManager.setOnlineStatus(false)
      expect(callback).toHaveBeenCalledWith(false)
    })

    it('should return an unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = networkManager.onNetworkChange(callback)
      
      unsubscribe()
      networkManager.setOnlineStatus(false)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should notify multiple callbacks', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      
      networkManager.onNetworkChange(callback1)
      networkManager.onNetworkChange(callback2)
      
      networkManager.setOnlineStatus(false)
      
      expect(callback1).toHaveBeenCalledWith(false)
      expect(callback2).toHaveBeenCalledWith(false)
    })

    it('should only notify on status change', () => {
      const callback = vi.fn()
      networkManager.onNetworkChange(callback)
      
      // Initial status is true, setting to true should not trigger
      networkManager.setOnlineStatus(true)
      expect(callback).not.toHaveBeenCalled()
      
      // Change to false should trigger
      networkManager.setOnlineStatus(false)
      expect(callback).toHaveBeenCalledTimes(1)
      
      // Setting to false again should not trigger
      networkManager.setOnlineStatus(false)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('removeNetworkChangeListener', () => {
    it('should remove a callback', () => {
      const callback = vi.fn()
      networkManager.onNetworkChange(callback)
      
      networkManager.removeNetworkChangeListener(callback)
      networkManager.setOnlineStatus(false)
      
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('should clear all callbacks', () => {
      const callback = vi.fn()
      networkManager.onNetworkChange(callback)
      
      networkManager.destroy()
      
      // Manually set status after destroy - should not notify
      networkManager.setOnlineStatus(false)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should set initialized to false', () => {
      networkManager.initialize()
      expect(networkManager.isInitialized()).toBe(true)
      
      networkManager.destroy()
      expect(networkManager.isInitialized()).toBe(false)
    })
  })

  describe('setOnlineStatus', () => {
    it('should update the online status', () => {
      networkManager.setOnlineStatus(false)
      expect(networkManager.isOnline()).toBe(false)
    })

    it('should notify callbacks when status changes', () => {
      const callback = vi.fn()
      networkManager.onNetworkChange(callback)
      
      networkManager.setOnlineStatus(false)
      expect(callback).toHaveBeenCalledWith(false)
      
      networkManager.setOnlineStatus(true)
      expect(callback).toHaveBeenCalledWith(true)
    })
  })
})
