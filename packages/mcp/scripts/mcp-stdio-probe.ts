/**
 * stdio 真连探针：StdioClientTransport 起子进程 → initialize → tools/list
 */
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const mcpRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const tsxCli = require.resolve('tsx/cli')

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, 'src/index.ts', '--stdio'],
    cwd: mcpRoot,
    env: {
      ...process.env,
      CYP_MCP_API_BASE: process.env.CYP_MCP_API_BASE || 'https://127.0.0.1:5170/api',
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
    },
    stderr: 'pipe',
  })

  let stderr = ''
  transport.stderr?.on('data', (b: Buffer | string) => {
    stderr += String(b)
  })

  const client = new Client({ name: 'stdio-probe', version: '2.0.0' })
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    const names = (listed.tools || []).map((t) => t.name)
    const okStart = /stdio start|\[cyp-memo-mcp\] stdio/i.test(stderr)
    const hasList = names.includes('cypmemo_list_memos')
    const noWrite = !names.includes('cypmemo_create_memo')

    if (!okStart || !hasList || !noWrite) {
      console.error('STDIO_PROBE_FAIL', {
        okStart,
        hasList,
        noWrite,
        names: names.slice(0, 20),
        stderr: stderr.slice(0, 600),
      })
      process.exit(1)
    }

    console.log('STDIO_PROBE_PASS')
    console.log(
      JSON.stringify({
        started: true,
        toolsCount: names.length,
        hasList,
        noWrite,
        snip: stderr.trim().slice(0, 160),
      })
    )
    process.exit(0)
  } finally {
    try {
      await client.close()
    } catch {
      /* ignore */
    }
    try {
      await transport.close()
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error('STDIO_PROBE_FAIL', e)
  process.exit(1)
})
