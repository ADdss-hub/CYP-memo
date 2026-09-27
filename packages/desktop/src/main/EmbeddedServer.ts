/**
 * 内置服务器管理器
 * Manages the embedded Express server for local-only mode
 * 
 * Requirements: 8.3, 8.4
 * G-SYS-02 / CFG-SYS-03: ready = /healthz/ready success===true
 */

import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ServerStatus } from '../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 默认端口
const DEFAULT_PORT = 5170

// 服务器启动超时时间（毫秒）
const SERVER_START_TIMEOUT = 30000

const READY_POLL_INTERVAL_MS = 250

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
    // CFG-SYS-03: prefer DATA_DIR from process env when set
    const envDataDir = (process.env.DATA_DIR || '').trim()
    this.dataDir = envDataDir.length > 0
      ? envDataDir
      : path.join(app.getPath('userData'), 'server-data')
  }

  /**
   * 启动内置服务器
   * 需求 8.3: 在本地端口启动嵌入式 Express 服务器
   * @param port 可选的端口号（显式参数优先；否则 process.env.PORT；否则 DEFAULT_PORT）
   * @returns 实际使用的端口号
   */
  async start(port?: number): Promise<number> {
    if (this.isRunning) {
      console.log('[EmbeddedServer] Server is already running on port', this.port)
      return this.port
    }

    const envPortRaw = (process.env.PORT || '').trim()
    const envPort = envPortRaw ? Number.parseInt(envPortRaw, 10) : NaN
    this.port = port
      ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT)

    // 确保数据目录存在
    this.ensureDataDir()

    return new Promise((resolve, reject) => {
      let settled = false
      let pollTimer: ReturnType<typeof setInterval> | null = null

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (pollTimer) clearInterval(pollTimer)
        fn()
      }

      const timeout = setTimeout(() => {
        settle(() => {
          this.stop()
          reject(new Error('Server start timeout waiting for /healthz/ready'))
        })
      }, SERVER_START_TIMEOUT)

      try {
        // 获取服务器启动入口（dist 优先；联调可回退 tsx src，与 Server 本机路径同源）
        const launch = this.resolveServerLaunch()
        
        if (!launch) {
          settle(() => reject(new Error('Server script not found')))
          return
        }

        console.log('[EmbeddedServer] Starting server:', launch.command, launch.args.join(' '))
        console.log('[EmbeddedServer] Data directory:', this.dataDir)
        console.log('[EmbeddedServer] Port:', this.port)

        // 设置环境变量
        const env = {
          ...process.env,
          PORT: String(this.port),
          DATA_DIR: this.dataDir,
          // CI02：内嵌 server 亦强制生产唯一基准
          APP_ENV: 'prod',
          NODE_ENV: 'production',
          LOG_LEVEL: process.env.LOG_LEVEL || 'info',
          // CI01：与 start-local / compose 同键（可选）
          ...(process.env.CYP_BOOTSTRAP_OWNER_PASSWORD
            ? { CYP_BOOTSTRAP_OWNER_PASSWORD: process.env.CYP_BOOTSTRAP_OWNER_PASSWORD }
            : {}),
          ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
        }

        // 启动服务器进程（cwd 指向 server 包，便于解析依赖）
        this.serverProcess = spawn(launch.command, launch.args, {
          env,
          cwd: launch.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        })

        const serverDir = launch.cwd

        // 监听标准输出（诊断用；就绪以 /healthz/ready 为准）
        this.serverProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString()
          console.log('[EmbeddedServer]', output.trim())
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
          settle(() => {
            reject(new Error(`Server process exited before ready (code=${code}, signal=${signal})`))
          })
        })

        // 监听进程错误
        this.serverProcess.on('error', (error) => {
          console.error('[EmbeddedServer] Failed to start server:', error)
          this.isRunning = false
          this.serverProcess = null
          settle(() => reject(error))
        })

        const probeReady = (): Promise<boolean> =>
          new Promise((resolveProbe) => {
            const req = http.get(
              `http://127.0.0.1:${this.port}/healthz/ready`,
              { timeout: 2000 },
              (res) => {
                let body = ''
                res.on('data', (chunk: Buffer | string) => {
                  body += chunk
                })
                res.on('end', () => {
                  try {
                    const json = JSON.parse(body) as { success?: boolean }
                    resolveProbe(res.statusCode === 200 && json.success === true)
                  } catch {
                    resolveProbe(false)
                  }
                })
              },
            )
            req.on('error', () => resolveProbe(false))
            req.on('timeout', () => {
              req.destroy()
              resolveProbe(false)
            })
          })

        pollTimer = setInterval(() => {
          void (async () => {
            if (settled) return
            const ok = await probeReady()
            if (!ok || settled) return
            settle(() => {
              this.isRunning = true
              this.startTime = new Date()
              console.log('[EmbeddedServer] Server ready (/healthz/ready) on port', this.port)
              void this.logStartupReport(serverDir).finally(() => resolve(this.port))
            })
          })()
        }, READY_POLL_INTERVAL_MS)

      } catch (error) {
        settle(() => {
          console.error('[EmbeddedServer] Error starting server:', error)
          reject(error)
        })
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
   * CFG-SYS-06：ready 后打印与 server buildStartupReportLines 同形摘要（无口令）
   */
  private async logStartupReport(serverDir: string): Promise<void> {
    const fields = {
      port: this.port,
      dataDir: this.dataDir,
      logLevel: process.env.LOG_LEVEL || 'info',
      appEnv: 'prod',
      nodeEnv: 'production' as const,
      version: this.readEmbeddedVersion(serverDir),
      timezone: process.env.TZ || 'Asia/Shanghai',
    }

    try {
      const configJs = path.join(serverDir, 'config.js')
      if (fs.existsSync(configJs)) {
        const mod = (await import(pathToFileURL(configJs).href)) as {
          buildStartupReportLines?: (c: typeof fields) => string[]
          formatStartupReportLine?: (c: typeof fields) => string
        }
        if (typeof mod.buildStartupReportLines === 'function') {
          for (const line of mod.buildStartupReportLines(fields)) {
            console.log('[EmbeddedServer]', line)
          }
          if (typeof mod.formatStartupReportLine === 'function') {
            console.log('[EmbeddedServer]', mod.formatStartupReportLine(fields))
          }
          return
        }
      }
    } catch (err) {
      console.warn('[EmbeddedServer] startup report import failed, using fallback:', err)
    }

    for (const line of [
      '========== 服务器配置 ==========',
      `  环境: ${fields.appEnv}（CI02 生产唯一基准）`,
      `  端口: ${fields.port}`,
      `  数据目录: ${fields.dataDir}`,
      `  日志级别: ${fields.logLevel}`,
      `  Node: ${fields.nodeEnv}`,
      `  版本: ${fields.version}`,
      `  时区: ${fields.timezone}`,
      '================================',
    ]) {
      console.log('[EmbeddedServer]', line)
    }
    console.log(
      `[EmbeddedServer] [CYP-memo startup] env=${fields.appEnv} port=${fields.port} dataDir=${fields.dataDir} logLevel=${fields.logLevel} node=${fields.nodeEnv} version=${fields.version} tz=${fields.timezone}`,
    )
  }

  private readEmbeddedVersion(serverDir: string): string {
    const candidates = [
      path.join(serverDir, 'package.json'),
      path.join(serverDir, '..', 'package.json'),
      path.join(process.cwd(), 'packages', 'server', 'package.json'),
      path.join(process.cwd(), 'package.json'),
    ]
    for (const pkgPath of candidates) {
      try {
        if (!fs.existsSync(pkgPath)) continue
        const version = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version
        if (version) return String(version)
      } catch {
        // try next
      }
    }
    return '0.0.0'
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
   * Electron 主进程内 process.execPath 指向 electron.exe，不能用来拉起 server。
   */
  private resolveNodeBinary(): string {
    if (process.versions.electron) {
      const fromEnv = (process.env.CYP_NODE_BIN || process.env.npm_node_execpath || '').trim()
      if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
      return process.platform === 'win32' ? 'node.exe' : 'node'
    }
    return process.execPath
  }

  /**
   * 解析嵌入服务端启动方式：同一 packages/server，只改载体。
   * 打包态必须用 dist；联调态 dist 优先，否则 tsx src（与 Server 本机联调同源）。
   */
  private resolveServerLaunch(): { command: string; args: string[]; cwd: string } | null {
    const isLocalTooling = !app.isPackaged
    const nodeBin = this.resolveNodeBinary()
    const distCandidates = isLocalTooling
      ? [
          path.join(process.cwd(), 'packages', 'server', 'dist', 'index.js'),
          path.join(process.cwd(), '..', 'server', 'dist', 'index.js'),
          path.join(__dirname, '../../../../server/dist/index.js'),
        ]
      : [
          path.join(process.resourcesPath || '', 'server', 'index.js'),
          path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'server', 'index.js'),
        ]

    for (const serverPath of distCandidates) {
      console.log('[EmbeddedServer] Checking dist:', serverPath)
      if (fs.existsSync(serverPath)) {
        return {
          command: nodeBin,
          args: ['--conditions=cyp-node', serverPath],
          cwd: path.dirname(serverPath),
        }
      }
    }

    if (!isLocalTooling) {
      console.error('[EmbeddedServer] Packaged server dist not found in:', distCandidates)
      return null
    }

    const srcCandidates = [
      path.join(process.cwd(), 'packages', 'server', 'src', 'index.ts'),
      path.join(process.cwd(), '..', 'server', 'src', 'index.ts'),
      path.join(__dirname, '../../../../server/src/index.ts'),
    ]
    const tsxCandidates = [
      path.join(process.cwd(), 'packages', 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(process.cwd(), '..', 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(__dirname, '../../../../server/node_modules/tsx/dist/cli.mjs'),
      path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(__dirname, '../../../../../../node_modules/tsx/dist/cli.mjs'),
    ]

    const src = srcCandidates.find((p) => fs.existsSync(p))
    const tsxCli = tsxCandidates.find((p) => fs.existsSync(p))
    if (src && tsxCli) {
      console.log('[EmbeddedServer] Falling back to tsx src:', src)
      return {
        command: nodeBin,
        args: [tsxCli, src],
        cwd: path.dirname(path.dirname(src)),
      }
    }

    console.error('[EmbeddedServer] Server entry not found. dist=', distCandidates, 'src=', srcCandidates)
    return null
  }

  /** @deprecated 保留给测试；请用 resolveServerLaunch */
  private getServerPath(): string | null {
    const launch = this.resolveServerLaunch()
    if (!launch) return null
    const fileArg = launch.args.find((a) => a.endsWith('.js') || a.endsWith('.ts'))
    return fileArg || null
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
