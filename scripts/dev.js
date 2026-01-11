#!/usr/bin/env node
/**
 * CYP-memo 开发环境启动脚本
 * 同时启动用户端和管理员端应用
 * 支持 Windows、macOS、Linux 跨平台运行
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

// 检测平台
const isWindows = process.platform === 'win32'

// Windows 上需要使用 pnpm.cmd，Unix 系统使用 pnpm
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm'

console.log('🚀 启动 CYP-memo 开发环境...\n')
console.log(`📍 平台: ${process.platform}`)
console.log(`📍 Node: ${process.version}\n`)

// 启动用户端应用 (端口 5173)
const appProcess = spawn(pnpmCmd, ['--filter', '@cyp-memo/app', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows, // Windows 需要 shell，Unix 不需要
})

// 启动管理员端应用 (端口 5174)
const adminProcess = spawn(pnpmCmd, ['--filter', '@cyp-memo/admin', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
})

console.log('✅ 用户端应用: http://localhost:5173')
console.log('✅ 管理员端应用: http://localhost:5174\n')

// 跨平台进程终止函数
function killProcess(proc) {
  if (!proc) return
  
  if (isWindows) {
    // Windows: 使用 taskkill 强制终止进程树
    try {
      spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true })
    } catch {
      proc.kill()
    }
  } else {
    // Unix: 发送 SIGTERM 信号
    proc.kill('SIGTERM')
  }
}

// 处理进程退出 (SIGINT: Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n🛑 停止开发服务器...')
  killProcess(appProcess)
  killProcess(adminProcess)
  process.exit(0)
})

// Windows 不支持 SIGTERM，但 Unix 系统需要处理
if (!isWindows) {
  process.on('SIGTERM', () => {
    console.log('\n\n🛑 收到终止信号，停止开发服务器...')
    killProcess(appProcess)
    killProcess(adminProcess)
    process.exit(0)
  })
}

// 处理子进程错误
appProcess.on('error', (err) => {
  console.error('❌ 用户端应用启动失败:', err.message)
})

adminProcess.on('error', (err) => {
  console.error('❌ 管理员端应用启动失败:', err.message)
})
