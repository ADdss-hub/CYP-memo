/**
 * CYP-memo 加密工具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

// 动态导入 bcryptjs，仅在非浏览器环境中使用
let bcrypt: any = null

// 检查是否在浏览器环境中
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

// 检查 Web Crypto API 是否可用
const isWebCryptoAvailable = typeof crypto !== 'undefined' && 
  typeof crypto.subtle !== 'undefined' && 
  typeof crypto.subtle.importKey === 'function'

// 如果不在浏览器环境中，导入 bcryptjs
if (!isBrowser) {
  try {
    bcrypt = require('bcryptjs')
  } catch (e) {
    // bcryptjs 不可用
    console.warn('bcryptjs 不可用，将使用备用方案')
  }
}

/**
 * 将字符串编码为 Base64（支持 Unicode 字符）
 * 解决 btoa() 无法处理非 Latin1 字符的问题
 * @param str 要编码的字符串
 * @returns Base64 编码的字符串
 */
function encodeBase64(str: string): string {
  // 使用 TextEncoder 将字符串转换为 UTF-8 字节数组
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  // 将字节数组转换为二进制字符串，然后使用 btoa 编码
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 将 Uint8Array 编码为 Base64
 * @param bytes 字节数组
 * @returns Base64 编码的字符串
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 简单的密码哈希函数（备用方案）
 * 当 Web Crypto API 和 bcryptjs 都不可用时使用
 * 注意：这不是安全的哈希方案，仅作为最后的备用
 */
async function hashPasswordFallback(password: string): Promise<string> {
  // 使用简单的 SHA-256 哈希（如果可用）
  if (typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined') {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(password)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = new Uint8Array(hashBuffer)
      return 'sha256:' + Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('')
    } catch (e) {
      // SHA-256 也不可用
    }
  }
  
  // 最后的备用方案：Base64 编码（不安全，仅用于开发/测试）
  // 使用 encodeBase64 支持 Unicode 字符（如中文用户名/密码）
  console.warn('警告：使用不安全的密码存储方案，请确保 bcryptjs 或 Web Crypto API 可用')
  return 'base64:' + encodeBase64(password)
}

/**
 * 简单的密码验证函数（备用方案）
 */
async function verifyPasswordFallback(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('sha256:')) {
    const newHash = await hashPasswordFallback(password)
    return newHash === hash
  }
  if (hash.startsWith('base64:')) {
    // 使用 encodeBase64 支持 Unicode 字符
    return hash === 'base64:' + encodeBase64(password)
  }
  return false
}

/**
 * 密码哈希函数
 * 使用 bcrypt 算法对密码进行哈希处理
 * 在浏览器环境中使用 Web Crypto API 的替代方案
 * @param password 原始密码
 * @returns Promise<string> 哈希后的密码
 */
export async function hashPassword(password: string): Promise<string> {
  // 在 Node.js 环境中，优先使用 bcryptjs
  if (!isBrowser && bcrypt) {
    const saltRounds = 8
    try {
      const hash = await bcrypt.hash(password, saltRounds)
      return hash
    } catch (error) {
      console.error('bcryptjs 哈希失败，尝试备用方案:', error)
    }
  }

  // 在浏览器环境中，检查 Web Crypto API 是否可用
  if (isBrowser && isWebCryptoAvailable) {
    try {
      return await hashPasswordBrowser(password)
    } catch (error) {
      console.error('Web Crypto API 哈希失败，尝试备用方案:', error)
    }
  }

  // 使用备用方案
  return await hashPasswordFallback(password)
}

/**
 * 浏览器环境中的密码哈希函数
 * 使用 Web Crypto API 和 PBKDF2 算法
 * @param password 原始密码
 * @returns Promise<string> 哈希后的密码（Base64 编码）
 */
async function hashPasswordBrowser(password: string): Promise<string> {
  // 检查 Web Crypto API 是否可用
  if (!isWebCryptoAvailable) {
    throw new Error('Web Crypto API 不可用')
  }

  // 生成随机盐（16 字节）
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 使用 PBKDF2 进行密码哈希
  const encoder = new TextEncoder()
  const data = encoder.encode(password)

  const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits'])

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256
  )

  // 将盐和派生密钥组合
  const hashArray = new Uint8Array(derivedBits)
  const combined = new Uint8Array(salt.length + hashArray.length)
  combined.set(salt)
  combined.set(hashArray, salt.length)

  // 转换为 Base64 字符串（使用 uint8ArrayToBase64 确保兼容性）
  return uint8ArrayToBase64(combined)
}

