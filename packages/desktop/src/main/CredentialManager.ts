/**
 * 凭证管理器
 * Manages secure credential storage using system keychain
 * Uses keytar for cross-platform secure storage:
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service API
 */

import keytar from 'keytar'

// 应用服务名称前缀
const SERVICE_PREFIX = 'cyp-memo'

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
    await keytar.setPassword(fullService, account, password)
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
    return await keytar.getPassword(fullService, account)
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
    return await keytar.deletePassword(fullService, account)
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
    return await keytar.findCredentials(fullService)
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
