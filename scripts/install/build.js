#!/usr/bin/env node
/**
 * CYP-memo 构建脚本
 * 唯一产品壳：server + app（VIEW-05 不再构建独立 admin 产品）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..', '..')

console.log('🔨 开始构建 CYP-memo...\n')

try {
  console.log('📦 构建共享库（目标机 node 入口）...')
  execSync('pnpm --filter @cyp-memo/shared build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 共享库构建完成\n')

  console.log('📦 构建服务器...')
  execSync('pnpm --filter @cyp-memo/server build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 服务器构建完成\n')

  console.log('📦 构建应用（唯一产品壳）...')
  execSync('pnpm --filter @cyp-memo/app build', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✅ 应用构建完成\n')

  console.log('🎉 构建完成！')
  console.log('📁 服务器输出: packages/server/dist')
  console.log('📁 应用输出: packages/app/dist')
  console.log('[info] packages/admin 已物理删除（VIEW-05-DEL），不参与产品构建')
} catch (error) {
  console.error('❌ 构建失败:', error.message)
  process.exit(1)
}
