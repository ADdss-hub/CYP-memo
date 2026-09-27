/**
 * CredentialManager 单元测试
 * Unit tests for the CredentialManager class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CredentialManager,
  __setKeytarForTests,
} from '../src/main/CredentialManager'

const mockSetPassword = vi.fn()
const mockGetPassword = vi.fn()
const mockDeletePassword = vi.fn()
const mockFindCredentials = vi.fn()

describe('CredentialManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __setKeytarForTests({
      setPassword: mockSetPassword,
      getPassword: mockGetPassword,
      deletePassword: mockDeletePassword,
      findCredentials: mockFindCredentials,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    __setKeytarForTests(null)
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

    it('should throw error when password is null', async () => {
      const manager = new CredentialManager()

      await expect(
        manager.setCredential('auth', 'user', null as unknown as string)
      ).rejects.toThrow('Password is required')
    })

    it('should allow empty string as password', async () => {
      mockSetPassword.mockResolvedValue(undefined)
      const manager = new CredentialManager()

      await manager.setCredential('auth', 'user@example.com', '')

      expect(mockSetPassword).toHaveBeenCalledWith('cyp-memo:auth', 'user@example.com', '')
    })
  })

  describe('getCredential', () => {
    it('should retrieve credential with prefixed service name', async () => {
      mockGetPassword.mockResolvedValue('secret123')
      const manager = new CredentialManager()

      const result = await manager.getCredential('auth', 'user@example.com')

      expect(mockGetPassword).toHaveBeenCalledWith('cyp-memo:auth', 'user@example.com')
      expect(result).toBe('secret123')
    })

    it('should return null when credential does not exist', async () => {
      mockGetPassword.mockResolvedValue(null)
      const manager = new CredentialManager()

      const result = await manager.getCredential('auth', 'missing@example.com')

      expect(result).toBeNull()
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()

      await expect(manager.getCredential('', 'user')).rejects.toThrow(
        'Service and account are required'
      )
    })
  })

  describe('deleteCredential', () => {
    it('should delete credential and return true', async () => {
      mockDeletePassword.mockResolvedValue(true)
      const manager = new CredentialManager()

      const result = await manager.deleteCredential('auth', 'user@example.com')

      expect(mockDeletePassword).toHaveBeenCalledWith('cyp-memo:auth', 'user@example.com')
      expect(result).toBe(true)
    })

    it('should return false when credential does not exist', async () => {
      mockDeletePassword.mockResolvedValue(false)
      const manager = new CredentialManager()

      const result = await manager.deleteCredential('auth', 'missing@example.com')

      expect(result).toBe(false)
    })
  })

  describe('hasCredential', () => {
    it('should return true when credential exists', async () => {
      mockGetPassword.mockResolvedValue('secret')
      const manager = new CredentialManager()

      const result = await manager.hasCredential('auth', 'user@example.com')

      expect(result).toBe(true)
    })

    it('should return false when credential does not exist', async () => {
      mockGetPassword.mockResolvedValue(null)
      const manager = new CredentialManager()

      const result = await manager.hasCredential('auth', 'missing@example.com')

      expect(result).toBe(false)
    })
  })

  describe('findCredentials', () => {
    it('should find all credentials for a service', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'a@example.com', password: 'p1' },
        { account: 'b@example.com', password: 'p2' },
      ])
      const manager = new CredentialManager()

      const result = await manager.findCredentials('auth')

      expect(mockFindCredentials).toHaveBeenCalledWith('cyp-memo:auth')
      expect(result).toHaveLength(2)
    })

    it('should throw error when service is empty', async () => {
      const manager = new CredentialManager()

      await expect(manager.findCredentials('')).rejects.toThrow('Service is required')
    })
  })

  describe('clearServiceCredentials', () => {
    it('should delete all credentials for a service', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'a@example.com', password: 'p1' },
        { account: 'b@example.com', password: 'p2' },
      ])
      mockDeletePassword.mockResolvedValue(true)
      const manager = new CredentialManager()

      const result = await manager.clearServiceCredentials('auth')

      expect(mockDeletePassword).toHaveBeenCalledTimes(2)
      expect(result).toBe(2)
    })

    it('should count only successfully deleted credentials', async () => {
      mockFindCredentials.mockResolvedValue([
        { account: 'a@example.com', password: 'p1' },
        { account: 'b@example.com', password: 'p2' },
      ])
      mockDeletePassword
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
      const manager = new CredentialManager()

      const result = await manager.clearServiceCredentials('auth')

      expect(result).toBe(1)
    })
  })
})
