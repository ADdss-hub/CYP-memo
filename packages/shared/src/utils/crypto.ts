/**
 * CYP-memo 加密工具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

// 动态导入 bcryptjs，仅在非浏览器环境中使用
let bcrypt: any = null

// 检查是否在浏览器环境中
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

// 如果不在浏览器环境中，导入 bcryptjs
if (!isBrowser) {
  try {
    bcrypt = require('bcryptjs')
  } catch (e) {
    // bcryptjs 不可用
  }
}

/**
 * 密码哈希函数
 * 使用 bcrypt 算法对密码进行哈希处理
 * 在浏览器环境中使用 Web Crypto API 的替代方案
 * @param password 原始密码
 * @returns Promise<string> 哈希后的密码
 */
export async function hashPassword(password: string): Promise<string> {
  // 在浏览器环境中，使用 Web Crypto API 生成密码哈希
  if (isBrowser) {
    return await hashPasswordBrowser(password)
  }

  // 在 Node.js 环境中，使用 bcryptjs
  if (bcrypt) {
    const saltRounds = 8
    try {
      const hash = await bcrypt.hash(password, saltRounds)
      return hash
    } catch (error) {
      throw new Error(`密码哈希失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 如果 bcryptjs 不可用，使用浏览器 API
  return await hashPasswordBrowser(password)
}

/**
 * 浏览器环境中的密码哈希函数
 * 使用 Web Crypto API 和 PBKDF2 算法
 * @param password 原始密码
 * @returns Promise<string> 哈希后的密码（Base64 编码）
 */
async function hashPasswordBrowser(password: string): Promise<string> {
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

  // 转换为 Base64 字符串
  return btoa(String.fromCharCode(...combined))
}

/**
 * 验证密码
 * 比较原始密码和哈希密码是否匹配
 * @param password 原始密码
 * @param hash 哈希密码
 * @returns Promise<boolean> 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 在浏览器环境中，使用 Web Crypto API 验证
  if (isBrowser) {
    return await verifyPasswordBrowser(password, hash)
  }

  // 在 Node.js 环境中，使用 bcryptjs
  if (bcrypt) {
    try {
      return await bcrypt.compare(password, hash)
    } catch (error) {
      return false
    }
  }

  // 如果 bcryptjs 不可用，使用浏览器 API
  return await verifyPasswordBrowser(password, hash)
}

/**
 * 浏览器环境中的密码验证函数
 * @param password 原始密码
 * @param hash 哈希密码（Base64 编码）
 * @returns Promise<boolean> 是否匹配
 */
async function verifyPasswordBrowser(password: string, hash: string): Promise<boolean> {
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
    return false
  }
}

/**
 * 生成加密安全的个人令牌
 * 使用 Web Crypto API 生成随机令牌
 * @returns string 生成的令牌（十六进制格式）
 */
export function generateToken(): string {
  // 生成 32 字节（256 位）的随机数据
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)

  // 转换为十六进制字符串
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成 UUID v4
 * 使用 Web Crypto API 生成随机 UUID
 * @returns string 生成的 UUID
 */
export function generateUUID(): string {
  // 使用 crypto.randomUUID() 如果可用，否则手动生成
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

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
