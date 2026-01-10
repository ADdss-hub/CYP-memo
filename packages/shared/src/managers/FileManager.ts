/**
 * CYP-memo 文件管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { fileDAO } from '../database/FileDAO'
import { memoDAO } from '../database/MemoDAO'
import { validateFileSize } from '../utils/validation'
import { logManager } from './LogManager'
import { generateUUID } from '../utils/crypto'
import type { FileMetadata, StorageInfo } from '../types'

/**
 * 文件管理器
 * 负责文件上传、删除、获取和存储管理
 */
export class FileManager {
  /**
   * 上传文件
   * @param userId 用户 ID
   * @param file 文件对象
   * @param memoId 关联的备忘录 ID（可选）
   * @returns Promise<FileMetadata> 文件元数据
   * @throws Error 上传失败时抛出错误
   */
  async uploadFile(userId: string, file: File, memoId?: string): Promise<FileMetadata> {
    // 验证文件大小
    if (!validateFileSize(file.size)) {
      throw new Error('文件大小超过限制（最大 10GB）')
    }

    // 处理图片压缩
    let fileBlob: Blob = file
    if (file.type.startsWith('image/')) {
      try {
        fileBlob = await this.compressImage(file)
      } catch (error) {
        // 如果压缩失败，使用原始文件
        await logManager.warn('图片压缩失败，使用原始文件', {
          userId,
          filename: file.name,
          error: error instanceof Error ? error.message : String(error),
          action: 'image_compress_failed',
        })
        fileBlob = file
      }
    }

    // 创建文件元数据
    const metadata: FileMetadata = {
      id: generateUUID(),
      userId,
      filename: file.name,
      size: fileBlob.size,
      type: file.type,
      memoId,
      uploadedAt: new Date(),
    }

    // 保存文件到数据库
    await fileDAO.create(metadata, fileBlob)

    // 记录日志
    await logManager.info('文件上传成功', {
      userId,
      fileId: metadata.id,
      filename: file.name,
      size: fileBlob.size,
      type: file.type,
      memoId,
      action: 'file_upload',
    })

    return metadata
  }

  /**
   * 删除文件
   * @param fileId 文件 ID
   * @throws Error 删除失败时抛出错误
   */
  async deleteFile(fileId: string): Promise<void> {
    // 获取文件元数据
    const metadata = await fileDAO.getMetadata(fileId)
    if (!metadata) {
      throw new Error('文件不存在')
    }

    // 如果文件关联了备忘录，从备忘录的附件列表中移除
    if (metadata.memoId) {
      try {
        const memo = await memoDAO.getById(metadata.memoId)
        if (memo && memo.attachments) {
          const updatedAttachments = memo.attachments.filter(id => id !== fileId)
          await memoDAO.update(metadata.memoId, { attachments: updatedAttachments })
        }
      } catch (err) {
        // 如果更新备忘录失败，记录警告但继续删除文件
        await logManager.warn('更新备忘录附件列表失败', {
          fileId,
          memoId: metadata.memoId,
          error: err instanceof Error ? err.message : String(err),
          action: 'memo_attachment_update_failed',
        })
      }
    }

    // 删除文件
    await fileDAO.delete(fileId)

    // 记录日志
    await logManager.info('文件删除成功', {
      userId: metadata.userId,
      fileId,
      filename: metadata.filename,
      memoId: metadata.memoId,
      action: 'file_delete',
    })
  }

  /**
   * 获取文件
   * @param fileId 文件 ID
   * @returns Promise<Blob> 文件 Blob
   * @throws Error 获取失败时抛出错误
   */
  async getFile(fileId: string): Promise<Blob> {
    const blob = await fileDAO.getBlob(fileId)
    if (!blob) {
      throw new Error('文件不存在')
    }
    return blob
  }

