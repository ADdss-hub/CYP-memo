/**
 * 内置服务器管理器
 * Manages the embedded Express server for local-only mode
 * 
 * Requirements: 8.3, 8.4
 */

import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { ServerStatus } from '../shared/types.js'

// 默认端口
const DEFAULT_PORT = 5170

// 服务器启动超时时间（毫秒）
const SERVER_START_TIMEOUT = 30000

/**
 * 内置服务器类
 * 需求 8.3: 在本地端口启动嵌入式 Express 服务器
 * 需求 8.4: 将所有数据存储在本地应用数据目录中
 */
export class EmbeddedServer {
  private serverProcess: ChildProcess | null = null
  private port: number = DEFAULT_PORT
  private startTime: Date | null = null
  private dataDir: string
  private isRunning = false

  constructor() {
    // 需求 8.4: 数据存储在本地应用数据目录
    this.dataDir = path.join(app.getPath('userData'), 'server-data')
  }

  /**
   * 启动内置服务器
   * 需求 8.3: 在本地端口启动嵌入式 Express 服务器
   * @param port 可选的端口号
   * @returns 实际使用的端口号
   */
  async start(port?: number): Promise<number> {
    if (this.isRunning) {
      console.log('[EmbeddedServer] Server is already running on port', this.port)
      return this.port
    }

    this.port = port || DEFAULT_PORT

    // 确保数据目录存在
    this.ensureDataDir()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stop()
        reject(new Error('Server start timeout'))
      }, SERVER_START_TIMEOUT)

      try {
        // 获取服务器脚本路径
        const serverPath = this.getServerPath()
        
        if (!serverPath) {
          clearTimeout(timeout)
          reject(new Error('Server script not found'))
          return
        }

        console.log('[EmbeddedServer] Starting server from:', serverPath)
        console.log('[EmbeddedServer] Data directory:', this.dataDir)

        // 获取服务器目录（用于设置工作目录，以便找到 node_modules）
        const serverDir = path.dirname(serverPath)

        // 设置环境变量
        const env = {
          ...process.env,
          PORT: String(this.port),
          DATA_DIR: this.dataDir,
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
        }

        // 启动服务器进程
        // 设置 cwd 为服务器目录，以便正确解析 node_modules
        this.serverProcess = spawn('node', [serverPath], {
          env,
          cwd: serverDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        })

        // 监听标准输出
        this.serverProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString()
          console.log('[EmbeddedServer]', output.trim())

          // 检测服务器是否成功启动
          if (output.includes('服务器运行在') || output.includes('listening')) {
            clearTimeout(timeout)
            this.isRunning = true
            this.startTime = new Date()
            console.log('[EmbeddedServer] Server started successfully on port', this.port)
            resolve(this.port)
          }
        })

        // 监听标准错误
        this.serverProcess.stderr?.on('data', (data: Buffer) => {
          console.error('[EmbeddedServer] Error:', data.toString().trim())
        })

        // 监听进程退出
        this.serverProcess.on('exit', (code, signal) => {
          console.log(`[EmbeddedServer] Server process exited with code ${code}, signal ${signal}`)
          this.isRunning = false
          this.serverProcess = null
          this.startTime = null
        })

        // 监听进程错误
        this.serverProcess.on('error', (error) => {
          clearTimeout(timeout)
          console.error('[EmbeddedServer] Failed to start server:', error)
          this.isRunning = false
          this.serverProcess = null
          reject(error)
        })

      } catch (error) {
        clearTimeout(timeout)
        console.error('[EmbeddedServer] Error starting server:', error)
        reject(error)
      }
    })
  }

  /**
   * 停止内置服务器
   */
  async stop(): Promise<void> {
    if (!this.serverProcess) {
      console.log('[EmbeddedServer] Server is not running')
      return
    }

    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve()
        return
      }

      // 设置超时强制终止
      const forceKillTimeout = setTimeout(() => {
        if (this.serverProcess) {
          console.log('[EmbeddedServer] Force killing server process')
          this.serverProcess.kill('SIGKILL')
        }
      }, 5000)

      this.serverProcess.on('exit', () => {
        clearTimeout(forceKillTimeout)
        this.isRunning = false
        this.serverProcess = null
        this.startTime = null
        console.log('[EmbeddedServer] Server stopped')
        resolve()
      })

      // 发送终止信号
      console.log('[EmbeddedServer] Stopping server...')
      this.serverProcess.kill('SIGTERM')
    })
  }

  /**
   * 获取服务器状态
   */
  getStatus(): ServerStatus {
    return {
      running: this.isRunning,
      port: this.port,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0,
    }
  }

  /**
   * 获取服务器 URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`
  }

  /**
   * 获取数据目录路径
   * 需求 8.4: 数据存储在本地应用数据目录
   */
  getDataDir(): string {
    return this.dataDir
  }

  /**
   * 检查服务器是否正在运行
   */
  isServerRunning(): boolean {
    return this.isRunning
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
      console.log('[EmbeddedServer] Created data directory:', this.dataDir)
    }

    // 确保 uploads 子目录存在
    const uploadsDir = path.join(this.dataDir, 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }
  }

  /**
   * 获取服务器脚本路径
   */
  private getServerPath(): string | null {
    const isDev = !app.isPackaged
    
    // 可能的服务器脚本位置
    const possiblePaths = isDev ? [
      // 开发模式：从 packages/server/dist 加载
      path.join(process.cwd(), 'packages', 'server', 'dist', 'index.js'),
      // 相对于当前模块 (dist/main/main/)
      path.join(__dirname, '../../../../server/dist/index.js'),
    ] : [
      // 打包后：从 resources 目录加载
      path.join(process.resourcesPath || '', 'server', 'index.js'),
      // 备用：app.asar.unpacked 中的服务器
      path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'server', 'index.js'),
    ]

    for (const serverPath of possiblePaths) {
      console.log('[EmbeddedServer] Checking path:', serverPath)
      if (fs.existsSync(serverPath)) {
        return serverPath
      }
    }

    console.error('[EmbeddedServer] Server script not found in any of:', possiblePaths)
    return null
  }
}

// 单例实例
let embeddedServer: EmbeddedServer | null = null

/**
 * 获取内置服务器实例
 */
export function getEmbeddedServer(): EmbeddedServer {
  if (!embeddedServer) {
    embeddedServer = new EmbeddedServer()
  }
  return embeddedServer
}

/**
 * 重置内置服务器（仅用于测试）
 */
export function resetEmbeddedServer(): void {
  if (embeddedServer) {
    embeddedServer.stop()
  }
  embeddedServer = null
}
