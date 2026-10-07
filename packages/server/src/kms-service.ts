/**
 * CYP-memo KMS 密钥保险箱 · 独立服务入口
 * 独立进程运行，监听 127.0.0.1:12000
 * 基础设施服务段 12000-12999
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createKmsServer } from './_kms-internal/server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 解析 dataDir 路径（与主服务一致的解析逻辑）
 */
function resolveDataDir(): string {
  // 优先环境变量
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR
  }
  // 锚定 server 包内 data 目录
  const packageDataDir = path.join(__dirname, '..', 'data')
  try {
    if (!fs.existsSync(packageDataDir)) {
      fs.mkdirSync(packageDataDir, { recursive: true })
    }
    return packageDataDir
  } catch {
    // 回退到系统临时目录
    return path.join(process.cwd(), 'data')
  }
}

// 读取配置
const port = Number(process.env.KMS_PORT) || 12000
const host = process.env.KMS_HOST || '127.0.0.1'
const dataDir = resolveDataDir()
const masterKey = process.env.CYP_KMS_MASTER_KEY || null

// CI02 生产基准
process.env.APP_ENV = process.env.APP_ENV || 'prod'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

console.log('='.repeat(60))
console.log('CYP-memo KMS 密钥保险箱 · 独立服务')
console.log('='.repeat(60))
console.log(`APP_ENV:    ${process.env.APP_ENV}`)
console.log(`NODE_ENV:   ${process.env.NODE_ENV}`)
console.log(`Listen:     ${host}:${port}`)
console.log(`DataDir:    ${dataDir}`)
console.log(`AuthToken:  ${process.env.KMS_AUTH_TOKEN ? '已配置' : '未配置（将拒绝所有请求）'}`)
console.log('='.repeat(60))

// 启动服务
const server = createKmsServer({ dataDir, port, host, masterKey })

// 优雅关闭
function shutdown(signal: string): void {
  console.log(`\n[KMS] 收到 ${signal} 信号，正在关闭...`)
  server.close(() => {
    console.log('[KMS] 服务已关闭')
    process.exit(0)
  })
  // 强制退出超时
  setTimeout(() => {
    console.log('[KMS] 强制退出（超时）')
    process.exit(1)
  }, 5000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 未捕获异常
process.on('uncaughtException', (err) => {
  console.error('[KMS] 未捕获异常:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[KMS] 未处理的 Promise 拒绝:', reason)
})
