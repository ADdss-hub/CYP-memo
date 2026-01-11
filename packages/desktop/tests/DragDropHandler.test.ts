/**
 * DragDropHandler 单元测试
 * Unit tests for DragDropHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DragDropHandler, DroppedFile, DragDropResult, DragDropOptions } from '../src/main/DragDropHandler'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}))

describe('DragDropHandler', () => {
  let handler: DragDropHandler
  const tempDir = os.tmpdir()
  const testFile = path.join(tempDir, 'dragdrop-test-file.txt')
  const testFile2 = path.join(tempDir, 'dragdrop-test-file2.txt')
  const testDir = path.join(tempDir, 'dragdrop-test-dir')

  beforeEach(() => {
    handler = new DragDropHandler()
    
    // Create test files
    fs.writeFileSync(testFile, 'test content')
    fs.writeFileSync(testFile2, 'test content 2')
    
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir)
    }
  })

  afterEach(() => {
    handler.destroy()
    
    // Cleanup test files
    try { fs.unlinkSync(testFile) } catch {}
    try { fs.unlinkSync(testFile2) } catch {}
    try { fs.rmdirSync(testDir) } catch {}
  })

  describe('Constructor and Options', () => {
    it('should create handler with default options', () => {
      const options = handler.getOptions()
      
      expect(options.maxFileSize).toBe(100 * 1024 * 1024) // 100MB
      expect(options.maxFiles).toBe(10)
      expect(options.allowedExtensions).toBeUndefined()
    })

    it('should create handler with custom options', () => {
      const customHandler = new DragDropHandler({
        maxFileSize: 50 * 1024 * 1024,
        maxFiles: 5,
        allowedExtensions: ['.txt', '.md'],
      })

      const options = customHandler.getOptions()
      
      expect(options.maxFileSize).toBe(50 * 1024 * 1024)
      expect(options.maxFiles).toBe(5)
      expect(options.allowedExtensions).toEqual(['.txt', '.md'])
      
      customHandler.destroy()
    })

    it('should update options', () => {
      handler.setOptions({ maxFiles: 20 })
      
      const options = handler.getOptions()
      expect(options.maxFiles).toBe(20)
    })
  })

  describe('File Processing', () => {
    it('should process valid file', () => {
      const result = handler.processDroppedFiles([testFile])
      
      expect(result.success).toBe(true)
      expect(result.files.length).toBe(1)
      expect(result.errors.length).toBe(0)
      
      const file = result.files[0]
      expect(file.name).toBe('dragdrop-test-file.txt')
      expect(file.path).toBe(path.normalize(testFile))
      expect(file.size).toBeGreaterThan(0)
      expect(file.type).toBe('text/plain')
      expect(file.lastModified).toBeGreaterThan(0)
    })

    it('should process multiple files', () => {
      const result = handler.processDroppedFiles([testFile, testFile2])
      
      expect(result.success).toBe(true)
      expect(result.files.length).toBe(2)
      expect(result.errors.length).toBe(0)
    })

    it('should handle non-existent file', () => {
      const result = handler.processDroppedFiles(['/nonexistent/file.txt'])
      
      expect(result.success).toBe(false)
      expect(result.files.length).toBe(0)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('File does not exist')
    })

    it('should handle directory instead of file', () => {
      const result = handler.processDroppedFiles([testDir])
      
      expect(result.success).toBe(false)
      expect(result.files.length).toBe(0)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('not a file')
    })

    it('should limit number of files', () => {
      const customHandler = new DragDropHandler({ maxFiles: 1 })
      const result = customHandler.processDroppedFiles([testFile, testFile2])
      
      expect(result.files.length).toBe(1)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('Too many files')
      
      customHandler.destroy()
    })

    it('should filter by extension', () => {
      const customHandler = new DragDropHandler({ allowedExtensions: ['.md'] })
      const result = customHandler.processDroppedFiles([testFile])
      
      expect(result.success).toBe(false)
      expect(result.files.length).toBe(0)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('File type not allowed')
      
      customHandler.destroy()
    })

    it('should accept allowed extensions', () => {
      const customHandler = new DragDropHandler({ allowedExtensions: ['.txt'] })
      const result = customHandler.processDroppedFiles([testFile])
      
      expect(result.success).toBe(true)
      expect(result.files.length).toBe(1)
      
      customHandler.destroy()
    })

    it('should handle extensions without dot prefix', () => {
      const customHandler = new DragDropHandler({ allowedExtensions: ['txt'] })
      const result = customHandler.processDroppedFiles([testFile])
      
      expect(result.success).toBe(true)
      expect(result.files.length).toBe(1)
      
      customHandler.destroy()
    })
  })

  describe('File Validation', () => {
    it('should validate files without processing', () => {
      const { valid, invalid } = handler.validateFiles([testFile, '/nonexistent.txt'])
      
      expect(valid.length).toBe(1)
      expect(valid[0]).toBe(path.normalize(testFile))
      expect(invalid.length).toBe(1)
      expect(invalid[0].reason).toContain('does not exist')
    })

    it('should validate directory as invalid', () => {
      const { valid, invalid } = handler.validateFiles([testDir])
      
      expect(valid.length).toBe(0)
      expect(invalid.length).toBe(1)
      expect(invalid[0].reason).toContain('not a file')
    })
  })

  describe('MIME Type Detection', () => {
    it('should detect text file MIME type', () => {
      expect(handler.getMimeType('.txt')).toBe('text/plain')
      expect(handler.getMimeType('txt')).toBe('text/plain')
    })

    it('should detect image MIME types', () => {
      expect(handler.getMimeType('.jpg')).toBe('image/jpeg')
      expect(handler.getMimeType('.png')).toBe('image/png')
      expect(handler.getMimeType('.gif')).toBe('image/gif')
      expect(handler.getMimeType('.webp')).toBe('image/webp')
    })

    it('should detect document MIME types', () => {
      expect(handler.getMimeType('.pdf')).toBe('application/pdf')
      expect(handler.getMimeType('.json')).toBe('application/json')
    })

    it('should detect archive MIME types', () => {
      expect(handler.getMimeType('.zip')).toBe('application/zip')
      expect(handler.getMimeType('.tar')).toBe('application/x-tar')
    })

    it('should detect audio MIME types', () => {
      expect(handler.getMimeType('.mp3')).toBe('audio/mpeg')
      expect(handler.getMimeType('.wav')).toBe('audio/wav')
    })

    it('should detect video MIME types', () => {
      expect(handler.getMimeType('.mp4')).toBe('video/mp4')
      expect(handler.getMimeType('.webm')).toBe('video/webm')
    })

    it('should return octet-stream for unknown types', () => {
      expect(handler.getMimeType('.xyz')).toBe('application/octet-stream')
      expect(handler.getMimeType('.unknown')).toBe('application/octet-stream')
    })
  })

  describe('File Size Formatting', () => {
    it('should format bytes', () => {
      expect(handler.formatFileSize(0)).toBe('0 Bytes')
      expect(handler.formatFileSize(500)).toBe('500 Bytes')
    })

    it('should format kilobytes', () => {
      expect(handler.formatFileSize(1024)).toBe('1 KB')
      expect(handler.formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(handler.formatFileSize(1024 * 1024)).toBe('1 MB')
      expect(handler.formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    })

    it('should format gigabytes', () => {
      expect(handler.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    })
  })

  describe('Callbacks', () => {
    it('should call onDrop callback when files are processed', () => {
      const callback = vi.fn()
      handler.onDrop(callback)
      
      handler.processDroppedFiles([testFile])
      
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        files: expect.any(Array),
      }))
    })

    it('should remove callback', () => {
      const callback = vi.fn()
      handler.onDrop(callback)
      handler.removeDropCallback()
      
      handler.processDroppedFiles([testFile])
      
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('Window Management', () => {
    it('should set main window', () => {
      const mockWindow = {
        webContents: {
          startDrag: vi.fn(),
        },
      }
      
      // Should not throw
      handler.setMainWindow(mockWindow as any)
      handler.setMainWindow(null)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup on destroy', () => {
      const callback = vi.fn()
      handler.onDrop(callback)
      
      handler.destroy()
      
      // After destroy, callback should be removed
      handler.processDroppedFiles([testFile])
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
