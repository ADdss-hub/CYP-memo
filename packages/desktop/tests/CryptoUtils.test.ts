/**
 * 加密工具测试
 * Tests for CryptoUtils
 */

import { describe, it, expect } from 'vitest'
import {
  deriveKey,
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  generateKey,
  keyToString,
  stringToKey,
  isValidEncryptedData,
  type EncryptedData
} from '../src/main/CryptoUtils'

describe('CryptoUtils', () => {
  describe('deriveKey', () => {
    it('should derive a 32-byte key from password', () => {
      const result = deriveKey('test-password')
      
      expect(result.key).toBeInstanceOf(Buffer)
      expect(result.key.length).toBe(32)
      expect(result.salt).toBeDefined()
      expect(typeof result.salt).toBe('string')
    })

    it('should derive the same key with the same password and salt', () => {
      const result1 = deriveKey('test-password')
      const result2 = deriveKey('test-password', result1.salt)
      
      expect(result2.key.equals(result1.key)).toBe(true)
    })

    it('should derive different keys with different passwords', () => {
      const result1 = deriveKey('password1')
      const result2 = deriveKey('password2', result1.salt)
      
      expect(result2.key.equals(result1.key)).toBe(false)
    })

    it('should derive different keys with different salts', () => {
      const result1 = deriveKey('test-password')
      const result2 = deriveKey('test-password')
      
      // Different salts should produce different keys
      expect(result2.key.equals(result1.key)).toBe(false)
    })
  })

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const key = generateKey()
      const plaintext = 'Hello, World!'
      
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt unicode text', () => {
      const key = generateKey()
      const plaintext = '你好，世界！🌍'
      
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt empty string', () => {
      const key = generateKey()
      const plaintext = ''
      
      const encrypted = encrypt(plaintext, key)
      const decrypted = decrypt(encrypted, key)
      
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertext for same plaintext', () => {
      const key = generateKey()
      const plaintext = 'Same text'
      
      const encrypted1 = encrypt(plaintext, key)
      const encrypted2 = encrypt(plaintext, key)
      
      // Different IVs should produce different ciphertext
      expect(encrypted1.data).not.toBe(encrypted2.data)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
    })

    it('should throw error with invalid key length', () => {
      const invalidKey = Buffer.from('short')
      const plaintext = 'test'
      
      expect(() => encrypt(plaintext, invalidKey)).toThrow('Invalid key length')
    })

    it('should fail decryption with wrong key', () => {
      const key1 = generateKey()
      const key2 = generateKey()
      const plaintext = 'Secret message'
      
      const encrypted = encrypt(plaintext, key1)
      
      expect(() => decrypt(encrypted, key2)).toThrow()
    })

    it('should fail decryption with tampered data', () => {
      const key = generateKey()
      const plaintext = 'Secret message'
      
      const encrypted = encrypt(plaintext, key)
      
      // Tamper with the encrypted data
      const tamperedData: EncryptedData = {
        ...encrypted,
        data: encrypted.data.slice(0, -4) + 'XXXX'
      }
      
      expect(() => decrypt(tamperedData, key)).toThrow()
    })
  })

  describe('encryptObject/decryptObject', () => {
    it('should encrypt and decrypt objects correctly', () => {
      const key = generateKey()
      const obj = {
        id: '123',
        title: 'Test Memo',
        content: 'This is a test',
        tags: ['tag1', 'tag2'],
        nested: { value: 42 }
      }
      
      const encrypted = encryptObject(obj, key)
      const decrypted = decryptObject(encrypted, key)
      
      expect(decrypted).toEqual(obj)
    })

    it('should handle arrays', () => {
      const key = generateKey()
      const arr = [1, 2, 3, 'test', { nested: true }]
      
      const encrypted = encryptObject(arr, key)
      const decrypted = decryptObject(encrypted, key)
      
      expect(decrypted).toEqual(arr)
    })
  })

  describe('generateKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateKey()
      
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
    })

    it('should generate unique keys', () => {
      const key1 = generateKey()
      const key2 = generateKey()
      
      expect(key1.equals(key2)).toBe(false)
    })
  })

  describe('keyToString/stringToKey', () => {
    it('should convert key to string and back', () => {
      const originalKey = generateKey()
      
      const keyString = keyToString(originalKey)
      const restoredKey = stringToKey(keyString)
      
      expect(restoredKey.equals(originalKey)).toBe(true)
    })

    it('should produce valid Base64 string', () => {
      const key = generateKey()
      const keyString = keyToString(key)
      
      // Base64 pattern
      expect(keyString).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })
  })

  describe('isValidEncryptedData', () => {
    it('should return true for valid encrypted data', () => {
      const key = generateKey()
      const encrypted = encrypt('test', key)
      
      expect(isValidEncryptedData(encrypted)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isValidEncryptedData(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidEncryptedData(undefined)).toBe(false)
    })

    it('should return false for non-object', () => {
      expect(isValidEncryptedData('string')).toBe(false)
      expect(isValidEncryptedData(123)).toBe(false)
    })

    it('should return false for missing fields', () => {
      expect(isValidEncryptedData({ iv: 'test' })).toBe(false)
      expect(isValidEncryptedData({ iv: 'test', data: 'test' })).toBe(false)
    })

    it('should return false for empty fields', () => {
      expect(isValidEncryptedData({ iv: '', data: 'test', authTag: 'test' })).toBe(false)
    })
  })
})
