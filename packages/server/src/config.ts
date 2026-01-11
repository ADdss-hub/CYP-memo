/**
 * CYP-memo 服务器配置模块
 * 实现环境变量读取、默认值定义和配置验证
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

/**
 * 日志级别类型
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 容器配置接口
 */
export interface ContainerConfig {
  // 基础配置
  port: number
  dataDir: string
  logLevel: LogLevel
  
  // 运行时信息
  nodeEnv: 'development' | 'production'
  version: string
  startTime: Date
  
  // 时区配置
  timezone: string
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

/**
 * 获取默认数据目录（跨平台）
 * - Docker/生产环境: /app/data
 * - Windows 开发环境: %LOCALAPPDATA%/cyp-memo/data 或 ./packages/server/data
 * - macOS 开发环境: ~/Library/Application Support/cyp-memo/data 或 ./packages/server/data
 * - Linux 开发环境: ~/.local/share/cyp-memo/data 或 ./packages/server/data
 */
function getDefaultDataDir(): string {
  // 生产环境或 Docker 容器中使用 /app/data
  if (process.env.NODE_ENV === 'production') {
    return '/app/data'
  }
  
  // 开发环境：优先使用项目内的 data 目录
  const projectDataDir = path.join(process.cwd(), 'packages', 'server', 'data')
  
  // 如果项目目录存在或可以创建，使用项目目录
  try {
    if (!fs.existsSync(projectDataDir)) {
      fs.mkdirSync(projectDataDir, { recursive: true })
    }
    return projectDataDir
  } catch {
    // 无法使用项目目录，回退到系统目录
  }
  
  // 回退到系统特定的应用数据目录
  const platform = process.platform
  const homeDir = os.homedir()
  
  if (platform === 'win32') {
    // Windows: 使用 LOCALAPPDATA 或回退到用户目录
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
    return path.join(localAppData, 'cyp-memo', 'data')
  } else if (platform === 'darwin') {
    // macOS: 使用 Application Support
    return path.join(homeDir, 'Library', 'Application Support', 'cyp-memo', 'data')
  } else {
    // Linux 和其他 Unix: 使用 XDG_DATA_HOME 或 ~/.local/share
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share')
    return path.join(xdgDataHome, 'cyp-memo', 'data')
  }
}

/**
 * 默认配置值
 */
const DEFAULT_CONFIG = {
  port: 5170,
  get dataDir() { return getDefaultDataDir() },
  logLevel: 'info' as LogLevel,
  nodeEnv: 'production' as const,
  timezone: 'Asia/Shanghai'
}

/**
 * 验证端口号是否有效
 */
function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigValidationError(`无效的端口号: ${port}，端口必须在 1-65535 之间`)
  }
}

/**
 * 验证日志级别是否有效
 */
function validateLogLevel(level: string): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error']
  if (!validLevels.includes(level as LogLevel)) {
    throw new ConfigValidationError(
      `无效的日志级别: ${level}，有效值为: ${validLevels.join(', ')}`
    )
  }
  return level as LogLevel
}

/**
 * 验证数据目录是否可访问
 * 支持多种 NAS 系统和 Docker 环境
 */
function validateDataDir(dataDir: string): void {
  // 尝试创建目录（如果不存在）
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      throw new ConfigValidationError(
        `无法创建数据目录: ${dataDir}\n` +
        `错误: ${errorMsg}\n\n` +
        `解决方案:\n` +
        `1. 确保宿主机目录存在并有正确权限\n` +
        `2. 使用 PUID 和 PGID 环境变量指定用户 ID\n` +
        `3. 或在宿主机执行: mkdir -p ${dataDir} && chmod 777 ${dataDir}`
      )
    }
  }
  
  // 检查目录是否可写
  try {
    const testFile = path.join(dataDir, '.write-test')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const isPermissionError = errorMsg.includes('EACCES') || errorMsg.includes('permission')
    
    let solution = ''
    if (isPermissionError) {
      solution = `\n\n解决方案:\n` +
        `1. 使用 PUID/PGID 环境变量指定正确的用户 ID:\n` +
        `   docker run -e PUID=1000 -e PGID=1000 ...\n` +
        `2. 或修改宿主机目录权限:\n` +
        `   chmod 777 ${dataDir}\n` +
        `3. 飞牛 NAS 用户请使用 PUID=1000 PGID=1000\n` +
        `4. 群晖 NAS 用户请使用 PUID=1026 PGID=100`
    }
    
    throw new ConfigValidationError(
      `数据目录不可写: ${dataDir}\n` +
      `错误: ${errorMsg}${solution}`
    )
  }
}

/**
 * 读取版本号
 * 支持多种运行环境：开发环境、生产环境、Docker 容器
 */
function readVersion(): string {
  try {
    // 获取可能的 package.json 路径
    const possiblePaths = [
      // 1. 当前工作目录（开发环境）
      path.join(process.cwd(), 'package.json'),
      // 2. 服务器包目录（生产环境，从 dist 目录向上两级）
      path.join(__dirname, '..', 'package.json'),
      // 3. 项目根目录（Docker 容器中）
      path.join(__dirname, '..', '..', '..', 'package.json'),
      // 4. 服务器包目录（直接运行编译后的代码）
      path.join(__dirname, '..', '..', 'package.json'),
    ]
    
    for (const packageJsonPath of possiblePaths) {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (packageJson.version) {
          return packageJson.version
        }
      }
    }
    
    // 尝试从 VERSION 文件读取
    const versionPaths = [
      path.join(process.cwd(), 'VERSION'),
      path.join(__dirname, '..', '..', '..', 'VERSION'),
    ]
    
    for (const versionFilePath of versionPaths) {
      if (fs.existsSync(versionFilePath)) {
        return fs.readFileSync(versionFilePath, 'utf-8').trim()
      }
    }
    
    return '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 获取 __dirname（ESM 兼容）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 从环境变量加载配置
 */
export function loadConfig(): ContainerConfig {
  // 读取环境变量
  const portStr = process.env.PORT
  const dataDir = process.env.DATA_DIR || DEFAULT_CONFIG.dataDir
  const logLevelStr = process.env.LOG_LEVEL || DEFAULT_CONFIG.logLevel
  const nodeEnv = process.env.NODE_ENV === 'development' ? 'development' : 'production'
  const timezone = process.env.TZ || DEFAULT_CONFIG.timezone
  
  // 解析端口号
  const port = portStr ? parseInt(portStr, 10) : DEFAULT_CONFIG.port
  
  // 验证配置
  validatePort(port)
  const logLevel = validateLogLevel(logLevelStr)
  validateDataDir(dataDir)
  
  return {
    port,
    dataDir,
    logLevel,
    nodeEnv,
    version: readVersion(),
    startTime: new Date(),
    timezone
  }
}

/**
 * 格式化配置信息用于日志输出
 */
export function formatConfigInfo(config: ContainerConfig): string {
  const lines = [
    '========== 服务器配置 ==========',
    `  端口: ${config.port}`,
    `  数据目录: ${config.dataDir}`,
    `  日志级别: ${config.logLevel}`,
    `  运行环境: ${config.nodeEnv}`,
    `  版本: ${config.version}`,
    `  时区: ${config.timezone}`,
    '================================'
  ]
  return lines.join('\n')
}

/**
 * 全局配置实例（延迟初始化）
 */
let _config: ContainerConfig | null = null

/**
 * 获取配置实例（单例模式）
 */
export function getConfig(): ContainerConfig {
  if (!_config) {
    _config = loadConfig()
  }
  return _config
}

/**
 * 重置配置（仅用于测试）
 */
export function resetConfig(): void {
  _config = null
}
