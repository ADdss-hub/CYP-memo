/**
 * CYP-memo FileDAO 单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../src/database/db'
import { FileDAO } from '../src/database/FileDAO'
import type { FileMetadata } from '../src/types'

describe('FileDAO', () => {
  let fileDAO: FileDAO

  beforeEach(async () => {
    fileDAO = new FileDAO()
    // Clear all data before each test
    await db.files.clear()
    await db.fileBlobs.clear()
  })

  afterEach(async () => {
    // Clean up after each test
    await db.files.clear()
    await db.fileBlobs.clear()
  })

  describe('CRUD 操作', () => {
    it('应该创建文件元数据', async () => {
      const metadata: FileMetadata = {
        id: 'file1',
        userId: 'user1',
        filename: 'test.txt',
        size: 1024,
        type: 'text/plain',
        memoId: 'memo1',
        uploadedAt: new Date(),
      }

      const id = await fileDAO.createMetadata(metadata)
      expect(id).toBe('file1')

      const retrieved = await fileDAO.getMetadata('file1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.filename).toBe('test.txt')
    })

    it('应该存储文件 Blob', async () => {
      const blob = new Blob(['测试内容'], { type: 'text/plain' })
      const id = await fileDAO.storeBlob('file2', blob)

      expect(id).toBe('file2')

      const retrieved = await fileDAO.getBlob('file2')
      // fake-indexeddb 不完全支持 Blob，但应该能存储和检索对象
      expect(retrieved).toBeDefined()
    })

    it('应该创建完整文件（元数据 + Blob）', async () => {
      const metadata: FileMetadata = {
        id: 'file3',
        userId: 'user1',
        filename: 'image.png',
        size: 2048,
        type: 'image/png',
        uploadedAt: new Date(),
      }

      const blob = new Blob(['图片数据'], { type: 'image/png' })
      const id = await fileDAO.create(metadata, blob)

      expect(id).toBe('file3')

      const retrievedMetadata = await fileDAO.getMetadata('file3')
      const retrievedBlob = await fileDAO.getBlob('file3')

      expect(retrievedMetadata).toBeDefined()
      expect(retrievedBlob).toBeDefined()
      expect(retrievedMetadata?.filename).toBe('image.png')
    })

    it('应该更新文件元数据', async () => {
      const metadata: FileMetadata = {
        id: 'file4',
        userId: 'user1',
        filename: 'old.txt',
        size: 512,
        type: 'text/plain',
        uploadedAt: new Date(),
      }

      await fileDAO.createMetadata(metadata)
      const updateCount = await fileDAO.updateMetadata('file4', {
        filename: 'new.txt',
        memoId: 'memo1',
      })

      expect(updateCount).toBe(1)

      const updated = await fileDAO.getMetadata('file4')
      expect(updated?.filename).toBe('new.txt')
      expect(updated?.memoId).toBe('memo1')
    })

    it('应该删除文件（元数据 + Blob）', async () => {
      const metadata: FileMetadata = {
        id: 'file5',
        userId: 'user1',
        filename: 'delete.txt',
        size: 256,
        type: 'text/plain',
        uploadedAt: new Date(),
      }

      const blob = new Blob(['删除测试'], { type: 'text/plain' })
      await fileDAO.create(metadata, blob)
      await fileDAO.delete('file5')

      const retrievedMetadata = await fileDAO.getMetadata('file5')
      const retrievedBlob = await fileDAO.getBlob('file5')

      expect(retrievedMetadata).toBeUndefined()
      expect(retrievedBlob).toBeUndefined()
    })

    it('应该批量删除文件', async () => {
      const files: FileMetadata[] = [
        {
          id: 'file6',
          userId: 'user1',
          filename: 'bulk1.txt',
          size: 100,
          type: 'text/plain',
          uploadedAt: new Date(),
        },
        {
          id: 'file7',
          userId: 'user1',
          filename: 'bulk2.txt',
          size: 200,
          type: 'text/plain',
          uploadedAt: new Date(),
        },
      ]

      for (const file of files) {
        const blob = new Blob(['内容'], { type: 'text/plain' })
        await fileDAO.create(file, blob)
      }

      await fileDAO.bulkDelete(['file6', 'file7'])

      const retrieved1 = await fileDAO.getMetadata('file6')
      const retrieved2 = await fileDAO.getMetadata('file7')

      expect(retrieved1).toBeUndefined()
      expect(retrieved2).toBeUndefined()
    })
  })

  describe('查询和筛选', () => {
    beforeEach(async () => {
      // 创建测试数据
      const files: FileMetadata[] = [
        {
          id: 'file10',
          userId: 'user1',
          filename: 'doc1.txt',
          size: 1000,
          type: 'text/plain',
          memoId: 'memo1',
          uploadedAt: new Date(Date.now() - 3000),
        },
        {
          id: 'file11',
          userId: 'user1',
          filename: 'image1.png',
          size: 5000,
          type: 'image/png',
          memoId: 'memo1',
          uploadedAt: new Date(Date.now() - 2000),
        },
        {
          id: 'file12',
          userId: 'user2',
          filename: 'doc2.txt',
          size: 2000,
          type: 'text/plain',
          memoId: 'memo2',
          uploadedAt: new Date(Date.now() - 1000),
        },
        {
          id: 'file13',
          userId: 'user1',
          filename: 'orphan.txt',
          size: 500,
          type: 'text/plain',
          uploadedAt: new Date(),
        },
      ]

      for (const file of files) {
        await fileDAO.createMetadata(file)
      }
    })

    it('应该获取用户的所有文件', async () => {
      const files = await fileDAO.getByUserId('user1')

      expect(files.length).toBe(3)
      expect(files.every((f) => f.userId === 'user1')).toBe(true)
    })

    it('应该获取备忘录的所有附件', async () => {
      const files = await fileDAO.getByMemoId('memo1')

      expect(files.length).toBe(2)
      expect(files.every((f) => f.memoId === 'memo1')).toBe(true)
    })

    it('应该获取所有文件', async () => {
      const files = await fileDAO.getAll()

      expect(files.length).toBe(4)
    })

    it('应该获取用户的存储使用量', async () => {
      const usage = await fileDAO.getUserStorageUsage('user1')

      // 1000 + 5000 + 500 = 6500
      expect(usage).toBe(6500)
    })

    it('应该获取孤立文件（未关联备忘录）', async () => {
      const orphaned = await fileDAO.getOrphanedFiles()

      expect(orphaned.length).toBe(1)
      expect(orphaned[0].id).toBe('file13')
      expect(orphaned[0].memoId).toBeUndefined()
    })

    it('应该按文件类型筛选', async () => {
      const textFiles = await fileDAO.getByType('user1', 'text')
      const imageFiles = await fileDAO.getByType('user1', 'image')

      expect(textFiles.length).toBe(2)
      expect(imageFiles.length).toBe(1)
      expect(textFiles.every((f) => f.type.startsWith('text'))).toBe(true)
      expect(imageFiles.every((f) => f.type.startsWith('image'))).toBe(true)
    })

    it('应该按上传时间排序（降序）', async () => {
      const files = await fileDAO.getByUploadTime('user1', false)

      expect(files.length).toBe(3)
      expect(files[0].id).toBe('file13') // 最新
      expect(files[2].id).toBe('file10') // 最旧
    })

    it('应该按上传时间排序（升序）', async () => {
      const files = await fileDAO.getByUploadTime('user1', true)

      expect(files.length).toBe(3)
      expect(files[0].id).toBe('file10') // 最旧
      expect(files[2].id).toBe('file13') // 最新
    })
  })
})
