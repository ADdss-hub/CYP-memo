/**
 * IPC 消息验证器测试
 * Tests for IPC message validation utilities
 */

import { describe, it, expect } from 'vitest'
import {
  isValidChannel,
  isValidAccelerator,
  validateShortcutConfig,
  validateCachedMemo,
  validateNotificationOptions,
  validateNotificationPreferences,
  validateCredentialRequest,
  validateConflictResolution,
  validatePort,
  validateId,
  validateIPCMessage,
  getAllChannels,
} from '../src/shared/ipc-validator'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

describe('IPC Validator', () => {
  describe('isValidChannel', () => {
    it('should return true for valid channels', () => {
      expect(isValidChannel(IPC_CHANNELS.WINDOW_MINIMIZE)).toBe(true)
      expect(isValidChannel(IPC_CHANNELS.CACHE_GET_MEMO)).toBe(true)
      expect(isValidChannel(IPC_CHANNELS.SYNC_START)).toBe(true)
    })

    it('should return false for invalid channels', () => {
      expect(isValidChannel('invalid:channel')).toBe(false)
      expect(isValidChannel('')).toBe(false)
      expect(isValidChannel('window:invalid')).toBe(false)
    })
  })

  describe('getAllChannels', () => {
    it('should return all IPC channels', () => {
      const channels = getAllChannels()
      expect(channels.length).toBeGreaterThan(0)
      expect(channels).toContain(IPC_CHANNELS.WINDOW_MINIMIZE)
      expect(channels).toContain(IPC_CHANNELS.CACHE_GET_MEMO)
    })
  })

  describe('isValidAccelerator', () => {
    it('should return true for valid accelerators', () => {
      expect(isValidAccelerator('CommandOrControl+Shift+M')).toBe(true)
      expect(isValidAccelerator('Ctrl+Alt+N')).toBe(true)
      expect(isValidAccelerator('Cmd+Shift+Space')).toBe(true)
      expect(isValidAccelerator('Alt+F4')).toBe(true)
      expect(isValidAccelerator('Control+A')).toBe(true)
    })

    it('should return false for invalid accelerators', () => {
      expect(isValidAccelerator('')).toBe(false)
      expect(isValidAccelerator('Invalid')).toBe(false)
      expect(isValidAccelerator('Ctrl+')).toBe(false)
      expect(isValidAccelerator('+A')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isValidAccelerator(123 as unknown as string)).toBe(false)
      expect(isValidAccelerator(null as unknown as string)).toBe(false)
    })
  })

  describe('validateShortcutConfig', () => {
    it('should validate valid shortcut config', () => {
      const result = validateShortcutConfig({
        quickMemo: 'CommandOrControl+Shift+M',
        toggleWindow: 'CommandOrControl+Shift+N',
      })
      expect(result.valid).toBe(true)
    })

    it('should validate partial config', () => {
      const result = validateShortcutConfig({
        quickMemo: 'Ctrl+Shift+M',
      })
      expect(result.valid).toBe(true)
    })

    it('should reject invalid accelerator', () => {
      const result = validateShortcutConfig({
        quickMemo: 'invalid',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not a valid accelerator')
    })

    it('should reject non-object', () => {
      const result = validateShortcutConfig('not an object')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateCachedMemo', () => {
    it('should validate valid memo', () => {
      const result = validateCachedMemo({
        id: 'memo-123',
        title: 'Test Memo',
        content: 'Test content',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      })
      expect(result.valid).toBe(true)
    })

    it('should reject memo with missing id', () => {
      const result = validateCachedMemo({
        title: 'Test',
        content: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('id')
    })

    it('should reject memo with invalid version', () => {
      const result = validateCachedMemo({
        id: 'memo-123',
        title: 'Test',
        content: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: -1,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('version')
    })
  })

  describe('validateNotificationOptions', () => {
    it('should validate valid notification options', () => {
      const result = validateNotificationOptions({
        title: 'Test Title',
        body: 'Test body',
      })
      expect(result.valid).toBe(true)
    })

    it('should validate with optional fields', () => {
      const result = validateNotificationOptions({
        title: 'Test',
        body: 'Body',
        icon: '/path/to/icon.png',
        silent: true,
      })
      expect(result.valid).toBe(true)
    })

    it('should reject empty title', () => {
      const result = validateNotificationOptions({
        title: '',
        body: 'Body',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('title')
    })
  })

  describe('validateNotificationPreferences', () => {
    it('should validate valid preferences', () => {
      const result = validateNotificationPreferences({
        enabled: true,
        showOnShare: true,
        showOnSync: false,
        sound: true,
      })
      expect(result.valid).toBe(true)
    })

    it('should validate partial preferences', () => {
      const result = validateNotificationPreferences({
        enabled: false,
      })
      expect(result.valid).toBe(true)
    })

    it('should reject invalid boolean', () => {
      const result = validateNotificationPreferences({
        enabled: 'true',
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('validateCredentialRequest', () => {
    it('should validate valid credential request', () => {
      const result = validateCredentialRequest({
        service: 'cyp-memo',
        account: 'user@example.com',
        password: 'secret',
      })
      expect(result.valid).toBe(true)
    })

    it('should validate request without password', () => {
      const result = validateCredentialRequest({
        service: 'cyp-memo',
        account: 'user@example.com',
      })
      expect(result.valid).toBe(true)
    })

    it('should reject empty service', () => {
      const result = validateCredentialRequest({
        service: '',
        account: 'user',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Service')
    })
  })

  describe('validateConflictResolution', () => {
    it('should validate local resolution', () => {
      const result = validateConflictResolution({
        conflictId: 'conflict-123',
        choice: 'local',
      })
      expect(result.valid).toBe(true)
    })

    it('should validate remote resolution', () => {
      const result = validateConflictResolution({
        conflictId: 'conflict-123',
        choice: 'remote',
      })
      expect(result.valid).toBe(true)
    })

    it('should reject invalid choice', () => {
      const result = validateConflictResolution({
        conflictId: 'conflict-123',
        choice: 'invalid',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('choice')
    })
  })

  describe('validatePort', () => {
    it('should validate valid port', () => {
      expect(validatePort(3000).valid).toBe(true)
      expect(validatePort(8080).valid).toBe(true)
      expect(validatePort(1).valid).toBe(true)
      expect(validatePort(65535).valid).toBe(true)
    })

    it('should accept undefined port', () => {
      expect(validatePort(undefined).valid).toBe(true)
      expect(validatePort(null).valid).toBe(true)
    })

    it('should reject invalid port', () => {
      expect(validatePort(0).valid).toBe(false)
      expect(validatePort(65536).valid).toBe(false)
      expect(validatePort(-1).valid).toBe(false)
    })
  })

  describe('validateId', () => {
    it('should validate valid id', () => {
      expect(validateId('memo-123').valid).toBe(true)
      expect(validateId('a').valid).toBe(true)
    })

    it('should reject empty id', () => {
      expect(validateId('').valid).toBe(false)
    })

    it('should reject non-string', () => {
      expect(validateId(123).valid).toBe(false)
      expect(validateId(null).valid).toBe(false)
    })
  })

  describe('validateIPCMessage', () => {
    it('should validate message with valid channel and data', () => {
      const result = validateIPCMessage(IPC_CHANNELS.CACHE_GET_MEMO, 'memo-123')
      expect(result.valid).toBe(true)
    })

    it('should reject invalid channel', () => {
      const result = validateIPCMessage('invalid:channel', {})
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid IPC channel')
    })

    it('should validate channel without required data', () => {
      const result = validateIPCMessage(IPC_CHANNELS.WINDOW_MINIMIZE, undefined)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid data for channel', () => {
      const result = validateIPCMessage(IPC_CHANNELS.CACHE_SET_MEMO, { invalid: 'data' })
      expect(result.valid).toBe(false)
    })
  })
})
