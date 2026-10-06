/**
 * CYP-memo · 唯一产品入口 + MCP 旁路同启 + KMS 独立服务（规则 24.21 / R-018）
 * - API :5170（同域静态）
 * - MCP HTTPS :13175 仅 127.0.0.1（sidecar，不嵌入 server；局域网走 :5170/mcp）
 * - KMS :12000 仅 127.0.0.1（密钥保险箱独立服务，配置 KMS_AUTH_TOKEN 后启用）
 * CI02：APP_ENV=prod / NODE_ENV=production
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const isWin = process.platform === 'win32'
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm'

process.env.APP_ENV = process.env.APP_ENV || 'prod'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'
if (!process.env.CYP_MCP_API_BASE) {
  process.env.CYP_MCP_API_BASE = 'https://127.0.0.1:5170/api'
}

/** @type {import('node:child_process').ChildProcess[]} */
const children = []
let shuttingDown = false

function start(name, args) {
  const child = spawn(pnpmCmd, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
    windowsHide: true,
  })
  children.push(child)
  const tag = `[${name}] `
  child.stdout?.on('data', (buf) => {
    process.stdout.write(tag + String(buf).replace(/\n/g, `\n${tag}`))
  })
  child.stderr?.on('data', (buf) => {
    process.stderr.write(tag + String(buf).replace(/\n/g, `\n${tag}`))
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`${tag}exited code=${code} signal=${signal || ''}`)
    shutdown(code && code !== 0 ? code : 1)
  })
  return child
}

function killOne(child) {
  if (!child || child.exitCode !== null) return
  try {
    if (isWin && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        shell: true,
        stdio: 'ignore',
        windowsHide: true,
      })
    } else {
      child.kill('SIGTERM')
    }
  } catch {
    /* ignore */
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) killOne(c)
  setTimeout(() => process.exit(code), 200).unref()
}

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))

console.log('[local:all] co-start api:5170 + mcp loopback:13175 (sidecar, APP_ENV=prod)')
start('api', ['local:server'])
start('mcp', ['mcp:local'])

// KMS 独立服务：仅在配置 KMS_AUTH_TOKEN 后启用
const kmsAuthToken = process.env.KMS_AUTH_TOKEN || ''
if (kmsAuthToken && kmsAuthToken.length > 0) {
  console.log('[local:all] KMS 独立服务已启用（端口 12000，East-West Token 认证）')
  start('kms', ['local:kms'])
} else {
  console.log('[local:all] KMS 使用嵌入式模式（未配置 KMS_AUTH_TOKEN，跳过独立服务启动）')
}
