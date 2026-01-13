/**
 * 凭证管理器
 * Manages secure credential storage using system keychain
 * Uses keytar for cross-platform secure storage:
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service API
 * 
 * 如果 keytar 不可用，降级为文件存储（开发模式）
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// 应用服务名称前缀
const SERVICE_PREFIX = 'cyp-memo'

// 尝试加载 keytar
let keytar: typeof import('keytar') | null = null
try {
  keytar = require('keytar')
} catch {
  console.warn('[CredentialManager] keytar not available, using fallback file storage')
}

/**
 * 文件存储降级方案
 */
class FileCredentialStore {
  private filePath: string
  private encryptionKey: Buffer

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, '.credentials')
    // 使用机器 ID 作为加密密钥的一部分
    this.encryptionKey = crypto.scryptSync(
      process.env.COMPUTERNAME || 'default-key',
      'cyp-memo-salt',
      32
    )
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  private decrypt(text: string): string {
    const [ivHex, encrypted] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  private loadStore(): Record<string, Record<string, string>> {
    try {
      if (fs.existsSync(this.filePath)) {
        const encrypted = fs.readFileSync(this.filePath, 'utf8')
        const decrypted = this.decrypt(encrypted)
        return JSON.parse(decrypted)
      }
    } catch {
      // 文件损坏或解密失败，返回空存储
    }
    return {}
  }

  private saveStore(store: Record<string, Record<string, string>>): void {
    const json = JSON.stringify(store)
    const encrypted = this.encrypt(json)
    fs.writeFileSync(this.filePath, encrypted, 'utf8')
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    const store = this.loadStore()
    if (!store[service]) {
      store[service] = {}
    }
    store[service][account] = password
    this.saveStore(store)
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    const store = this.loadStore()
    return store[service]?.[account] || null
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const store = this.loadStore()
    if (store[service]?.[account]) {
      delete store[service][account]
      this.saveStore(store)
      return true
    }
    return false
  }

  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    const store = this.loadStore()
    const serviceStore = store[service] || {}
    return Object.entries(serviceStore).map(([account, password]) => ({
      account,
      password
    }))
  }
}

// 创建降级存储实例
const fallbackStore = new FileCredentialStore()

/**
 * 凭证管理器类
 * Provides secure credential storage using the system's native credential store
 */
export class CredentialManager {
  private servicePrefix: string

  constructor(servicePrefix: string = SERVICE_PREFIX) {
    this.servicePrefix = servicePrefix
  }

  /**
   * 获取完整的服务名称
   * @param service - 服务标识
   * @returns 带前缀的完整服务名称
   */
  private getFullServiceName(service: string): string {
    return `${this.servicePrefix}:${service}`
  }

  /**
   * 存储凭证到系统安全存储
   * @param service - 服务标识
   * @param account - 账户名
   * @param password - 密码/凭证
   */
  async setCredential(service: string, account: string, password: string): Promise<void> {
    if (!service || !account) {
      throw new Error('Service and account are required')
    }
    if (password === undefined || password === null) {
      throw new Error('Password is required')
    }
    
    const fullService = this.getFullServiceName(service)
    if (keytar) {
      await keytar.setPassword(fullService, account, password)
    } else {
      await fallbackStore.setPassword(fullService, account, password)
    }
  }

  /**
   * 从系统安全存储获取凭证
   * @param service - 服务标识
   * @param account - 账户名
   * @returns 密码/凭证，如果不存在则返回 null
   */
  async getCredential(service: string, account: string): Promise<string | null> {
    if (!service || !account) {
      throw new Error('Service and account are required')
    }
    
    const fullService = this.getFullServiceName(service)
    if (keytar) {
      return await keytar.getPassword(fullService, account)
    } else {
      return await fallbackStore.getPassword(fullService, account)
    }
  }

  /**
   * 从系统安全存储删除凭证
   * @param service - 服务标识
   * @param account - 账户名
   * @returns 是否成功删除
   */
  async deleteCredential(service: string, account: string): Promise<boolean> {
    if (!service || !account) {
      throw new Error('Service and account are required')
    }
    
    const fullService = this.getFullServiceName(service)
    if (keytar) {
      return await keytar.deletePassword(fullService, account)
    } else {
      return await fallbackStore.deletePassword(fullService, account)
    }
  }

  /**
   * 检查凭证是否存在
   * @param service - 服务标识
   * @param account - 账户名
   * @returns 凭证是否存在
   */
  async hasCredential(service: string, account: string): Promise<boolean> {
    const credential = await this.getCredential(service, account)
    return credential !== null
  }

  /**
   * 获取指定服务的所有凭证
   * @param service - 服务标识
   * @returns 凭证列表，包含账户名和密码
   */
  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    if (!service) {
      throw new Error('Service is required')
    }
    
    const fullService = this.getFullServiceName(service)
    if (keytar) {
      return await keytar.findCredentials(fullService)
    } else {
      return await fallbackStore.findCredentials(fullService)
    }
  }

  /**
   * 清除指定服务的所有凭证
   * @param service - 服务标识
   * @returns 删除的凭证数量
   */
  async clearServiceCredentials(service: string): Promise<number> {
    const credentials = await this.findCredentials(service)
    let deletedCount = 0
    
    for (const cred of credentials) {
      const deleted = await this.deleteCredential(service, cred.account)
      if (deleted) {
        deletedCount++
      }
    }
    
    return deletedCount
  }
}

// 导出单例
export const credentialManager = new CredentialManager()
