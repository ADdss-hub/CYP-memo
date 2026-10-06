#!/usr/bin/env node
/**
 * CYP-memo 本机联调启动脚本（生产配置基准 · 唯一入口 :5170）
 * 默认 API 同域静态；热重载请用 pnpm local:hmr
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..', '..')

const isWindows = process.platform === 'win32'
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm'

console.log('启动 CYP-memo 本机联调（生产配置基准 · 唯一入口）...\n')
console.log(`平台: ${process.platform}`)
console.log(`Node: ${process.version}\n`)

const appProcess = spawn(pnpmCmd, ['local:all'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
})

console.log('Product: https://<服务器IP>:5170 （API 同域静态 · CI02）')
console.log('MCP: https://<服务器IP>:5170/mcp （旁路环回同启 · 经产品入口）')
console.log('可选热重载: pnpm local:hmr（:5173，非产品入口）\n')

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
  killProcess(appProcess)
  process.exit(0)
})
process.on('SIGTERM', () => {
  killProcess(appProcess)
  process.exit(0)
})

appProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
