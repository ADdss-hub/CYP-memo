/**
 * 文件拖放处理器
 * Cross-platform file drag and drop handler
 * 
 * Requirements: 10.5 - Consistent drag and drop handling across platforms
 */

import { BrowserWindow, ipcMain, WebContents } from 'electron'
import path from 'path'
import fs from 'fs'

export interface DroppedFile {
  name: string
  path: string
  size: number
  type: string
  lastModified: number
}

export interface DragDropResult {
  success: boolean
  files: DroppedFile[]
  errors: string[]
}

export interface DragDropOptions {
  allowedExtensions?: string[]
  maxFileSize?: number // in bytes
  maxFiles?: number
}

const DEFAULT_OPTIONS: DragDropOptions = {
  allowedExtensions: undefined, // Allow all
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 10,
}

export class DragDropHandler {
  private options: DragDropOptions
  private mainWindow: BrowserWindow | null = null
  private onDropCallback: ((result: DragDropResult) => void) | null = null

  constructor(options: DragDropOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
    if (window) {
      this.setupWindowListeners(window)
    }
  }

  /**
   * Set up drag and drop listeners on the window
   */
  private setupWindowListeners(window: BrowserWindow): void {
    const webContents = window.webContents

    // Handle file drop from renderer process
    ipcMain.handle('drag-drop:process-files', async (_event, filePaths: string[]) => {
      return this.processDroppedFiles(filePaths)
    })

    // Handle drag start for file export
    ipcMain.handle('drag-drop:start-drag', async (_event, filePath: string) => {
      return this.startDrag(webContents, filePath)
    })
  }

  /**
   * Process dropped files and return normalized result
   */
  processDroppedFiles(filePaths: string[]): DragDropResult {
    const result: DragDropResult = {
      success: true,
      files: [],
      errors: [],
    }

    // Check max files limit
    if (this.options.maxFiles && filePaths.length > this.options.maxFiles) {
      result.errors.push(`Too many files. Maximum allowed: ${this.options.maxFiles}`)
      filePaths = filePaths.slice(0, this.options.maxFiles)
    }

    for (const filePath of filePaths) {
      try {
        const file = this.processFile(filePath)
        if (file) {
          result.files.push(file)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push(`Failed to process ${path.basename(filePath)}: ${errorMessage}`)
      }
    }

    result.success = result.files.length > 0

    // Notify callback if set
    if (this.onDropCallback) {
      this.onDropCallback(result)
    }

    return result
  }

  /**
   * Process a single file and return its info
   */
  private processFile(filePath: string): DroppedFile | null {
    // Normalize the path for the current platform
    const normalizedPath = path.normalize(filePath)

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      throw new Error('File does not exist')
    }

    // Get file stats
    const stats = fs.statSync(normalizedPath)

    // Check if it's a file (not a directory)
    if (!stats.isFile()) {
      throw new Error('Path is not a file')
    }

    // Check file size
    if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
      throw new Error(`File too large. Maximum size: ${this.formatFileSize(this.options.maxFileSize)}`)
    }

    // Check extension
    const ext = path.extname(normalizedPath).toLowerCase()
    if (this.options.allowedExtensions && this.options.allowedExtensions.length > 0) {
      const normalizedExtensions = this.options.allowedExtensions.map(e => 
        e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
      )
      if (!normalizedExtensions.includes(ext)) {
        throw new Error(`File type not allowed: ${ext}`)
      }
    }

    // Get MIME type based on extension
    const mimeType = this.getMimeType(ext)

    return {
      name: path.basename(normalizedPath),
      path: normalizedPath,
      size: stats.size,
      type: mimeType,
      lastModified: stats.mtimeMs,
    }
  }

  /**
   * Start a drag operation for file export
   */
  startDrag(webContents: WebContents, filePath: string): boolean {
    try {
      const normalizedPath = path.normalize(filePath)
      
      if (!fs.existsSync(normalizedPath)) {
        return false
      }

      webContents.startDrag({
        file: normalizedPath,
        icon: this.getDragIcon(normalizedPath),
      })

      return true
    } catch (error) {
      console.error('Failed to start drag:', error)
      return false
    }
  }

  /**
   * Get an appropriate drag icon for the file
   */
  private getDragIcon(filePath: string): string {
    // Return empty string to use default icon
    // In a real implementation, you might want to generate or use custom icons
    return ''
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(extension: string): string {
    const ext = extension.toLowerCase().replace(/^\./, '')
    
    const mimeTypes: Record<string, string> = {
      // Text
      txt: 'text/plain',
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      js: 'text/javascript',
      json: 'application/json',
      xml: 'application/xml',
      md: 'text/markdown',
      
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      
      // Archives
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      
      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      
      // Video
      mp4: 'video/mp4',
      webm: 'video/webm',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
    }

    return mimeTypes[ext] || 'application/octet-stream'
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Set callback for drop events
   */
  onDrop(callback: (result: DragDropResult) => void): void {
    this.onDropCallback = callback
  }

  /**
   * Remove drop callback
   */
  removeDropCallback(): void {
    this.onDropCallback = null
  }

  /**
   * Update options
   */
  setOptions(options: Partial<DragDropOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Get current options
   */
  getOptions(): DragDropOptions {
    return { ...this.options }
  }

  /**
   * Validate a list of file paths without processing
   */
  validateFiles(filePaths: string[]): { valid: string[]; invalid: { path: string; reason: string }[] } {
    const valid: string[] = []
    const invalid: { path: string; reason: string }[] = []

    for (const filePath of filePaths) {
      try {
        const normalizedPath = path.normalize(filePath)

        if (!fs.existsSync(normalizedPath)) {
          invalid.push({ path: filePath, reason: 'File does not exist' })
          continue
        }

        const stats = fs.statSync(normalizedPath)

        if (!stats.isFile()) {
          invalid.push({ path: filePath, reason: 'Path is not a file' })
          continue
        }

        if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
          invalid.push({ path: filePath, reason: 'File too large' })
          continue
        }

        const ext = path.extname(normalizedPath).toLowerCase()
        if (this.options.allowedExtensions && this.options.allowedExtensions.length > 0) {
          const normalizedExtensions = this.options.allowedExtensions.map(e =>
            e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
          )
          if (!normalizedExtensions.includes(ext)) {
            invalid.push({ path: filePath, reason: `File type not allowed: ${ext}` })
            continue
          }
        }

        valid.push(normalizedPath)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        invalid.push({ path: filePath, reason: errorMessage })
      }
    }

    return { valid, invalid }
  }

  /**
   * Cleanup and remove handlers
   */
  destroy(): void {
    this.mainWindow = null
    this.onDropCallback = null
    
    try {
      ipcMain.removeHandler('drag-drop:process-files')
      ipcMain.removeHandler('drag-drop:start-drag')
    } catch {
      // Handlers may not exist
    }
  }
}

// Export singleton instance
export const dragDropHandler = new DragDropHandler()
