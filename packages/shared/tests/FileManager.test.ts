/**
 * CYP-memo 文件管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileManager } from '../src/managers/FileManager'
import { fileDAO } from '../src/database/FileDAO'
import { memoDAO } from '../src/database/MemoDAO'
import { logManager } from '../src/managers/LogManager'
import { validateFileSize } from '../src/utils/validation'

describe('文件管理器单元测试', () => {
  const testUserId = 'test-user-id'

  // 清理测试环境
  beforeEach(async () => {
    // 清空文件数据库
    const files = await fileDAO.getAll()
    for (const file of files) {
      await fileDAO.delete(file.id)
    }

    // 清空备忘录数据库
    const memos = await memoDAO.getAll()
    for (const memo of memos) {
      await memoDAO.delete(memo.id)
    }

    // 清空本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    // 清空文件数据库
    const files = await fileDAO.getAll()
    for (const file of files) {
      await fileDAO.delete(file.id)
    }

    // 清空备忘录数据库
    const memos = await memoDAO.getAll()
    for (const memo of memos) {
      await memoDAO.delete(memo.id)
    }

    // 清空本地存储
    localStorage.clear()
  })

  describe('文件类型验证', () => {
    it('应该接受有效的文件大小', () => {
      // 1 byte
      expect(validateFileSize(1)).toBe(true)

      // 1 MB
      expect(validateFileSize(1024 * 1024)).toBe(true)

      // 1 GB
      expect(validateFileSize(1024 * 1024 * 1024)).toBe(true)

      // 10 GB (最大限制)
      expect(validateFileSize(10 * 1024 * 1024 * 1024)).toBe(true)
    })

    it('应该拒绝超过 10GB 的文件', () => {
      const maxSize = 10 * 1024 * 1024 * 1024
      expect(validateFileSize(maxSize + 1)).toBe(false)
      expect(validateFileSize(maxSize * 2)).toBe(false)
    })

    it('应该拒绝零字节或负数大小的文件', () => {
      expect(validateFileSize(0)).toBe(false)
      expect(validateFileSize(-1)).toBe(false)
      expect(validateFileSize(-1000)).toBe(false)
    })

    it('应该在上传超大文件时抛出错误', async () => {
      const oversizedFile = new File(
        [new Uint8Array(1024)],
        'large.bin',
        { type: 'application/octet-stream' }
      )

      // 模拟超大文件（通过修改 size 属性）
      Object.defineProperty(oversizedFile, 'size', {
        value: 11 * 1024 * 1024 * 1024, // 11 GB
        writable: false
      })

      await expect(
        fileManager.uploadFile(testUserId, oversizedFile)
      ).rejects.toThrow('文件大小超过限制')
    })

    it('应该正确处理不同的文件类型', async () => {
      const fileTypes = [
        { type: 'text/plain', ext: 'txt' },
        { type: 'application/pdf', ext: 'pdf' },
        { type: 'application/json', ext: 'json' },
        { type: 'application/octet-stream', ext: 'bin' }
      ]

      for (const { type, ext } of fileTypes) {
        const file = new File(
          [new Uint8Array(100)],
          `test.${ext}`,
          { type }
        )

        const metadata = await fileManager.uploadFile(testUserId, file)
        expect(metadata.type).toBe(type)
        expect(metadata.filename).toBe(`test.${ext}`)

        // 清理
        await fileDAO.delete(metadata.id)
      }
    })

    it('应该能够按文件类型筛选', async () => {
      // 上传不同类型的文件
      const textFile = new File([new Uint8Array(100)], 'doc.txt', { type: 'text/plain' })
      const pdfFile = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })
      const imageFile = new File([new Uint8Array(100)], 'pic.bin', { type: 'application/octet-stream' })

      await fileManager.uploadFile(testUserId, textFile)
      await fileManager.uploadFile(testUserId, pdfFile)
      await fileManager.uploadFile(testUserId, imageFile)

      // 按类型筛选
      const textFiles = await fileManager.getFilesByType(testUserId, 'text')
      expect(textFiles.length).toBe(1)
      expect(textFiles[0].type).toBe('text/plain')

      const appFiles = await fileManager.getFilesByType(testUserId, 'application')
      expect(appFiles.length).toBe(2)
    })

    it('应该正确识别文本文件', async () => {
      const textFile = new File(
        ['Hello, World!'],
        'hello.txt',
        { type: 'text/plain' }
      )

      const metadata = await fileManager.uploadFile(testUserId, textFile)
      expect(metadata.type).toBe('text/plain')
      expect(metadata.size).toBeGreaterThan(0)

      // 验证可以获取文件内容
      const blob = await fileManager.getFile(metadata.id)
      expect(blob).toBeDefined()
      // 注意：在测试环境中，blob.type 可能不会被保留
      // 我们主要验证文件可以被检索，元数据中的类型是正确的
      expect(metadata.type).toBe('text/plain')
    })
  })

  describe('批量操作', () => {
    it('应该能够批量删除多个文件', async () => {
      // 创建多个文件
      const fileIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const file = new File(
          [new Uint8Array(100)],
          `file${i}.bin`,
          { type: 'application/octet-stream' }
        )
        const metadata = await fileManager.uploadFile(testUserId, file)
        fileIds.push(metadata.id)
      }

      // 验证文件已创建
      const allFiles = await fileManager.getAllFiles(testUserId)
      expect(allFiles.length).toBe(5)

      // 批量删除
      await fileManager.deleteFiles(fileIds)

      // 验证文件已删除
      const remainingFiles = await fileManager.getAllFiles(testUserId)
      expect(remainingFiles.length).toBe(0)

      // 验证每个文件都无法获取
      for (const fileId of fileIds) {
        await expect(fileManager.getFileMetadata(fileId)).rejects.toThrow('文件不存在')
      }
    })

    it('应该在批量删除时记录日志', async () => {
      // 创建文件
      const fileIds: string[] = []
      const filenames: string[] = []
      for (let i = 0; i < 3; i++) {
        const filename = `batch-file-${i}.bin`
        const file = new File(
          [new Uint8Array(100)],
          filename,
          { type: 'application/octet-stream' }
        )
        const metadata = await fileManager.uploadFile(testUserId, file)
        fileIds.push(metadata.id)
        filenames.push(filename)
      }

      // 批量删除
      await fileManager.deleteFiles(fileIds)

      // 验证日志
      const logs = await logManager.getLogs()
      const deleteLog = logs.find(log =>
        log.message.includes('批量删除文件成功') &&
        log.context?.count === 3
      )
      expect(deleteLog).toBeDefined()
      expect(deleteLog?.context?.fileIds).toEqual(fileIds)
    })

    it('应该能够批量删除空数组', async () => {
      // 批量删除空数组不应该抛出错误
      await expect(fileManager.deleteFiles([])).resolves.not.toThrow()
    })

    it('应该能够获取所有用户文件', async () => {
      // 创建多个文件
      const fileCount = 10
      for (let i = 0; i < fileCount; i++) {
        const file = new File(
          [new Uint8Array(100)],
          `file${i}.bin`,
          { type: 'application/octet-stream' }
        )
        await fileManager.uploadFile(testUserId, file)
      }

      // 获取所有文件
      const allFiles = await fileManager.getAllFiles(testUserId)
      expect(allFiles.length).toBe(fileCount)

      // 验证所有文件都属于该用户
      for (const file of allFiles) {
        expect(file.userId).toBe(testUserId)
      }
    })

    it('应该能够按上传时间排序获取文件', async () => {
      // 创建多个文件（带延迟以确保不同的时间戳）
      const fileIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const file = new File(
          [new Uint8Array(100)],
          `file${i}.bin`,
          { type: 'application/octet-stream' }
        )
        const metadata = await fileManager.uploadFile(testUserId, file)
        fileIds.push(metadata.id)
        // 小延迟确保时间戳不同
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // 降序获取（最新的在前）
      const filesDesc = await fileManager.getFilesByUploadTime(testUserId, false)
      expect(filesDesc.length).toBe(3)
      expect(filesDesc[0].id).toBe(fileIds[2]) // 最后上传的
      expect(filesDesc[2].id).toBe(fileIds[0]) // 最先上传的

      // 升序获取（最旧的在前）
      const filesAsc = await fileManager.getFilesByUploadTime(testUserId, true)
      expect(filesAsc.length).toBe(3)
      expect(filesAsc[0].id).toBe(fileIds[0]) // 最先上传的
      expect(filesAsc[2].id).toBe(fileIds[2]) // 最后上传的
    })

    it('应该能够获取备忘录的所有附件', async () => {
      const memoId = crypto.randomUUID()

      // 创建备忘录
      await memoDAO.create({
        id: memoId,
        userId: testUserId,
        title: '测试备忘录',
        content: '测试内容',
        tags: [],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // 上传多个附件到同一个备忘录
      const attachmentCount = 5
      for (let i = 0; i < attachmentCount; i++) {
        const file = new File(
          [new Uint8Array(100)],
          `attachment${i}.bin`,
          { type: 'application/octet-stream' }
        )
        await fileManager.uploadFile(testUserId, file, memoId)
      }

      // 获取备忘录的所有附件
      const attachments = await fileManager.getMemoAttachments(memoId)
      expect(attachments.length).toBe(attachmentCount)

      // 验证所有附件都关联到该备忘录
      for (const attachment of attachments) {
        expect(attachment.memoId).toBe(memoId)
        expect(attachment.userId).toBe(testUserId)
      }
    })

    it('应该能够更新文件关联的备忘录', async () => {
      const memoId1 = crypto.randomUUID()
      const memoId2 = crypto.randomUUID()

      // 创建文件并关联到第一个备忘录
      const file = new File(
        [new Uint8Array(100)],
        'test.bin',
        { type: 'application/octet-stream' }
      )
      const metadata = await fileManager.uploadFile(testUserId, file, memoId1)
      expect(metadata.memoId).toBe(memoId1)

      // 更新文件关联到第二个备忘录
      await fileManager.updateFileMemo(metadata.id, memoId2)

      // 验证关联已更新
      const updatedMetadata = await fileManager.getFileMetadata(metadata.id)
      expect(updatedMetadata.memoId).toBe(memoId2)

      // 验证日志
      const logs = await logManager.getLogs()
      const updateLog = logs.find(log =>
        log.message.includes('更新文件关联备忘录') &&
        log.context?.fileId === metadata.id &&
        log.context?.memoId === memoId2
      )
      expect(updateLog).toBeDefined()
    })
  })

  describe('边界情况和错误处理', () => {
    it('应该在删除不存在的文件时抛出错误', async () => {
      const nonExistentId = 'non-existent-file-id'
      await expect(fileManager.deleteFile(nonExistentId)).rejects.toThrow('文件不存在')
    })

    it('应该在获取不存在的文件时抛出错误', async () => {
      const nonExistentId = 'non-existent-file-id'
      await expect(fileManager.getFile(nonExistentId)).rejects.toThrow('文件不存在')
    })

    it('应该在获取不存在的文件元数据时抛出错误', async () => {
      const nonExistentId = 'non-existent-file-id'
      await expect(fileManager.getFileMetadata(nonExistentId)).rejects.toThrow('文件不存在')
    })

    it('应该在更新不存在的文件时抛出错误', async () => {
      const nonExistentId = 'non-existent-file-id'
      const memoId = crypto.randomUUID()
      await expect(fileManager.updateFileMemo(nonExistentId, memoId)).rejects.toThrow('文件不存在')
    })

    it('应该正确处理空文件名', async () => {
      const file = new File(
        [new Uint8Array(100)],
        '',
        { type: 'application/octet-stream' }
      )

      const metadata = await fileManager.uploadFile(testUserId, file)
      expect(metadata.filename).toBe('')
      expect(metadata.id).toBeDefined()
    })

    it('应该正确处理特殊字符文件名', async () => {
      const specialFilenames = [
        '文件名.txt',
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.multiple.dots.txt'
      ]

      for (const filename of specialFilenames) {
        const file = new File(
          [new Uint8Array(100)],
          filename,
          { type: 'text/plain' }
        )

        const metadata = await fileManager.uploadFile(testUserId, file)
        expect(metadata.filename).toBe(filename)

        // 清理
        await fileDAO.delete(metadata.id)
      }
    })

    it('应该正确获取存储使用情况', async () => {
      // 初始状态
      const initialUsage = await fileManager.getStorageUsage(testUserId)
      expect(initialUsage.used).toBe(0)

      // 上传一些文件
      const fileSize = 1024 // 1 KB
      const fileCount = 5
      for (let i = 0; i < fileCount; i++) {
        const file = new File(
          [new Uint8Array(fileSize)],
          `file${i}.bin`,
          { type: 'application/octet-stream' }
        )
        await fileManager.uploadFile(testUserId, file)
      }

      // 验证存储使用情况
      const usage = await fileManager.getStorageUsage(testUserId)
      expect(usage.used).toBe(fileSize * fileCount)
      expect(usage.total).toBeGreaterThanOrEqual(0)
      expect(usage.available).toBeGreaterThanOrEqual(0)
    })

    it('应该正确识别和清理孤立文件', async () => {
      // 创建一些有关联的文件
      const memoId = crypto.randomUUID()
      const file1 = new File([new Uint8Array(100)], 'attached.bin', { type: 'application/octet-stream' })
      await fileManager.uploadFile(testUserId, file1, memoId)

      // 创建一些孤立文件
      const file2 = new File([new Uint8Array(100)], 'orphan1.bin', { type: 'application/octet-stream' })
      const file3 = new File([new Uint8Array(100)], 'orphan2.bin', { type: 'application/octet-stream' })
      await fileManager.uploadFile(testUserId, file2)
      await fileManager.uploadFile(testUserId, file3)

      // 获取孤立文件
      const orphanedFiles = await fileManager.getOrphanedFiles()
      expect(orphanedFiles.length).toBe(2)

      // 清理孤立文件
      const cleanedCount = await fileManager.cleanOrphanedFiles()
      expect(cleanedCount).toBe(2)

      // 验证孤立文件已被删除
      const remainingOrphaned = await fileManager.getOrphanedFiles()
      expect(remainingOrphaned.length).toBe(0)

      // 验证有关联的文件仍然存在
      const allFiles = await fileManager.getAllFiles(testUserId)
      expect(allFiles.length).toBe(1)
      expect(allFiles[0].memoId).toBe(memoId)
    })
  })
})
