#!/usr/bin/env node
/**
 * CYP-memo 构建脚本
 * 分别构建用户端、管理员端应用和服务器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

console.log('🔨 开始构建 CYP-memo...\n')

try {
  console.log('📦 构建服务器...')
  execSync('pnpm --filter @cyp-memo/server build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 服务器构建完成\n')

  console.log('📦 构建用户端应用...')
  execSync('pnpm --filter @cyp-memo/app build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 用户端应用构建完成\n')

  console.log('📦 构建管理员端应用...')
  execSync('pnpm --filter @cyp-memo/admin build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 管理员端应用构建完成\n')

  console.log('🎉 所有应用构建完成！')
  console.log('📁 服务器输出: packages/server/dist')
  console.log('📁 用户端输出: packages/app/dist')
  console.log('📁 管理员端输出: packages/admin/dist')
} catch (error) {
  console.error('❌ 构建失败:', error.message)
  process.exit(1)
}
