/**
 * 探针：环回 HTTPS 强制协议头 JSON-RPC + A10 禁用
 */
import { createCypMemoMcp } from '../src/server.js'
import { loadMcpConfig } from '../src/config.js'
import { startHttp } from '../src/transport/http.js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

async function rpc(port: number, body: unknown, proto = '2025-11-25') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (proto) headers['MCP-Protocol-Version'] = proto
  return fetch(`https://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function main() {
  process.env.CYP_MCP_HTTP_PORT = '5181'
  delete process.env.CYP_MCP_ENABLED
  const h = createCypMemoMcp(loadMcpConfig())
  await startHttp(h)
  await new Promise((r) => setTimeout(r, 300))

  const miss = await rpc(5181, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '')
  const missBody = await miss.text()
  if (miss.status !== 400 || !missBody.includes('Missing')) throw new Error(`missing proto ${miss.status} ${missBody}`)

  const list = await rpc(5181, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '2025-11-25')
  const listBody = await list.text()
  if (!list.ok || !listBody.includes('cypmemo_list_memos')) throw new Error(`list ${list.status} ${listBody.slice(0, 300)}`)
  if (!listBody.includes('event: message')) throw new Error(`SSE channel missing: ${listBody.slice(0, 200)}`)
  console.log('HTTP_LIST', true)
  console.log('SSE_CHANNEL', true)

  const disc = await fetch('https://127.0.0.1:5181/discover', {
    headers: { 'MCP-Protocol-Version': '2026-07-28' },
  })
  const discJson: any = await disc.json()
  if (
    !disc.ok ||
    discJson?.transports?.sseLegacyIndependent !== false ||
    discJson?.transports?.streamableHttpSseChannel !== true ||
    discJson?.transports?.embeddedInServer !== false ||
    discJson?.transports?.loopbackBind !== true ||
    discJson?.transports?.productGatewayPath !== '/mcp' ||
    discJson?.transports?.deployment !== 'sidecar-packages-mcp'
  ) {
    throw new Error(`discover transports ${JSON.stringify(discJson?.transports)}`)
  }
  console.log('DISCOVER_TRANSPORTS', discJson.transports)

  const legacy = await fetch('https://127.0.0.1:5181/sse')
  const legacyBody = await legacy.text()
  if (legacy.status !== 404 || !legacyBody.includes('MCP_SSE_LEGACY_DISABLED')) {
    throw new Error(`legacy sse ${legacy.status} ${legacyBody}`)
  }
  console.log('SSE_LEGACY_REFUSED', true)

  let envRefuse = false
  process.env.CYP_MCP_SSE_LEGACY = '1'
  try {
    loadMcpConfig()
  } catch (e: any) {
    envRefuse = /CYP_MCP_SSE_LEGACY|refused/i.test(String(e?.message || e))
  }
  delete process.env.CYP_MCP_SSE_LEGACY
  if (!envRefuse) throw new Error('CYP_MCP_SSE_LEGACY=1 must refuse loadMcpConfig')
  console.log('SSE_LEGACY_ENV_REFUSE', true)

  let embedRefuse = false
  process.env.CYP_MCP_EMBED_SERVER = '1'
  try {
    loadMcpConfig()
  } catch (e: any) {
    embedRefuse = /CYP_MCP_EMBED_SERVER|sidecar-only|refused/i.test(String(e?.message || e))
  }
  delete process.env.CYP_MCP_EMBED_SERVER
  if (!embedRefuse) throw new Error('CYP_MCP_EMBED_SERVER=1 must refuse loadMcpConfig')
  console.log('EMBED_SERVER_ENV_REFUSE', true)

  const { nicIpv4Addresses } = await import('../src/tls/material.js')
  const nic = nicIpv4Addresses().find((ip) => ip !== '127.0.0.1')
  if (nic) {
    let lanOpen = false
    try {
      const lan = await fetch(`https://${nic}:5181/healthz`)
      if (lan.ok) lanOpen = true
    } catch {
      lanOpen = false
    }
    if (lanOpen) throw new Error(`sidecar must not listen on LAN ${nic}:5181`)
    console.log('SIDECAR_LAN_REFUSED', nic)
  } else {
    console.log('SIDECAR_LAN_SKIP', 'no nic')
  }

  // 产品入口可反代协议；禁止无 gateway-proxy 头的同进程嵌入
  const apiBase = (process.env.CYP_MCP_API_BASE || 'https://127.0.0.1:5170/api').replace(/\/api\/?$/, '')
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
  try {
    const apiMcp = await fetch(`${apiBase}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    const apiMcpBody = await apiMcp.text()
    const apiLooksLikeMcp =
      apiMcp.ok &&
      (apiMcpBody.includes('cypmemo_list_memos') || apiMcpBody.includes('event: message'))
    const ingress = apiMcp.headers.get('x-cyp-mcp-ingress') || ''
    if (apiLooksLikeMcp && ingress !== 'gateway-proxy') {
      throw new Error(`API must proxy MCP via gateway, not embed: ${apiMcp.status} ${ingress}`)
    }
    console.log('API_MCP_INGRESS', apiMcp.status, ingress || 'skip')
  } catch (e) {
    if (String(e).includes('must proxy')) throw e
    console.log('API_MCP_INGRESS', 'server-down')
  }

  const apiDisc = await fetch(`${apiBase}/discover`, {
    headers: { 'MCP-Protocol-Version': '2026-07-28' },
  }).catch(() => null)
  if (apiDisc && apiDisc.ok) {
    const j: any = await apiDisc.json().catch(() => null)
    if (j?.transports?.streamableHttp === true) {
      throw new Error('API /discover must not advertise MCP streamableHttp')
    }
  }
  console.log('API_NO_MCP_DISCOVER', apiDisc ? apiDisc.status : 'server-down')

  process.env.CYP_MCP_HTTP_PORT = '5182'
  const cfgOff = loadMcpConfig()
  cfgOff.enabled = false
  const hOff = createCypMemoMcp(cfgOff)
  await startHttp(hOff)
  await new Promise((r) => setTimeout(r, 300))
  const off = await rpc(5182, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '2025-11-25')
  const offBody = await off.text()
  if (off.status !== 503 || !offBody.includes('MCP_DISABLED')) throw new Error(`A10 ${off.status} ${offBody}`)
  console.log('A10_HTTP', off.status, 'MCP_DISABLED')

  // 乱版本仍 400
  const bad = await rpc(5181, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '1999-01-01')
  const badBody = await bad.text()
  if (bad.status !== 400 || !badBody.includes('-32020')) throw new Error(`bad proto ${bad.status} ${badBody}`)
  console.log('BAD_PROTO', bad.status)
  process.exit(0)
}

main().catch((e) => {
  console.error('PROBE_FAIL', e)
  process.exit(1)
})
