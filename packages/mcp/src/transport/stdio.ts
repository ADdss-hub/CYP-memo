/**
 * stdio 传输入口
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createCypMemoMcp } from '../server.js'
import { loadMcpConfig } from '../config.js'
import { resolveContext } from '../auth/context.js'
import { startProductConfigWatcher } from '../product-config-watch.js'

export function startStdio(): void {
  const config = loadMcpConfig()
  const handle = createCypMemoMcp(config)
  // STDIO 默认注入上下文（PAT 经 CYP_MCP_PAT）
  try {
    handle.setContext(resolveContext(config, {}))
  } catch {
    /* keep default */
  }

  console.error(
    `[cyp-memo-mcp] stdio start enabled=${config.enabled} query=${config.cap.query} protocol=${config.protocolVersion}`
  )

  void handle.runtime.audit
    .record({
      tier: 'public_query',
      level: 'INFO',
      tool: 'mcp.selector.snapshot',
      subject: 'public',
      resultCode: 'ok',
      detail: { memoSelector: config.public.memoSelector, fileSelector: config.public.fileSelector },
    })
    .then(() =>
      handle.runtime.api.json('POST', '/mcp/selector-snapshot', {
        after: { memo: config.public.memoSelector, file: config.public.fileSelector },
      })
    )
    .catch(() => undefined)

  startProductConfigWatcher(config, () => {
    handle.syncFromProductFiles()
  })

  serveStdio(() => handle.createServer(), {
    legacy: 'serve',
    onerror: (err) => {
      console.error('[cyp-memo-mcp] stdio error', err.message)
    },
  })
}