  /**
   * 获取文件元数据
   * @param fileId 文件 ID
   * @returns Promise<FileMetadata> 文件元数据
   * @throws Error 获取失败时抛出错误
   */
  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const metadata = await fileDAO.getMetadata(fileId)
    if (!metadata) {
      throw new Error('文件不存在')
    }
    return metadata
  }

  /**
   * 获取所有文件
   * @param userId 用户 ID
   * @returns Promise<FileMetadata[]> 文件元数据列表
   */
  async getAllFiles(userId: string): Promise<FileMetadata[]> {
    return await fileDAO.getByUserId(userId)
  }

  /**
   * 批量删除文件
   * @param fileIds 文件 ID 数组
   */
  async deleteFiles(fileIds: string[]): Promise<void> {
    // 获取所有文件元数据用于日志记录和更新备忘录
    const metadataList = await Promise.all(fileIds.map((id) => fileDAO.getMetadata(id)))
    const validMetadata = metadataList.filter((m) => m !== undefined)

    // 收集需要更新的备忘录
    const memoUpdates = new Map<string, string[]>() // memoId -> fileIds to remove
    for (const metadata of validMetadata) {
      if (metadata && metadata.memoId) {
        const existing = memoUpdates.get(metadata.memoId) || []
        existing.push(metadata.id)
        memoUpdates.set(metadata.memoId, existing)
      }
    }

    // 更新备忘录的附件列表
    for (const [memoId, fileIdsToRemove] of memoUpdates) {
      try {
        const memo = await memoDAO.getById(memoId)
        if (memo && memo.attachments) {
          const updatedAttachments = memo.attachments.filter(id => !fileIdsToRemove.includes(id))
          await memoDAO.update(memoId, { attachments: updatedAttachments })
        }
      } catch (err) {
        await logManager.warn('批量删除时更新备忘录附件列表失败', {
          memoId,
          fileIds: fileIdsToRemove,
          error: err instanceof Error ? err.message : String(err),
          action: 'memo_attachment_update_failed',
        })
      }
    }

    // 批量删除文件
    await fileDAO.bulkDelete(fileIds)

    // 记录日志
    await logManager.info('批量删除文件成功', {
      count: fileIds.length,
      fileIds,
      filenames: validMetadata.map((m) => m!.filename),
      action: 'file_bulk_delete',
    })
  }

  /**
   * 获取存储使用情况
   * @param userId 用户 ID
   * @returns Promise<StorageInfo> 存储信息
   */
  async getStorageUsage(userId: string): Promise<StorageInfo> {
    // 计算用户已使用的存储空间
    const used = await fileDAO.getUserStorageUsage(userId)

    // IndexedDB 的总容量取决于浏览器和设备
    // 通常是可用磁盘空间的一定比例
    // 这里我们使用 navigator.storage API 获取配额信息
    let total = 0
    let available = 0

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        total = estimate.quota || 0
        available = (estimate.quota || 0) - (estimate.usage || 0)
      } catch (error) {
        // 如果获取失败，使用默认值
        await logManager.warn('获取存储配额失败', {
          userId,
          error: error instanceof Error ? error.message : String(error),
          action: 'storage_estimate_failed',
        })
      }
    }

    return {
      used,
      total,
      available,
    }
  }

  /**
   * 压缩图片
   * @param file 图片文件
   * @param maxWidth 最大宽度，默认 1920
   * @param maxHeight 最大高度，默认 1080
   * @param quality 压缩质量，默认 0.8
   * @returns Promise<Blob> 压缩后的图片 Blob
   */
  async compressImage(
    file: File,
    maxWidth: number = 1920,
    maxHeight: number = 1080,
    quality: number = 0.8
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // 创建图片对象
      const img = new Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      reader.onerror = () => {
        reject(new Error('读取图片文件失败'))
      }

      img.onload = () => {
        // 计算缩放比例
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.floor(width * ratio)
          height = Math.floor(height * ratio)
        }

        // 创建 canvas 进行压缩
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建 canvas 上下文'))
          return
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height)

        // 转换为 Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // 如果压缩后的文件更大，使用原始文件
              if (blob.size >= file.size) {
                resolve(file)
              } else {
                resolve(blob)
              }
            } else {
              reject(new Error('图片压缩失败'))
            }
          },
          file.type,
          quality
        )
      }

      img.onerror = () => {
        reject(new Error('加载图片失败'))
      }

      // 读取文件
      reader.readAsDataURL(file)
    })
  }

  /**
   * 获取备忘录的所有附件
   * @param memoId 备忘录 ID
   * @returns Promise<FileMetadata[]> 附件列表
   */
  async getMemoAttachments(memoId: string): Promise<FileMetadata[]> {
    return await fileDAO.getByMemoId(memoId)
  }

  /**
   * 按文件类型筛选
   * @param userId 用户 ID
   * @param type 文件类型（如 'image', 'text', 'application'）
   * @returns Promise<FileMetadata[]> 文件列表
   */
  async getFilesByType(userId: string, type: string): Promise<FileMetadata[]> {
    return await fileDAO.getByType(userId, type)
  }

  /**
   * 按上传时间排序获取文件
   * @param userId 用户 ID
   * @param ascending 是否升序，默认 false（降序）
   * @returns Promise<FileMetadata[]> 文件列表
   */
  async getFilesByUploadTime(userId: string, ascending: boolean = false): Promise<FileMetadata[]> {
    return await fileDAO.getByUploadTime(userId, ascending)
  }

  /**
   * 获取孤立文件（未关联备忘录的文件）
   * @returns Promise<FileMetadata[]> 孤立文件列表
   */
  async getOrphanedFiles(): Promise<FileMetadata[]> {
    return await fileDAO.getOrphanedFiles()
  }

  /**
   * 清理孤立文件
   * @returns Promise<number> 清理的文件数量
   */
  async cleanOrphanedFiles(): Promise<number> {
    const orphanedFiles = await this.getOrphanedFiles()

    if (orphanedFiles.length === 0) {
      return 0
    }

    const fileIds = orphanedFiles.map((f) => f.id)
    await fileDAO.bulkDelete(fileIds)

    // 记录日志
    await logManager.info('清理孤立文件成功', {
      count: orphanedFiles.length,
      fileIds,
      action: 'orphaned_files_cleanup',
    })

    return orphanedFiles.length
  }

  /**
   * 更新文件关联的备忘录
   * @param fileId 文件 ID
   * @param memoId 备忘录 ID
   */
  async updateFileMemo(fileId: string, memoId: string): Promise<void> {
    const metadata = await fileDAO.getMetadata(fileId)
    if (!metadata) {
      throw new Error('文件不存在')
    }

    await fileDAO.updateMetadata(fileId, { memoId })

    // 记录日志
    await logManager.info('更新文件关联备忘录', {
      userId: metadata.userId,
      fileId,
      memoId,
      action: 'file_memo_update',
    })
  }
}

/**
 * FileManager 单例实例
 */
export const fileManager = new FileManager()
