/**
 * MCP 实机联调冒烟（Batch1–6 关键路径）
 * 依赖本机 API https://127.0.0.1:5170 与 MCP HTTPS :13175
 */

import { loadMcpConfig } from '../src/config.js'
import { mcpError } from '../src/errors.js'
import { buildPurposeSummary } from '../src/summary/purpose.js'
import { extractTextFromBuffer } from '../src/extract/text.js'
import { SegmentSessionStore } from '../src/session/store.js'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function waitOk(url: string, ms = 15000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout waiting ${url}`)
}

async function main(): Promise<void> {
  // —— 本地单元面 ——
  const cfg = loadMcpConfig()
  assert(cfg.enabled && cfg.cap.query && !cfg.cap.memoWrite && !cfg.cap.fileWrite, 'defaults')
  assert(mcpError('MCP_DISABLED').code === -32603, 'disabled code')
  assert(mcpError('MCP_FORBIDDEN').code === -32007, 'forbidden code')
  assert(mcpError('MCP_READ_LAYER_SKIP').code === -32602, 'skip code')

  const purpose = buildPurposeSummary({
    title: '周会纪要',
    tags: ['工作'],
    contentHint: '讨论了项目排期与资源，下周交付试点。前缀不应原样出现。',
  })
  assert(purpose.summary.length <= 50, 'summary <=50')
  assert(!purpose.summary.startsWith('讨论了项目排期'), 'not raw content prefix')

  const extracted = extractTextFromBuffer(Buffer.from('hello mcp\nline2', 'utf8'), 'a.txt', 'text/plain')
  assert(extracted.extractable && extracted.text?.includes('hello'), 'text extract')
  const bin = extractTextFromBuffer(Buffer.from([0, 1, 2, 3]), 'a.bin', 'application/octet-stream')
  assert(!bin.extractable, 'binary not extractable')

  const sess = new SegmentSessionStore({ ttlMs: 60_000, maxEntries: 100 })
  sess.advance('public', 'memo', 'm1', 'title')
  let skipped = false
  try {
    sess.advance('public', 'memo', 'm1', 'full')
  } catch {
    skipped = true
  }
  assert(skipped, 'layer skip')
  sess.advance('public', 'memo', 'm1', 'summary')
  sess.advance('public', 'memo', 'm1', 'full')
  const reported = sess.markReport('public', 'memo', 'm1')
  assert(reported.state === 'report_submitted', 'report')

  // —— API 公开投影 ——
  const apiBase = cfg.api.baseUrl.replace(/\/$/, '')
  await waitOk(`${apiBase}/health`)
  const pub = await fetch(`${apiBase}/public/mcp/memos`).then((r) => r.json())
  assert(pub.success === true, 'public memos')
  const spook = await fetch(`${apiBase}/public/mcp/memos/not-exist-id`)
  assert(spook.status === 404, 'non-public 404')

  // —— MCP HTTP ——
  const port = cfg.transport.httpPort
  const child = spawn('pnpm', ['exec', 'tsx', 'src/index.ts', '--http'], {
    cwd: pkgRoot,
    env: { ...process.env, CYP_MCP_HTTP_PORT: String(port), CYP_MCP_API_BASE: apiBase },
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: true,
  })
  let stderr = ''
  child.stderr?.on('data', (d) => {
    stderr += String(d)
  })
  try {
    await waitOk(`https://127.0.0.1:${port}/healthz`)
    const hz = await fetch(`https://127.0.0.1:${port}/healthz`).then((r) => r.json())
    assert(hz.ok === true && hz.tls === true, 'mcp healthz tls')

    // disabled probe via env child is enabled; check factory with env
    process.env.CYP_MCP_ENABLED = 'false'
    const disabledCfg = loadMcpConfig()
    assert(disabledCfg.enabled === false, 'env disable')
    delete process.env.CYP_MCP_ENABLED

    console.log('mcp-smoke PASS')
    console.log(
      JSON.stringify({
        summaryLen: purpose.summary.length,
        publicItems: pub.data?.items?.length ?? pub.data?.length ?? 0,
        mcpLogTail: stderr.slice(-200),
      })
    )
  } finally {
    child.kill()
  }
}

main().catch((e) => {
  console.error('mcp-smoke FAIL', e)
  process.exit(1)
})
