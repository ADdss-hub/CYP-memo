/**
 * CYP-memo 文件数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import type { FileMetadata } from '../types'

/**
 * 文件数据访问对象
 * 提供文件元数据和 Blob 的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class FileDAO {
  /**
   * 创建文件元数据
   */
  async createMetadata(metadata: FileMetadata): Promise<string> {
    // 注意：此方法已废弃，请使用 create
    throw new Error('请使用 create 方法同时创建元数据和 Blob')
  }

  /**
   * 存储文件 Blob
   */
  async storeBlob(id: string, blob: Blob): Promise<string> {
    // 注意：此方法已废弃，请使用 create
    throw new Error('请使用 create 方法同时创建元数据和 Blob')
  }

  /**
   * 创建文件（元数据 + Blob）
   */
  async create(metadata: FileMetadata, blob: Blob): Promise<string> {
    return await getStorage().createFile(metadata, blob)
  }

  /**
   * 根据 ID 获取文件元数据
   */
  async getMetadata(id: string): Promise<FileMetadata | undefined> {
    return await getStorage().getFileById(id)
  }

  /**
   * 根据 ID 获取文件 Blob
   */
  async getBlob(id: string): Promise<Blob | undefined> {
    return await getStorage().getFileBlob(id)
  }

  /**
   * 获取用户的所有文件元数据
   */
  async getByUserId(userId: string): Promise<FileMetadata[]> {
    return await getStorage().getFilesByUserId(userId)
  }

  /**
   * 获取备忘录的所有附件
   */
  async getByMemoId(memoId: string): Promise<FileMetadata[]> {
    return await getStorage().getFilesByMemoId(memoId)
  }

  /**
   * 获取所有文件元数据
   */
  async getAll(): Promise<FileMetadata[]> {
    // 注意：此方法需要管理员权限，实际使用时需要遍历所有用户
    throw new Error('getAll 方法不支持，请使用 getByUserId')
  }

  /**
   * 更新文件元数据
   */
  async updateMetadata(id: string, updates: Partial<FileMetadata>): Promise<number> {
    return await getStorage().updateFile(id, updates)
  }

  /**
   * 删除文件（元数据 + Blob）
   */
  async delete(id: string): Promise<void> {
    await getStorage().deleteFile(id)
  }

  /**
   * 批量删除文件
   */
  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.delete(id)
    }
  }

  /**
   * 获取用户的存储使用量
   */
  async getUserStorageUsage(userId: string): Promise<number> {
    return await getStorage().getStorageUsed(userId)
  }

  /**
   * 获取未关联备忘录的文件（孤立文件）
   */
  async getOrphanedFiles(): Promise<FileMetadata[]> {
    // 注意：此方法需要遍历所有文件，性能较差
    throw new Error('getOrphanedFiles 方法不支持')
  }

  /**
   * 按文件类型筛选
   */
  async getByType(userId: string, type: string): Promise<FileMetadata[]> {
    const files = await this.getByUserId(userId)
    return files.filter((file) => file.type.startsWith(type))
  }

  /**
   * 按上传时间排序获取文件
   */
  async getByUploadTime(userId: string, ascending = false): Promise<FileMetadata[]> {
    const files = await this.getByUserId(userId)
    return files.sort((a, b) => {
      // 确保日期对象正确转换，处理字符串或Date类型
      const timeA = new Date(a.uploadedAt).getTime()
      const timeB = new Date(b.uploadedAt).getTime()
      return ascending ? timeA - timeB : timeB - timeA
    })
  }
}

/**
 * FileDAO 单例实例
 */
export const fileDAO = new FileDAO()
