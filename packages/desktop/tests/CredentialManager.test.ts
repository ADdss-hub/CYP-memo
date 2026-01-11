/**
 * CredentialManager 单元测试
 * Unit tests for the CredentialManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create mock functions
const mockSetPassword = vi.fn()
const mockGetPassword = vi.fn()
const mockDeletePassword = vi.fn()
const mockFindCredentials = vi.fn()

// Mock keytar module
vi.mock('keytar', () => ({
  default: {
    setPassword: mockSetPassword,
    getPassword: mockGetPassword,
    deletePassword: mockDeletePassword,
    findCredentials: mockFindCredentials,
  },
}))

describe('CredentialManager', () => {
  let CredentialManager: typeof import('../src/main/CredentialManager').CredentialManager

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    
    const module = await import('../src/main/CredentialManager')
    CredentialManager = module.CredentialManager
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default service prefix', () => {
      const manager = new CredentialManager()
      expect(manager).toBeDefined()
    })

    it('should initialize with custom service prefix', () => {
      const manager = new CredentialManager('custom-prefix')
      expect(manager).toBeDefined()
    })
  })

  describe('setCredential', () => {
    it('should store credential with prefixed service name', async () => {
      const manager = new CredentialManager()
      
      await manager.setCredential('auth', 'user@example.com', 'secret123')
      
      expect(mockSetPassword).toHaveBeenCalledWith(
        'cyp-memo:auth',
        'user@example.com',
        'secret123'
      )
    })

    it('should use custom prefix when provided', async () => {
      const manager = new CredentialManager('my-app')
      
      await manager.setCredential('auth', 'user@example.com', 'secret123')
      
      expect(mockSetPassword).toHaveBeenCalledWith(
        'my-app:auth',
        'user@example.com',
        'secret123'
      )
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.setCredential('', 'user', 'pass')).rejects.toThrow(
        'Service and account are required'
      )
    })

    it('should throw error when account is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.setCredential('auth', '', 'pass')).rejects.toThrow(
        'Service and account are required'
      )
    })

    it('should throw error when password is undefined', async () => {
      const manager = new CredentialManager()
      
      await expect(
        manager.setCredential('auth', 'user', undefined as unknown as string)
      ).rejects.toThrow('Password is required')
    })

    it('should throw error when password is null', async () => {
      const manager = new CredentialManager()
      
      await expect(
        manager.setCredential('auth', 'user', null as unknown as string)
      ).rejects.toThrow('Password is required')
    })

    it('should allow empty string as password', async () => {
      const manager = new CredentialManager()
      
      await manager.setCredential('auth', 'user', '')
      
      expect(mockSetPassword).toHaveBeenCalledWith('cyp-memo:auth', 'user', '')
    })
  })

  describe('getCredential', () => {
    it('should retrieve credential with prefixed service name', async () => {
      const manager = new CredentialManager()
      mockGetPassword.mockResolvedValue('secret123')
      
      const result = await manager.getCredential('auth', 'user@example.com')
      
      expect(mockGetPassword).toHaveBeenCalledWith('cyp-memo:auth', 'user@example.com')
      expect(result).toBe('secret123')
    })

    it('should return null when credential does not exist', async () => {
      const manager = new CredentialManager()
      mockGetPassword.mockResolvedValue(null)
      
      const result = await manager.getCredential('auth', 'nonexistent')
      
      expect(result).toBeNull()
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.getCredential('', 'user')).rejects.toThrow(
        'Service and account are required'
      )
    })

    it('should throw error when account is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.getCredential('auth', '')).rejects.toThrow(
        'Service and account are required'
      )
    })
  })

  describe('deleteCredential', () => {
    it('should delete credential and return true on success', async () => {
      const manager = new CredentialManager()
      mockDeletePassword.mockResolvedValue(true)
      
      const result = await manager.deleteCredential('auth', 'user@example.com')
      
      expect(mockDeletePassword).toHaveBeenCalledWith('cyp-memo:auth', 'user@example.com')
      expect(result).toBe(true)
    })

    it('should return false when credential does not exist', async () => {
      const manager = new CredentialManager()
      mockDeletePassword.mockResolvedValue(false)
      
      const result = await manager.deleteCredential('auth', 'nonexistent')
      
      expect(result).toBe(false)
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.deleteCredential('', 'user')).rejects.toThrow(
        'Service and account are required'
      )
    })

    it('should throw error when account is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.deleteCredential('auth', '')).rejects.toThrow(
        'Service and account are required'
      )
    })
  })

  describe('hasCredential', () => {
    it('should return true when credential exists', async () => {
      const manager = new CredentialManager()
      mockGetPassword.mockResolvedValue('secret123')
      
      const result = await manager.hasCredential('auth', 'user@example.com')
      
      expect(result).toBe(true)
    })

    it('should return false when credential does not exist', async () => {
      const manager = new CredentialManager()
      mockGetPassword.mockResolvedValue(null)
      
      const result = await manager.hasCredential('auth', 'nonexistent')
      
      expect(result).toBe(false)
    })
  })

  describe('findCredentials', () => {
    it('should find all credentials for a service', async () => {
      const manager = new CredentialManager()
      const mockCredentials = [
        { account: 'user1', password: 'pass1' },
        { account: 'user2', password: 'pass2' },
      ]
      mockFindCredentials.mockResolvedValue(mockCredentials)
      
      const result = await manager.findCredentials('auth')
      
      expect(mockFindCredentials).toHaveBeenCalledWith('cyp-memo:auth')
      expect(result).toEqual(mockCredentials)
    })

    it('should return empty array when no credentials exist', async () => {
      const manager = new CredentialManager()
      mockFindCredentials.mockResolvedValue([])
      
      const result = await manager.findCredentials('auth')
      
      expect(result).toEqual([])
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()
      
      await expect(manager.findCredentials('')).rejects.toThrow('Service is required')
    })
  })

  describe('clearServiceCredentials', () => {
    it('should delete all credentials for a service', async () => {
      const manager = new CredentialManager()
      const mockCredentials = [
        { account: 'user1', password: 'pass1' },
        { account: 'user2', password: 'pass2' },
      ]
      mockFindCredentials.mockResolvedValue(mockCredentials)
      mockDeletePassword.mockResolvedValue(true)
      
      const result = await manager.clearServiceCredentials('auth')
      
      expect(mockDeletePassword).toHaveBeenCalledTimes(2)
      expect(result).toBe(2)
    })

    it('should return 0 when no credentials exist', async () => {
      const manager = new CredentialManager()
      mockFindCredentials.mockResolvedValue([])
      
      const result = await manager.clearServiceCredentials('auth')
      
      expect(result).toBe(0)
    })

    it('should count only successfully deleted credentials', async () => {
      const manager = new CredentialManager()
      const mockCredentials = [
        { account: 'user1', password: 'pass1' },
        { account: 'user2', password: 'pass2' },
      ]
      mockFindCredentials.mockResolvedValue(mockCredentials)
      mockDeletePassword
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
      
      const result = await manager.clearServiceCredentials('auth')
      
      expect(result).toBe(1)
    })
  })
})
