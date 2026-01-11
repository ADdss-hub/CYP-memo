/**
 * 跨平台路径处理工具
 * Cross-platform path handling utilities
 * 
 * Requirements: 10.3 - Cross-platform path handling
 */

import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export type Platform = 'win32' | 'darwin' | 'linux'

export interface PathInfo {
  original: string
  normalized: string
  isAbsolute: boolean
  directory: string
  filename: string
  extension: string
  basename: string
}

export interface FilePermissions {
  readable: boolean
  writable: boolean
  executable: boolean
}

export class PathUtils {
  private platform: Platform

  constructor() {
    this.platform = process.platform as Platform
  }

  /**
   * Get the current platform
   */
  getPlatform(): Platform {
    return this.platform
  }

  /**
   * Get the platform-specific path separator
   */
  getSeparator(): string {
    return path.sep
  }

  /**
   * Get the platform-specific path delimiter (for PATH environment variable)
   */
  getDelimiter(): string {
    return path.delimiter
  }

  /**
   * Normalize a path for the current platform
   * Converts forward/back slashes to the platform-specific separator
   */
  normalize(inputPath: string): string {
    if (!inputPath) {
      return ''
    }
    return path.normalize(inputPath)
  }

  /**
   * Join path segments using the platform-specific separator
   */
  join(...segments: string[]): string {
    return path.join(...segments)
  }

  /**
   * Resolve a path to an absolute path
   */
  resolve(...segments: string[]): string {
    return path.resolve(...segments)
  }

  /**
   * Get the relative path from one path to another
   */
  relative(from: string, to: string): string {
    return path.relative(from, to)
  }

  /**
   * Check if a path is absolute
   */
  isAbsolute(inputPath: string): boolean {
    return path.isAbsolute(inputPath)
  }

  /**
   * Get the directory name from a path
   */
  dirname(inputPath: string): string {
    return path.dirname(inputPath)
  }

  /**
   * Get the base name (filename with extension) from a path
   */
  basename(inputPath: string, ext?: string): string {
    return path.basename(inputPath, ext)
  }

  /**
   * Get the file extension from a path
   */
  extname(inputPath: string): string {
    return path.extname(inputPath)
  }

  /**
   * Parse a path into its components
   */
  parse(inputPath: string): PathInfo {
    const parsed = path.parse(inputPath)
    return {
      original: inputPath,
      normalized: this.normalize(inputPath),
      isAbsolute: this.isAbsolute(inputPath),
      directory: parsed.dir,
      filename: parsed.base,
      extension: parsed.ext,
      basename: parsed.name,
    }
  }

  /**
   * Convert a path to use forward slashes (for URLs or cross-platform storage)
   */
  toForwardSlashes(inputPath: string): string {
    return inputPath.replace(/\\/g, '/')
  }

