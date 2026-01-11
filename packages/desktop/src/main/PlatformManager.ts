/**
 * 平台管理器
 * Manages platform-specific features for Windows, macOS, and Linux
 * 
 * Requirements: 10.2 - Platform-specific features
 */

import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'

export type Platform = 'win32' | 'darwin' | 'linux'

export interface PlatformFeatures {
  supportsTaskbarProgress: boolean
  supportsDockBadge: boolean
  supportsDesktopIntegration: boolean
  supportsNativeNotifications: boolean
}

export interface TaskbarProgress {
  mode: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused'
  value?: number // 0-1 for normal mode
}

export class PlatformManager {
  private platform: Platform
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.platform = process.platform as Platform
  }

  /**
   * Set the main window reference for platform-specific operations
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  /**
   * Get the current platform
   */
  getPlatform(): Platform {
    return this.platform
  }

  /**
   * Get platform-specific features availability
   */
  getFeatures(): PlatformFeatures {
    return {
      supportsTaskbarProgress: this.platform === 'win32',
      supportsDockBadge: this.platform === 'darwin',
      supportsDesktopIntegration: this.platform === 'linux',
      supportsNativeNotifications: true, // All platforms support this
    }
  }

  /**
   * Check if running on Windows
   */
  isWindows(): boolean {
    return this.platform === 'win32'
  }

  /**
   * Check if running on macOS
   */
  isMacOS(): boolean {
    return this.platform === 'darwin'
  }

  /**
   * Check if running on Linux
   */
  isLinux(): boolean {
    return this.platform === 'linux'
  }

  // ============ Windows-specific features ============

  /**
   * Set Windows taskbar progress
   * Only works on Windows
   */
  setTaskbarProgress(progress: TaskbarProgress): boolean {
    if (!this.isWindows() || !this.mainWindow) {
      return false
    }

    try {
      switch (progress.mode) {
        case 'none':
          this.mainWindow.setProgressBar(-1)
          break
        case 'normal':
          if (progress.value !== undefined) {
            // Clamp value between 0 and 1
            const clampedValue = Math.max(0, Math.min(1, progress.value))
            this.mainWindow.setProgressBar(clampedValue)
          }
          break
        case 'indeterminate':
          this.mainWindow.setProgressBar(2, { mode: 'indeterminate' })
          break
        case 'error':
          this.mainWindow.setProgressBar(progress.value ?? 1, { mode: 'error' })
          break
        case 'paused':
          this.mainWindow.setProgressBar(progress.value ?? 1, { mode: 'paused' })
          break
      }
      return true
    } catch (error) {
      console.error('Failed to set taskbar progress:', error)
      return false
    }
  }

  /**
   * Clear Windows taskbar progress
   */
  clearTaskbarProgress(): boolean {
    return this.setTaskbarProgress({ mode: 'none' })
  }

  // ============ macOS-specific features ============

  /**
   * Set macOS Dock badge
   * Only works on macOS
   */
  setDockBadge(text: string): boolean {
    if (!this.isMacOS()) {
      return false
    }

    try {
      app.dock?.setBadge(text)
      return true
    } catch (error) {
      console.error('Failed to set dock badge:', error)
      return false
    }
  }

  /**
   * Clear macOS Dock badge
   */
  clearDockBadge(): boolean {
    return this.setDockBadge('')
  }

  /**
   * Bounce the macOS Dock icon
   * @param type 'critical' for continuous bounce, 'informational' for single bounce
   */
  bounceDock(type: 'critical' | 'informational' = 'informational'): number {
    if (!this.isMacOS()) {
      return -1
    }

    try {
      return app.dock?.bounce(type) ?? -1
    } catch (error) {
      console.error('Failed to bounce dock:', error)
      return -1
    }
  }

  /**
   * Cancel a dock bounce
   */
  cancelDockBounce(id: number): void {
    if (!this.isMacOS() || id < 0) {
      return
    }

    try {
      app.dock?.cancelBounce(id)
    } catch (error) {
      console.error('Failed to cancel dock bounce:', error)
    }
  }

  /**
   * Show/hide the macOS Dock icon
   */
  setDockVisible(visible: boolean): boolean {
    if (!this.isMacOS()) {
      return false
    }

    try {
      if (visible) {
        app.dock?.show()
      } else {
        app.dock?.hide()
      }
      return true
    } catch (error) {
      console.error('Failed to set dock visibility:', error)
      return false
    }
  }

  // ============ Linux-specific features ============

  /**
   * Set Linux desktop entry count badge (Unity/GNOME)
   * This requires the app to have a .desktop file
   */
  setLinuxBadgeCount(count: number): boolean {
    if (!this.isLinux()) {
      return false
    }

    try {
      // Use app.setBadgeCount which works on Linux with Unity launcher
      app.setBadgeCount(count)
      return true
    } catch (error) {
      console.error('Failed to set Linux badge count:', error)
      return false
    }
  }

  /**
   * Clear Linux badge count
   */
  clearLinuxBadgeCount(): boolean {
    return this.setLinuxBadgeCount(0)
  }

  /**
   * Check if Unity launcher integration is available
   */
  hasUnityLauncherIntegration(): boolean {
    if (!this.isLinux()) {
      return false
    }

    // Check for Unity launcher environment
    const desktopSession = process.env.DESKTOP_SESSION || ''
    const xdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP || ''
    
    return (
      desktopSession.toLowerCase().includes('unity') ||
      xdgCurrentDesktop.toLowerCase().includes('unity') ||
      xdgCurrentDesktop.toLowerCase().includes('gnome')
    )
  }

  // ============ Cross-platform badge/progress helpers ============

  /**
   * Set a notification badge count (cross-platform)
   * Uses the appropriate method for each platform
   */
  setBadgeCount(count: number): boolean {
    if (this.isMacOS()) {
      return this.setDockBadge(count > 0 ? String(count) : '')
    } else if (this.isLinux()) {
      return this.setLinuxBadgeCount(count)
    } else if (this.isWindows()) {
      // Windows doesn't have a native badge, but we can use overlay icon
      // For now, return false as overlay icons require custom implementation
      return false
    }
    return false
  }

  /**
   * Clear notification badge (cross-platform)
   */
  clearBadgeCount(): boolean {
    if (this.isMacOS()) {
      return this.clearDockBadge()
    } else if (this.isLinux()) {
      return this.clearLinuxBadgeCount()
    }
    return false
  }

  /**
   * Show progress indicator (cross-platform)
   * Uses taskbar progress on Windows, dock progress on macOS
   */
  setProgress(value: number): boolean {
    if (!this.mainWindow) {
      return false
    }

    try {
      // setProgressBar works on both Windows and macOS
      const clampedValue = Math.max(0, Math.min(1, value))
      this.mainWindow.setProgressBar(clampedValue)
      return true
    } catch (error) {
      console.error('Failed to set progress:', error)
      return false
    }
  }

  /**
   * Clear progress indicator (cross-platform)
   */
  clearProgress(): boolean {
    if (!this.mainWindow) {
      return false
    }

    try {
      this.mainWindow.setProgressBar(-1)
      return true
    } catch (error) {
      console.error('Failed to clear progress:', error)
      return false
    }
  }

  // ============ Platform-specific paths ============

  /**
   * Get the user data directory path
   */
  getUserDataPath(): string {
    return app.getPath('userData')
  }

  /**
   * Get the app data directory path
   */
  getAppDataPath(): string {
    return app.getPath('appData')
  }

  /**
   * Get the documents directory path
   */
  getDocumentsPath(): string {
    return app.getPath('documents')
  }

  /**
   * Get the temp directory path
   */
  getTempPath(): string {
    return app.getPath('temp')
  }

  /**
   * Get the logs directory path
   */
  getLogsPath(): string {
    return app.getPath('logs')
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.mainWindow = null
  }
}

// Export singleton instance
export const platformManager = new PlatformManager()
