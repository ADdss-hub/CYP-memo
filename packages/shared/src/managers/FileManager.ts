/**
 * CYP-memo 文件管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { fileDAO } from '../database/FileDAO'
import { memoDAO } from '../database/MemoDAO'
import { validateFileSize } from '../utils/validation'
import { logManager } from './LogManager'
import { generateUUID } from '../utils/crypto'
import { storageManager } from '../storage/StorageManager'
import { getStorage } from '../storage'
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
      type: file.type || 'application/octet-stream',
      memoId,
      uploadedAt: new Date(),
    }

    // 保存文件到数据库
    await fileDAO.create(metadata, fileBlob)

    if (storageManager.getMode() === 'remote') {
      void logManager.info('文件上传成功', {
        userId,
        fileId: metadata.id,
        filename: file.name,
        size: fileBlob.size,
        type: file.type,
        memoId,
        action: 'file_upload',
      })
    } else {
      await logManager.info('文件上传成功', {
        userId,
        fileId: metadata.id,
        filename: file.name,
        size: fileBlob.size,
        type: file.type,
        memoId,
        action: 'file_upload',
      })
    }

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

    // 从全部关联备忘录的 attachments 中移除（多备忘录共用时不能只解主关联）
    await this.detachFileFromMemos(fileId, metadata.userId, undefined, true)

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
   * 从备忘录附件列表移除文件 ID
   * @param scanAll 为 true 时扫该用户全部备忘录（删除文件 / 全部解绑）
   */
  private async detachFileFromMemos(
    fileId: string,
    userId: string,
    preferredMemoId?: string,
    scanAll = false
  ): Promise<void> {
    const memoIds = new Set<string>()
    if (preferredMemoId) memoIds.add(preferredMemoId)

    if (scanAll || !preferredMemoId) {
      try {
        const memos = await memoDAO.getByUserId(userId)
        for (const memo of memos) {
          if ((memo.attachments || []).includes(fileId)) {
            memoIds.add(memo.id)
          }
        }
      } catch (err) {
        await logManager.warn('反查备忘录附件列表失败', {
          fileId,
          userId,
          error: err instanceof Error ? err.message : String(err),
          action: 'memo_attachment_lookup_failed',
        })
      }
    }

    for (const memoId of memoIds) {
      try {
        const memo = await memoDAO.getById(memoId)
        if (!memo) continue
        const prev = memo.attachments || []
        const next = prev.filter((id) => id !== fileId)
        if (next.length === prev.length) continue
        await memoDAO.update(memoId, { attachments: next })
      } catch (err) {
        await logManager.warn('更新备忘录附件列表失败', {
          fileId,
          memoId,
          error: err instanceof Error ? err.message : String(err),
          action: 'memo_attachment_update_failed',
        })
      }
    }
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

    // 逐个从备忘录 detach（含反查兜底），再批量删文件
    for (const metadata of validMetadata) {
      if (!metadata) continue
      await this.detachFileFromMemos(metadata.id, metadata.userId, undefined, true)
    }

    // 批量删除文件
    await fileDAO.bulkDelete(fileIds)

    // 记录日志
    await logManager.info('批量删除文件成功', {
      fileIds,
      count: fileIds.length,
      filenames: validMetadata.map((m) => m!.filename),
      action: 'file_bulk_delete',
    })
  }

  /**
   * 获取存储空间（远程 = 服务器 dataDir 唯一根所在卷；对外正式名「存储空间」）
   */
  async getStorageUsage(userId: string): Promise<StorageInfo> {
    const storage = getStorage() as {
      getStorageInfo?: (userId: string) => Promise<StorageInfo>
      getStorageUsed: (userId: string) => Promise<number>
    }

    if (typeof storage.getStorageInfo !== 'function') {
      throw new Error('存储适配器缺少 getStorageInfo：禁止用账号占用冒充磁盘口径（R-010）')
    }
    return await storage.getStorageInfo(userId)
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
   * 更新文件主关联，并追加到目标备忘录（不从其它备忘录移除）
   * @param fileId 文件 ID
   * @param memoId 备忘录 ID；传 null 解除全部关联且不删文件
   */
  async updateFileMemo(fileId: string, memoId: string | null): Promise<void> {
    const metadata = await fileDAO.getMetadata(fileId)
    if (!metadata) {
      throw new Error('文件不存在')
    }

    const nextMemoId = memoId && String(memoId).trim() ? String(memoId).trim() : null
    const prevMemoId = metadata.memoId || null
    const remote = storageManager.getMode() === 'remote'

    if (remote) {
      await fileDAO.updateMetadata(fileId, { memoId: nextMemoId })
    } else if (!nextMemoId) {
      await this.detachFileFromMemos(fileId, metadata.userId, undefined, true)
      await fileDAO.updateMetadata(fileId, { memoId: null })
    } else {
      if (prevMemoId && prevMemoId !== nextMemoId) {
        await this.ensureFileOnMemo(prevMemoId, fileId)
      }
      await fileDAO.updateMetadata(fileId, { memoId: nextMemoId })
      await this.ensureFileOnMemo(nextMemoId, fileId)
    }

    await logManager.info(nextMemoId ? '更新文件关联备忘录' : '解除文件与备忘录关联', {
      userId: metadata.userId,
      fileId,
      memoId: nextMemoId,
      prevMemoId,
      action: nextMemoId ? 'file_memo_update' : 'file_memo_unlink',
    })
  }

  /**
   * 按勾选结果设置文件被哪些备忘录使用（一次写入）
   */
  async setFileMemoLinks(fileId: string, memoIds: string[]): Promise<void> {
    const metadata = await fileDAO.getMetadata(fileId)
    if (!metadata) {
      throw new Error('文件不存在')
    }
    const next = [...new Set(memoIds.map((id) => String(id || '').trim()).filter(Boolean))]

    if (storageManager.getMode() === 'remote') {
      await fileDAO.updateMetadata(fileId, { linkedMemoIds: next })
      return
    }

    const memos = await memoDAO.getByUserId(metadata.userId)
    const current = new Set<string>()
    for (const memo of memos) {
      if ((memo.attachments || []).includes(fileId)) current.add(memo.id)
    }
    if (metadata.memoId) current.add(metadata.memoId)

    const nextSet = new Set(next)
    for (const id of current) {
      if (nextSet.has(id)) continue
      const memo = await memoDAO.getById(id)
      if (!memo) continue
      const attachments = (memo.attachments || []).filter((item) => item !== fileId)
      if (attachments.length !== (memo.attachments || []).length) {
        await memoDAO.update(id, { attachments })
      }
    }
    for (const id of next) {
      await this.ensureFileOnMemo(id, fileId)
    }

    const primary =
      metadata.memoId && nextSet.has(metadata.memoId) ? metadata.memoId : (next[0] ?? null)
    await fileDAO.updateMetadata(fileId, { memoId: primary })
  }

  private async ensureFileOnMemo(memoId: string, fileId: string): Promise<void> {
    const memo = await memoDAO.getById(memoId)
    if (!memo || (memo.attachments || []).includes(fileId)) return
    await memoDAO.update(memoId, {
      attachments: [...(memo.attachments || []), fileId],
    })
  }

  /**
   * 将已有文件库文件关联到备忘录（不复制 blob）
   */
  async linkFileToMemo(fileId: string, memoId: string): Promise<void> {
    await this.updateFileMemo(fileId, memoId)
  }

  /**
   * 解除文件与备忘录关联（保留在文件库）
   */
  async unlinkFileFromMemo(fileId: string): Promise<void> {
    await this.updateFileMemo(fileId, null)
  }

  /**
   * 修复未关联备忘录的孤儿附件：从备忘录 attachments 反填 memoId
   */
  async healOrphanedMemoLinks(userId: string): Promise<number> {
    const files = await fileDAO.getByUserId(userId)
    const orphaned = files.filter((f) => !f.memoId)
    if (orphaned.length === 0) return 0

    const memos = await memoDAO.getByUserId(userId)
    const fileToMemo = new Map<string, string>()
    for (const memo of memos) {
      for (const fileId of memo.attachments || []) {
        if (fileId) fileToMemo.set(fileId, memo.id)
      }
    }

    let healed = 0
    for (const file of orphaned) {
      const memoId = fileToMemo.get(file.id)
      if (!memoId) continue
      try {
        await this.updateFileMemo(file.id, memoId)
        healed++
      } catch (err) {
        await logManager.warn('修复附件备忘录关联失败', {
          userId,
          fileId: file.id,
          memoId,
          error: err instanceof Error ? err.message : String(err),
          action: 'file_memo_heal_failed',
        })
      }
    }

    return healed
  }
}

/**
 * FileManager 单例实例
 */
export const fileManager = new FileManager()
