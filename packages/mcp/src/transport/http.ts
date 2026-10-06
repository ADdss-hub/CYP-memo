/**
 * Streamable HTTP 一律 HTTPS（R-TLS-001）
 * 旁路只绑 127.0.0.1；局域网走产品入口 POST /mcp 反代（运行底座网关中心门面）
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { NodeStreamableHTTPServerTransport, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node'
import type { CypMemoMcpHandle } from '../server.js'
import { isAcceptedProtocolVersion } from '../config.js'
import { resolveContext } from '../auth/context.js'
import { ensureMcpTlsMaterial } from '../tls/material.js'
import { startProductConfigWatcher } from '../product-config-watch.js'

export async function startHttp(handle: CypMemoMcpHandle): Promise<void> {
  const { config } = handle
  const port = config.transport.httpPort
  if (!port || port <= 0) {
    console.error('[cyp-memo-mcp] HTTP disabled (httpPort=0)')
    return
  }

  const host = '127.0.0.1'
  const validateHost = localhostHostValidation()
  const validateOrigin = localhostOriginValidation()
  const tlsMaterial = await ensureMcpTlsMaterial(config.api.baseUrl)

  try {
    await handle.runtime.audit.record({
      tier: 'public_query',
      level: 'INFO',
      tool: 'mcp.selector.snapshot',
      subject: 'public',
      resultCode: 'ok',
      detail: {
        memoSelector: config.public.memoSelector,
        fileSelector: config.public.fileSelector,
      },
    })
    await handle.runtime.api.json('POST', '/mcp/selector-snapshot', {
      after: { memo: config.public.memoSelector, file: config.public.fileSelector },
    })
  } catch {
    /* 启动审计失败不阻断 */
  }

  const onRequest = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return

      const url = new URL(req.url || '/', `https://${req.headers.host || '127.0.0.1'}`)
      if (url.pathname === '/healthz') {
        res.writeHead(config.enabled ? 200 : 503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ok: config.enabled,
          protocol: config.protocolVersion,
          tls: true,
          certSource: tlsMaterial.source,
        }))
        return
      }

      if (url.pathname === '/discover') {
        const proto = String(req.headers['mcp-protocol-version'] || '')
        if (!proto || !isAcceptedProtocolVersion(config, proto)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: {
                code: -32020,
                message: proto ? 'Unsupported MCP-Protocol-Version' : 'Missing MCP-Protocol-Version',
                data: {
                  reason: 'MCP_PROTOCOL_VERSION',
                  expected: config.protocolVersion,
                  accepted: config.acceptedProtocolVersions,
                  ...(proto ? { received: proto } : { missing: true }),
                },
              },
            })
          )
          return
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': config.protocolVersion,
        })
        res.end(
          JSON.stringify({
            protocolVersion: config.protocolVersion,
            serverInfo: { name: 'cyp-memo', version: '2.0.0' },
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true },
            },
            transports: {
              stdio: true,
              streamableHttp: true,
              streamableHttpSseChannel: true,
              sseLegacyIndependent: false,
              embeddedInServer: false,
              loopbackBind: true,
              productGatewayPath: '/mcp',
              productGatewayDiscover: '/mcp/discover',
              deployment: 'sidecar-packages-mcp',
            },
            _meta: {
              'io.modelcontextprotocol/protocolVersion': config.protocolVersion,
            },
          })
        )
        return
      }

      // 旧 HTTP+SSE 独立端点：产品明示不做（任务线 3）
      if (url.pathname === '/sse' || url.pathname.startsWith('/sse/') || url.pathname === '/messages') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              code: -32601,
              message: 'Independent HTTP+SSE transport is not implemented',
              data: {
                reason: 'MCP_SSE_LEGACY_DISABLED',
                use: 'POST /mcp (Streamable HTTP; Accept may include text/event-stream)',
              },
            },
          })
        )
        return
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404).end('not found')
        return
      }

      const proto = String(req.headers['mcp-protocol-version'] || '')
      if (!proto || !isAcceptedProtocolVersion(config, proto)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              code: -32020,
              message: proto ? 'Unsupported MCP-Protocol-Version' : 'Missing MCP-Protocol-Version',
              data: {
                reason: 'MCP_PROTOCOL_VERSION',
                expected: config.protocolVersion,
                accepted: config.acceptedProtocolVersions,
                ...(proto ? { received: proto } : { missing: true }),
              },
            },
          })
        )
        return
      }

      const headers: Record<string, string | string[] | undefined> = { ...req.headers }
      try {
        handle.setContext(resolveContext(config, headers))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: -32001, message: msg, data: { reason: 'MCP_AUTH' } } }))
        return
      }

      if (!config.enabled) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: { code: -32603, message: 'MCP disabled', data: { reason: 'MCP_DISABLED' } },
          })
        )
        return
      }

      const mcpServer = handle.createServer()
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      console.error('[cyp-memo-mcp] http error', err)
      if (!res.headersSent) {
        res.writeHead(500).end('internal error')
      }
    }
  }

  const server = createHttpsServer(
    { key: tlsMaterial.key, cert: tlsMaterial.cert, minVersion: 'TLSv1.2' },
    onRequest
  )

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve())
    server.on('error', reject)
  })

  startProductConfigWatcher(config, () => {
    handle.syncFromProductFiles()
  })

  console.error(
    `[cyp-memo-mcp] Streamable HTTP loopback https://127.0.0.1:${port}/mcp enabled=${config.enabled} tls=${tlsMaterial.source} fp=${tlsMaterial.fingerprint256} lan=product:/mcp`
  )
}
