/**
 * MCP 旁路仅环回 + 门面反代（不嵌入 MCP Server）
 */
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { createServer as createHttpsServer } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createCypMemoMcp } from '../../mcp/src/server.js'
import { loadMcpConfig } from '../../mcp/src/config.js'
import { startHttp } from '../../mcp/src/transport/http.js'
import { nicIpv4Addresses } from '../../mcp/src/tls/material.js'
import { ensureApiTlsMaterial } from '../src/tls/material.js'
import {
  isMcpProtocolIngress,
  mcpGatewayProxyMiddleware,
} from '../src/runtime-base/l1/host/biz/mcp-proxy.js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.env.CYP_PUBLIC_REQUIRE_TLS = '0'

function httpsReq(
  hostname: string,
  port: number,
  urlPath: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string; ingress: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port,
        path: urlPath,
        method: init?.method || 'GET',
        headers: init?.headers || {},
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c as Buffer))
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            ingress: String(res.headers['x-cyp-mcp-ingress'] || ''),
          })
        )
      }
    )
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('timeout')))
    if (init?.body) req.write(init.body)
    req.end()
  })
}

async function main() {
  const isolated = path.join(os.tmpdir(), `cyp-gw-mcp-${Date.now()}`)
  fs.mkdirSync(isolated, { recursive: true })
  process.env.DATA_DIR = isolated
  process.env.CYP_MCP_HTTP_PORT = '5188'
  process.env.CYP_MCP_ALLOW_LAN = '1'

  const sidecar = createCypMemoMcp(loadMcpConfig())
  await startHttp(sidecar)
  await new Promise((r) => setTimeout(r, 400))

  const loop = await httpsReq('127.0.0.1', 5188, '/healthz')
  if (loop.status !== 200 || !loop.body.includes('"ok":true')) {
    throw new Error(`sidecar loop ${loop.status} ${loop.body}`)
  }
  console.log('SIDECAR_LOOPBACK', loop.status)

  const nic = nicIpv4Addresses().find((ip) => ip !== '127.0.0.1')
  if (nic) {
    let lanFail = false
    try {
      await httpsReq(nic, 5188, '/healthz')
    } catch {
      lanFail = true
    }
    if (!lanFail) throw new Error(`sidecar must not bind LAN ${nic}:5188`)
    console.log('SIDECAR_LAN_REFUSED', nic)
  } else {
    console.log('SIDECAR_LAN_SKIP', 'no nic')
  }

  const tls = await ensureApiTlsMaterial(isolated)
  const mw = mcpGatewayProxyMiddleware()
  const gw = createHttpsServer({ key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2' }, (req, res) => {
    const fakeReq = Object.assign(req, {
      path: String(req.url || '/').split('?')[0],
      originalUrl: req.url || '/',
      ip: req.socket.remoteAddress,
    }) as IncomingMessage & { path: string; originalUrl: string; ip?: string }
    mw(fakeReq as never, res as never, () => {
      res.statusCode = 404
      res.end('not protocol')
    })
  })
  const gwPort = await new Promise<number>((resolve, reject) => {
    gw.listen(0, '127.0.0.1', () => {
      const addr = gw.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('no gw port'))
    })
    gw.on('error', reject)
  })

  const proto = await httpsReq('127.0.0.1', gwPort, '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  if (!proto.body.includes('cypmemo_list_memos') && !proto.body.includes('event: message')) {
    throw new Error(`gateway proxy not MCP ${proto.status} ${proto.body.slice(0, 240)}`)
  }
  if (proto.ingress !== 'gateway-proxy') {
    throw new Error(`missing gateway-proxy header ${proto.ingress}`)
  }
  if (!isMcpProtocolIngress('POST', '/mcp', { 'mcp-protocol-version': '2025-11-25' })) {
    throw new Error('isMcpProtocolIngress POST /mcp')
  }
  console.log('GATEWAY_PROXY_MCP', proto.status, proto.ingress)

  const disc = await httpsReq('127.0.0.1', gwPort, '/mcp/discover', {
    headers: { 'MCP-Protocol-Version': '2026-07-28' },
  })
  if (!disc.body.includes('loopbackBind') || !disc.body.includes('sidecar-packages-mcp')) {
    throw new Error(`discover via gateway ${disc.body.slice(0, 300)}`)
  }
  console.log('GATEWAY_DISCOVER', disc.status)

  gw.close()
  console.log('PASS_MCP_GATEWAY_PROXY')
  process.exit(0)
}

main().catch((e) => {
  console.error('MCP_GATEWAY_PROXY_FAIL', e)
  process.exit(1)
})
