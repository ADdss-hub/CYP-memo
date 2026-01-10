#!/usr/bin/env node
/**
 * CYP-memo 开发环境启动脚本
 * 同时启动用户端和管理员端应用
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

console.log('🚀 启动 CYP-memo 开发环境...\n')

// 启动用户端应用 (端口 5173)
const appProcess = spawn('pnpm', ['--filter', '@cyp-memo/app', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
})

// 启动管理员端应用 (端口 5174)
const adminProcess = spawn('pnpm', ['--filter', '@cyp-memo/admin', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
})

console.log('✅ 用户端应用: http://localhost:5173')
console.log('✅ 管理员端应用: http://localhost:5174\n')

// 处理进程退出
process.on('SIGINT', () => {
  console.log('\n\n🛑 停止开发服务器...')
  appProcess.kill()
  adminProcess.kill()
  process.exit()
})
