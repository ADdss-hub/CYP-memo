/**
 * Batch1 冒烟：配置默认、总开关、HTTP healthz
 */

import { loadMcpConfig } from '../src/config.js'
import { mcpError } from '../src/errors.js'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const cfg = loadMcpConfig()
  assert(cfg.enabled === true, 'default enabled true')
  assert(cfg.cap.query === true, 'default query true')
  assert(cfg.cap.memoWrite === false, 'default memoWrite false')
  assert(cfg.cap.fileWrite === false, 'default fileWrite false')
  assert(cfg.public.maxLayer === 'summary', 'default maxLayer summary')
  assert(cfg.public.memoSelector.mode === 'flag', 'default selector flag')

  const err = mcpError('MCP_DISABLED')
  assert(err.code === -32603, 'MCP_DISABLED code')
  assert(err.toJsonRpc().data.reason === 'MCP_DISABLED', 'reason field')

  const forbid = mcpError('MCP_FORBIDDEN')
  assert(forbid.code === -32007, 'FORBIDDEN -32007')

  // 实机 HTTPS：若已有进程则探活；否则启短暂子进程
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
  const port = cfg.transport.httpPort
  process.env.CYP_MCP_HTTP = '1'
  const { spawn } = await import('node:child_process')
  const child = spawn('pnpm', ['exec', 'tsx', 'src/index.ts', '--http'], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    env: { ...process.env, CYP_MCP_HTTP_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: true,
  })

  await new Promise((r) => setTimeout(r, 2500))

  const health = await fetch(`https://127.0.0.1:${port}/healthz`).then((r) => r.json())
  assert(health.ok === true && health.tls === true, 'healthz ok tls when enabled')

  child.kill()
  console.log('smoke-batch1 PASS')
}

main().catch((e) => {
  console.error('smoke-batch1 FAIL', e)
  process.exit(1)
})