/**
 * 验证密码
 * 比较原始密码和哈希密码是否匹配
 * @param password 原始密码
 * @param hash 哈希密码
 * @returns Promise<boolean> 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 检查是否是备用方案的哈希
  if (hash.startsWith('sha256:') || hash.startsWith('base64:')) {
    return await verifyPasswordFallback(password, hash)
  }

  // 在 Node.js 环境中，优先使用 bcryptjs
  if (!isBrowser && bcrypt) {
    try {
      return await bcrypt.compare(password, hash)
    } catch (error) {
      console.error('bcryptjs 验证失败，尝试其他方案:', error)
    }
  }

  // 在浏览器环境中，检查 Web Crypto API 是否可用
  if (isBrowser && isWebCryptoAvailable) {
    try {
      return await verifyPasswordBrowser(password, hash)
    } catch (error) {
      console.error('Web Crypto API 验证失败:', error)
    }
  }

  // 尝试使用浏览器 API 验证（可能是 PBKDF2 哈希）
  if (isWebCryptoAvailable) {
    try {
      return await verifyPasswordBrowser(password, hash)
    } catch (error) {
      // 验证失败
    }
  }

  return false
}

/**
 * 浏览器环境中的密码验证函数
 * @param password 原始密码
 * @param hash 哈希密码（Base64 编码）
 * @returns Promise<boolean> 是否匹配
 */
async function verifyPasswordBrowser(password: string, hash: string): Promise<boolean> {
  // 检查 Web Crypto API 是否可用
  if (!isWebCryptoAvailable) {
    throw new Error('Web Crypto API 不可用')
  }

  try {
    // 解码 Base64 哈希
    const combined = new Uint8Array(atob(hash).split('').map((c) => c.charCodeAt(0)))

    // 提取盐（前 16 字节）
    const salt = combined.slice(0, 16)
    const storedHash = combined.slice(16)

    // 使用相同的盐重新哈希密码
    const encoder = new TextEncoder()
    const data = encoder.encode(password)

    const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits'])

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    )

    const derivedHash = new Uint8Array(derivedBits)

    // 比较哈希值
    return (
      storedHash.length === derivedHash.length &&
      storedHash.every((byte, index) => byte === derivedHash[index])
    )
  } catch (error) {
    console.error('密码验证失败:', error)
    return false
  }
}

/**
 * 生成加密安全的个人令牌
 * 使用 Web Crypto API 生成随机令牌
 * @returns string 生成的令牌（十六进制格式）
 */
export function generateToken(): string {
  // 检查 crypto.getRandomValues 是否可用
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // 生成 32 字节（256 位）的随机数据
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)

    // 转换为十六进制字符串
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  // 备用方案：使用 Math.random（不安全，仅用于开发/测试）
  console.warn('警告：crypto.getRandomValues 不可用，使用不安全的随机数生成')
  let token = ''
  for (let i = 0; i < 64; i++) {
    token += Math.floor(Math.random() * 16).toString(16)
  }
  return token
}

/**
 * 生成 UUID v4
 * 使用 Web Crypto API 生成随机 UUID
 * @returns string 生成的 UUID
 */
export function generateUUID(): string {
  // 使用 crypto.randomUUID() 如果可用
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch (e) {
      // randomUUID 调用失败，使用备用方案
    }
  }

  // 检查 crypto.getRandomValues 是否可用
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // 手动生成 UUID v4
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)

    // 设置版本为 4 和变体为 RFC 4122
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80

    // 转换为 UUID 字符串格式
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // 备用方案：使用 Math.random（不安全，仅用于开发/测试）
  console.warn('警告：crypto API 不可用，使用不安全的 UUID 生成')
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 验证令牌格式
 * 检查令牌是否为有效的十六进制字符串且长度正确
 * @param token 待验证的令牌
 * @returns boolean 令牌格式是否有效
 */
export function validateToken(token: string): boolean {
  // 令牌应该是 64 个十六进制字符（32 字节）
  const tokenRegex = /^[0-9a-f]{64}$/i
  return tokenRegex.test(token)
}