  /**
   * Convert a path to use the platform-specific separator
   */
  toPlatformPath(inputPath: string): string {
    if (this.platform === 'win32') {
      return inputPath.replace(/\//g, '\\')
    }
    return inputPath.replace(/\\/g, '/')
  }

  /**
   * Check if a path exists
   */
  exists(inputPath: string): boolean {
    try {
      fs.accessSync(inputPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a path exists (async)
   */
  async existsAsync(inputPath: string): Promise<boolean> {
    try {
      await fs.promises.access(inputPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a path is a directory
   */
  isDirectory(inputPath: string): boolean {
    try {
      const stats = fs.statSync(inputPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Check if a path is a file
   */
  isFile(inputPath: string): boolean {
    try {
      const stats = fs.statSync(inputPath)
      return stats.isFile()
    } catch {
      return false
    }
  }

  /**
   * Get file permissions for a path
   */
  getPermissions(inputPath: string): FilePermissions {
    const permissions: FilePermissions = {
      readable: false,
      writable: false,
      executable: false,
    }

    try {
      fs.accessSync(inputPath, fs.constants.R_OK)
      permissions.readable = true
    } catch {
      // Not readable
    }

    try {
      fs.accessSync(inputPath, fs.constants.W_OK)
      permissions.writable = true
    } catch {
      // Not writable
    }

    try {
      fs.accessSync(inputPath, fs.constants.X_OK)
      permissions.executable = true
    } catch {
      // Not executable
    }

    return permissions
  }

  /**
   * Get file permissions for a path (async)
   */
  async getPermissionsAsync(inputPath: string): Promise<FilePermissions> {
    const permissions: FilePermissions = {
      readable: false,
      writable: false,
      executable: false,
    }

    try {
      await fs.promises.access(inputPath, fs.constants.R_OK)
      permissions.readable = true
    } catch {
      // Not readable
    }

    try {
      await fs.promises.access(inputPath, fs.constants.W_OK)
      permissions.writable = true
    } catch {
      // Not writable
    }

    try {
      await fs.promises.access(inputPath, fs.constants.X_OK)
      permissions.executable = true
    } catch {
      // Not executable
    }

    return permissions
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  ensureDirectory(dirPath: string): boolean {
    try {
      if (!this.exists(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
      return true
    } catch (error) {
      console.error('Failed to ensure directory:', error)
      return false
    }
  }

  /**
   * Ensure a directory exists (async)
   */
  async ensureDirectoryAsync(dirPath: string): Promise<boolean> {
    try {
      if (!(await this.existsAsync(dirPath))) {
        await fs.promises.mkdir(dirPath, { recursive: true })
      }
      return true
    } catch (error) {
      console.error('Failed to ensure directory:', error)
      return false
    }
  }

  /**
   * Get the user data directory for the application
   */
  getUserDataPath(): string {
    return app.getPath('userData')
  }

  /**
   * Get the application data directory
   */
  getAppDataPath(): string {
    return app.getPath('appData')
  }

  /**
   * Get the user's home directory
   */
  getHomePath(): string {
    return app.getPath('home')
  }

  /**
   * Get the user's documents directory
   */
  getDocumentsPath(): string {
    return app.getPath('documents')
  }

  /**
   * Get the user's downloads directory
   */
  getDownloadsPath(): string {
    return app.getPath('downloads')
  }

  /**
   * Get the user's desktop directory
   */
  getDesktopPath(): string {
    return app.getPath('desktop')
  }

  /**
   * Get the temporary directory
   */
  getTempPath(): string {
    return app.getPath('temp')
  }

  /**
   * Get the logs directory
   */
  getLogsPath(): string {
    return app.getPath('logs')
  }

  /**
   * Sanitize a filename by removing invalid characters
   */
  sanitizeFilename(filename: string): string {
    // Characters not allowed in filenames on various platforms
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g
    
    // Replace invalid characters with underscore
    let sanitized = filename.replace(invalidChars, '_')
    
    // Remove leading/trailing spaces and dots (Windows restriction)
    sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '')
    
    // Ensure the filename is not empty
    if (!sanitized) {
      sanitized = 'unnamed'
    }
    
    // Truncate if too long (255 is common max filename length)
    if (sanitized.length > 255) {
      const ext = this.extname(sanitized)
      const name = sanitized.slice(0, 255 - ext.length)
      sanitized = name + ext
    }
    
    return sanitized
  }

  /**
   * Check if a filename is valid for the current platform
   */
  isValidFilename(filename: string): boolean {
    if (!filename || filename.length === 0) {
      return false
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/
    if (invalidChars.test(filename)) {
      return false
    }

    // Check for reserved names on Windows
    if (this.platform === 'win32') {
      const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
      const baseName = this.basename(filename, this.extname(filename))
      if (reservedNames.test(baseName)) {
        return false
      }
    }

    // Check for leading/trailing spaces or dots
    if (filename !== filename.trim() || filename.startsWith('.') || filename.endsWith('.')) {
      // Allow hidden files on Unix (starting with .)
      if (this.platform !== 'win32' && filename.startsWith('.') && filename.length > 1) {
        // This is a valid hidden file on Unix
      } else if (filename.endsWith('.')) {
        return false
      }
    }

    // Check length
    if (filename.length > 255) {
      return false
    }

    return true
  }

  /**
   * Get a safe path by combining directory and sanitized filename
   */
  getSafePath(directory: string, filename: string): string {
    const sanitized = this.sanitizeFilename(filename)
    return this.join(directory, sanitized)
  }
}

// Export singleton instance
export const pathUtils = new PathUtils()
