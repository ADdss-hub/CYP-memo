#!/usr/bin/env node
/**
 * CYP-memo MCP 入口
 * --http：仅环回 Streamable HTTP；--stdio / 管道：stdio；默认 TTY 走 HTTP
 */

import { loadMcpConfig } from './config.js'
import { createCypMemoMcp } from './server.js'
import { startStdio } from './transport/stdio.js'
import { startHttp } from './transport/http.js'

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const config = loadMcpConfig()
  const handle = createCypMemoMcp(config)

  const explicitHttp = args.has('--http') || args.has('-h') || process.env.CYP_MCP_HTTP === '1'
  const explicitStdio = args.has('--stdio')

  if (explicitHttp && !explicitStdio) {
    await startHttp(handle)
    return
  }

  if (explicitStdio || !process.stdin.isTTY) {
    startStdio()
    return
  }

  await startHttp(handle)
}

main().catch((err) => {
  console.error('[cyp-memo-mcp] fatal', err)
  process.exit(1)
})
