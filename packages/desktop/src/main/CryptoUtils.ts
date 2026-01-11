/**
 * 加密工具模块
 * Encryption utilities for local cache data
 * 
 * 实现 AES-256 加密/解密和密钥派生
 * Implements AES-256 encryption/decryption and key derivation
 * 
 * 需求: 9.2 - 桌面客户端应使用 AES-256 加密所有本地缓存数据
 */

import * as crypto from 'crypto'

// 加密算法常量
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits
const SALT_LENGTH = 32 // 256 bits
const PBKDF2_ITERATIONS = 100000

/**
 * 加密结果接口
 */
export interface EncryptedData {
  /** 初始化向量 (Base64) */
  iv: string
  /** 加密后的数据 (Base64) */
  data: string
  /** 认证标签 (Base64) */
  authTag: string
}

/**
 * 派生密钥结果接口
 */
export interface DerivedKey {
  /** 派生的密钥 (Buffer) */
  key: Buffer
  /** 使用的盐 (Base64) */
  salt: string
}

/**
 * 从密码派生加密密钥
 * Derive encryption key from password using PBKDF2
 * 
 * @param password - 用户密码或主密钥
 * @param salt - 可选的盐值 (Base64)，如果不提供则生成新的
 * @returns 派生的密钥和盐
 */
export function deriveKey(password: string, salt?: string): DerivedKey {
  const saltBuffer = salt 
    ? Buffer.from(salt, 'base64') 
    : crypto.randomBytes(SALT_LENGTH)
  
  const key = crypto.pbkdf2Sync(
    password,
    saltBuffer,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  )
  
  return {
    key,
    salt: saltBuffer.toString('base64')
  }
}

/**
 * 使用 AES-256-GCM 加密数据
 * Encrypt data using AES-256-GCM
 * 
 * @param plaintext - 要加密的明文数据
 * @param key - 加密密钥 (32 bytes)
 * @returns 加密结果，包含 IV、密文和认证标签
 * @throws Error 如果密钥长度不正确
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length} bytes`)
  }
  
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  const authTag = cipher.getAuthTag()
  
  return {
    iv: iv.toString('base64'),
    data: encrypted,
    authTag: authTag.toString('base64')
  }
}

/**
 * 使用 AES-256-GCM 解密数据
 * Decrypt data using AES-256-GCM
 * 
 * @param encryptedData - 加密数据对象
 * @param key - 解密密钥 (32 bytes)
 * @returns 解密后的明文
 * @throws Error 如果密钥长度不正确或解密失败
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length} bytes`)
  }
  
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const authTag = Buffer.from(encryptedData.authTag, 'base64')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * 加密 JSON 对象
 * Encrypt a JSON object
 * 
 * @param data - 要加密的对象
 * @param key - 加密密钥
 * @returns 加密结果
 */
export function encryptObject<T>(data: T, key: Buffer): EncryptedData {
  const jsonString = JSON.stringify(data)
  return encrypt(jsonString, key)
}

/**
 * 解密 JSON 对象
 * Decrypt a JSON object
 * 
 * @param encryptedData - 加密数据
 * @param key - 解密密钥
 * @returns 解密后的对象
 */
export function decryptObject<T>(encryptedData: EncryptedData, key: Buffer): T {
  const jsonString = decrypt(encryptedData, key)
  return JSON.parse(jsonString) as T
}

/**
 * 生成随机加密密钥
 * Generate a random encryption key
 * 
 * @returns 32 字节的随机密钥
 */
export function generateKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH)
}

/**
 * 将密钥转换为 Base64 字符串
 * Convert key to Base64 string for storage
 * 
 * @param key - 密钥 Buffer
 * @returns Base64 编码的密钥
 */
export function keyToString(key: Buffer): string {
  return key.toString('base64')
}

/**
 * 从 Base64 字符串恢复密钥
 * Restore key from Base64 string
 * 
 * @param keyString - Base64 编码的密钥
 * @returns 密钥 Buffer
 */
export function stringToKey(keyString: string): Buffer {
  return Buffer.from(keyString, 'base64')
}

/**
 * 验证加密数据格式是否有效
 * Validate encrypted data format
 * 
 * @param data - 要验证的数据
 * @returns 是否为有效的加密数据格式
 */
export function isValidEncryptedData(data: unknown): data is EncryptedData {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  
  const obj = data as Record<string, unknown>
  
  return (
    typeof obj.iv === 'string' &&
    typeof obj.data === 'string' &&
    typeof obj.authTag === 'string' &&
    obj.iv.length > 0 &&
    obj.data.length > 0 &&
    obj.authTag.length > 0
  )
}
