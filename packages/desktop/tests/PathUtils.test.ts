/**
 * PathUtils 单元测试
 * Unit tests for PathUtils
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PathUtils, PathInfo, FilePermissions } from '../src/main/PathUtils'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/mock/userData',
        appData: '/mock/appData',
        home: '/mock/home',
        documents: '/mock/documents',
        downloads: '/mock/downloads',
        desktop: '/mock/desktop',
        temp: '/mock/temp',
        logs: '/mock/logs',
      }
      return paths[name] || `/mock/${name}`
    }),
  },
}))

describe('PathUtils', () => {
  let pathUtils: PathUtils

  beforeEach(() => {
    pathUtils = new PathUtils()
  })

  describe('Platform Detection', () => {
    it('should return the current platform', () => {
      const platform = pathUtils.getPlatform()
      expect(['win32', 'darwin', 'linux']).toContain(platform)
    })

    it('should return the correct separator for the platform', () => {
      const sep = pathUtils.getSeparator()
      expect(sep).toBe(path.sep)
    })

    it('should return the correct delimiter for the platform', () => {
      const delimiter = pathUtils.getDelimiter()
      expect(delimiter).toBe(path.delimiter)
    })
  })

  describe('Path Normalization', () => {
    it('should normalize empty path to empty string', () => {
      expect(pathUtils.normalize('')).toBe('')
    })

    it('should normalize path with mixed separators', () => {
      const normalized = pathUtils.normalize('foo/bar\\baz')
      expect(normalized).toBe(path.normalize('foo/bar\\baz'))
    })

    it('should normalize path with redundant separators', () => {
      const normalized = pathUtils.normalize('foo//bar///baz')
      expect(normalized).toBe(path.normalize('foo//bar///baz'))
    })

    it('should normalize path with . and ..', () => {
      const normalized = pathUtils.normalize('foo/./bar/../baz')
      expect(normalized).toBe(path.normalize('foo/./bar/../baz'))
    })
  })

  describe('Path Operations', () => {
    it('should join path segments', () => {
      const joined = pathUtils.join('foo', 'bar', 'baz')
      expect(joined).toBe(path.join('foo', 'bar', 'baz'))
    })

    it('should resolve to absolute path', () => {
      const resolved = pathUtils.resolve('foo', 'bar')
      expect(path.isAbsolute(resolved)).toBe(true)
    })

    it('should get relative path', () => {
      const relative = pathUtils.relative('/foo/bar', '/foo/baz')
      expect(relative).toBe(path.relative('/foo/bar', '/foo/baz'))
    })

    it('should check if path is absolute', () => {
      expect(pathUtils.isAbsolute('/foo/bar')).toBe(true)
      expect(pathUtils.isAbsolute('foo/bar')).toBe(false)
    })

    it('should get directory name', () => {
      expect(pathUtils.dirname('/foo/bar/baz.txt')).toBe(path.dirname('/foo/bar/baz.txt'))
    })

    it('should get base name', () => {
      expect(pathUtils.basename('/foo/bar/baz.txt')).toBe('baz.txt')
      expect(pathUtils.basename('/foo/bar/baz.txt', '.txt')).toBe('baz')
    })

    it('should get extension', () => {
      expect(pathUtils.extname('/foo/bar/baz.txt')).toBe('.txt')
      expect(pathUtils.extname('/foo/bar/baz')).toBe('')
    })
  })

  describe('Path Parsing', () => {
    it('should parse path into components', () => {
      const info = pathUtils.parse('/foo/bar/baz.txt')
      
      expect(info.original).toBe('/foo/bar/baz.txt')
      expect(info.isAbsolute).toBe(true)
      expect(info.filename).toBe('baz.txt')
      expect(info.extension).toBe('.txt')
      expect(info.basename).toBe('baz')
    })
  })

  describe('Slash Conversion', () => {
    it('should convert to forward slashes', () => {
      expect(pathUtils.toForwardSlashes('foo\\bar\\baz')).toBe('foo/bar/baz')
      expect(pathUtils.toForwardSlashes('foo/bar/baz')).toBe('foo/bar/baz')
    })

    it('should convert to platform path', () => {
      const result = pathUtils.toPlatformPath('foo/bar/baz')
      if (process.platform === 'win32') {
        expect(result).toBe('foo\\bar\\baz')
      } else {
        expect(result).toBe('foo/bar/baz')
      }
    })
  })

  describe('File System Operations', () => {
    const tempDir = os.tmpdir()
    const testFile = path.join(tempDir, 'pathutils-test-file.txt')
    const testDir = path.join(tempDir, 'pathutils-test-dir')

    beforeEach(() => {
      // Create test file
      fs.writeFileSync(testFile, 'test content')
      // Create test directory
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir)
      }
    })

    afterEach(() => {
      // Cleanup
      try {
        fs.unlinkSync(testFile)
      } catch {}
      try {
        fs.rmdirSync(testDir)
      } catch {}
    })

    it('should check if path exists', () => {
      expect(pathUtils.exists(testFile)).toBe(true)
      expect(pathUtils.exists('/nonexistent/path')).toBe(false)
    })

    it('should check if path exists async', async () => {
      expect(await pathUtils.existsAsync(testFile)).toBe(true)
      expect(await pathUtils.existsAsync('/nonexistent/path')).toBe(false)
    })

    it('should check if path is directory', () => {
      expect(pathUtils.isDirectory(testDir)).toBe(true)
      expect(pathUtils.isDirectory(testFile)).toBe(false)
    })

    it('should check if path is file', () => {
      expect(pathUtils.isFile(testFile)).toBe(true)
      expect(pathUtils.isFile(testDir)).toBe(false)
    })

    it('should get file permissions', () => {
      const perms = pathUtils.getPermissions(testFile)
      expect(perms.readable).toBe(true)
      expect(typeof perms.writable).toBe('boolean')
      expect(typeof perms.executable).toBe('boolean')
    })

    it('should get file permissions async', async () => {
      const perms = await pathUtils.getPermissionsAsync(testFile)
      expect(perms.readable).toBe(true)
      expect(typeof perms.writable).toBe('boolean')
      expect(typeof perms.executable).toBe('boolean')
    })

    it('should ensure directory exists', () => {
      const newDir = path.join(tempDir, 'pathutils-ensure-test')
      try {
        const result = pathUtils.ensureDirectory(newDir)
        expect(result).toBe(true)
        expect(fs.existsSync(newDir)).toBe(true)
      } finally {
        try {
          fs.rmdirSync(newDir)
        } catch {}
      }
    })

    it('should ensure directory exists async', async () => {
      const newDir = path.join(tempDir, 'pathutils-ensure-test-async')
      try {
        const result = await pathUtils.ensureDirectoryAsync(newDir)
        expect(result).toBe(true)
        expect(fs.existsSync(newDir)).toBe(true)
      } finally {
        try {
          fs.rmdirSync(newDir)
        } catch {}
      }
    })
  })

  describe('App Paths', () => {
    it('should return user data path', () => {
      const p = pathUtils.getUserDataPath()
      expect(typeof p).toBe('string')
    })

    it('should return app data path', () => {
      const p = pathUtils.getAppDataPath()
      expect(typeof p).toBe('string')
    })

    it('should return home path', () => {
      const p = pathUtils.getHomePath()
      expect(typeof p).toBe('string')
    })

    it('should return documents path', () => {
      const p = pathUtils.getDocumentsPath()
      expect(typeof p).toBe('string')
    })

    it('should return downloads path', () => {
      const p = pathUtils.getDownloadsPath()
      expect(typeof p).toBe('string')
    })

    it('should return desktop path', () => {
      const p = pathUtils.getDesktopPath()
      expect(typeof p).toBe('string')
    })

    it('should return temp path', () => {
      const p = pathUtils.getTempPath()
      expect(typeof p).toBe('string')
    })

    it('should return logs path', () => {
      const p = pathUtils.getLogsPath()
      expect(typeof p).toBe('string')
    })
  })

  describe('Filename Sanitization', () => {
    it('should sanitize filename with invalid characters', () => {
      expect(pathUtils.sanitizeFilename('file<>:"/\\|?*.txt')).toBe('file_________.txt')
    })

    it('should handle empty filename', () => {
      expect(pathUtils.sanitizeFilename('')).toBe('unnamed')
    })

    it('should trim spaces', () => {
      expect(pathUtils.sanitizeFilename('  file.txt  ')).toBe('file.txt')
    })

    it('should remove leading/trailing dots', () => {
      expect(pathUtils.sanitizeFilename('...file.txt...')).toBe('file.txt')
    })

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt'
      const sanitized = pathUtils.sanitizeFilename(longName)
      expect(sanitized.length).toBeLessThanOrEqual(255)
      expect(sanitized.endsWith('.txt')).toBe(true)
    })
  })

  describe('Filename Validation', () => {
    it('should reject empty filename', () => {
      expect(pathUtils.isValidFilename('')).toBe(false)
    })

    it('should reject filename with invalid characters', () => {
      expect(pathUtils.isValidFilename('file<name>.txt')).toBe(false)
      expect(pathUtils.isValidFilename('file:name.txt')).toBe(false)
      expect(pathUtils.isValidFilename('file|name.txt')).toBe(false)
    })

    it('should accept valid filename', () => {
      expect(pathUtils.isValidFilename('valid-file_name.txt')).toBe(true)
      expect(pathUtils.isValidFilename('file123.doc')).toBe(true)
    })

    it('should reject filename ending with dot', () => {
      expect(pathUtils.isValidFilename('file.')).toBe(false)
    })

    it('should reject too long filename', () => {
      const longName = 'a'.repeat(300)
      expect(pathUtils.isValidFilename(longName)).toBe(false)
    })
  })

  describe('Safe Path', () => {
    it('should create safe path with sanitized filename', () => {
      const safePath = pathUtils.getSafePath('/foo/bar', 'file<>name.txt')
      expect(safePath).toContain('file__name.txt')
    })
  })
})
