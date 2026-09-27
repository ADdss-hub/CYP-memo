#!/usr/bin/env node
/**
 * CYP-memo 本机联调启动脚本（生产配置基准）
 * 唯一产品壳：仅启动 app（VIEW-05 废止 5174 第二产品）
 * 支持 Windows、macOS、Linux 跨平台运行
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

const isWindows = process.platform === 'win32'
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm'

console.log('🚀 启动 CYP-memo 本机联调（生产配置基准）...\n')
console.log(`📍 平台: ${process.platform}`)
console.log(`📍 Node: ${process.version}\n`)

const appProcess = spawn(pnpmCmd, ['--filter', '@cyp-memo/app', 'local'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
})

console.log('✅ 应用: http://localhost:5173')
console.log('[info] 用户运维入口：登录后侧栏「用户」分区（/tenant*）\n')

function killProcess(proc) {
  if (!proc) return
  if (isWindows) {
    try {
      spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true })
    } catch {
      proc.kill()
    }
  } else {
    proc.kill('SIGTERM')
  }
}

process.on('SIGINT', () => {
  console.log('\n\n🛑 停止本机联调...')
  killProcess(appProcess)
  process.exit(0)
})

if (!isWindows) {
  process.on('SIGTERM', () => {
    console.log('\n\n🛑 收到终止信号，停止本机联调...')
    killProcess(appProcess)
    process.exit(0)
  })
}

appProcess.on('error', (err) => {
  console.error('❌ 应用启动失败:', err.message)
})
