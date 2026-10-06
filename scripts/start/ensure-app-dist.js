#!/usr/bin/env node
/**
 * 唯一产品入口：确保 packages/app/dist 与源码同步（供 API 同域静态托管）
 * - 缺 dist → 构建
 * - 源码或工作区依赖比 dist 新 → 重建（避免旧壳缺 MCP 等区块）
 * - CYP_FORCE_APP_DIST=1 → 强制重建
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const appRoot = join(root, 'packages', 'app')
const distDir = join(appRoot, 'dist')
const indexHtml = join(distDir, 'index.html')

function maxMtimeMs(dir, filter) {
  let max = 0
  if (!existsSync(dir)) return 0
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name)
      if (name.isDirectory()) {
        if (name.name === 'node_modules' || name.name === 'dist' || name.name === '.vite') continue
        walk(p)
        continue
      }
      if (filter && !filter(name.name)) continue
      try {
        const t = statSync(p).mtimeMs
        if (t > max) max = t
      } catch {
        /* skip */
      }
    }
  }
  walk(dir)
  return max
}

function needsRebuild() {
  if (process.env.CYP_FORCE_APP_DIST === '1') return { yes: true, reason: 'CYP_FORCE_APP_DIST=1' }
  if (!existsSync(indexHtml)) return { yes: true, reason: '缺少 dist/index.html' }

  const distMtime = maxMtimeMs(distDir)
  const srcMtime = Math.max(
    maxMtimeMs(join(appRoot, 'src')),
    maxMtimeMs(join(appRoot), (n) =>
      ['index.html', 'vite.config.ts', 'vite.config.js', 'package.json', 'tsconfig.json'].includes(n)
    ),
    maxMtimeMs(join(root, 'packages', 'shared', 'src'))
  )
  if (srcMtime > distMtime + 500) {
    return {
      yes: true,
      reason: `源码较新（src ${new Date(srcMtime).toISOString()} > dist ${new Date(distMtime).toISOString()}）`,
    }
  }
  return { yes: false, reason: 'dist 已与源码对齐' }
}

const check = needsRebuild()
if (!check.yes) {
  console.log(`[ensure-app-dist] ${check.reason}`)
  process.exit(0)
}

console.log(`[ensure-app-dist] 需要构建：${check.reason}`)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const r = spawnSync(pnpm, ['--filter', '@cyp-memo/app', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
})
process.exit(r.status ?? 1)
