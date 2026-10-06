/**
 * P1 实机：POST 审核回传 → GET 列表可见；异常触发告警源 mcp
 */
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.CYP_VERIFY_API || 'https://127.0.0.1:5170/api'

async function apiHttps(
  method: string,
  p: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const rid = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const u = new URL(`${BASE}${p}`)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
    headers['Idempotency-Key'] = rid
    headers['X-Request-Id'] = rid
    headers['X-Trace-Id'] = rid
  }
  if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload))
  return await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let json: any = {}
          try {
            json = JSON.parse(raw)
          } catch {
            json = { raw }
          }
          resolve({ status: res.statusCode || 0, json })
        })
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main() {
  const u = `mcp_aud_${Date.now()}`
  const pw = 'McpAud9Aa!'
  await apiHttps('POST', '/auth/register', { username: u, password: pw, confirmPassword: pw })
  const login = await apiHttps('POST', '/auth/login', { username: u, password: pw })
  assert(login.status === 200 && login.json?.data?.accessToken, `login ${login.status}`)
  const tok = login.json.data.accessToken as string

  const marker = `probe_${Date.now()}`
  const post = await apiHttps(
    'POST',
    '/mcp/audit',
    {
      tier: 'public_query',
      tool: 'cypmemo_list_memos',
      subject: 'public',
      resultCode: 'ok',
      level: 'info',
      clientName: marker,
      detail: { probe: marker },
    },
    tok
  )
  assert(post.status === 200 && post.json?.data?.ok === true, `POST ${post.status} ${JSON.stringify(post.json)}`)

  // 观测库落盘有防抖；稍等再查
  await new Promise((r) => setTimeout(r, 2800))

  async function getAudit(qs: string) {
    let last: { status: number; json: any } = { status: 0, json: {} }
    for (let i = 0; i < 4; i++) {
      last = await apiHttps('GET', `/mcp/audit?${qs}`, undefined, tok)
      if (last.status === 200) return last
      await new Promise((r) => setTimeout(r, 800))
    }
    return last
  }

  const get1 = await getAudit('limit=50')
  assert(get1.status === 200, `GET1 ${get1.status} ${JSON.stringify(get1.json)}`)
  const items = (get1.json?.data?.items || []) as {
    tool?: string
    resultCode?: string
    clientName?: string
  }[]
  assert(Array.isArray(items), 'items array')
  const hit = items.some(
    (r) => r.tool === 'cypmemo_list_memos' && r.resultCode === 'ok' && r.clientName === marker
  )
  assert(hit, `expected audit row with marker ${marker}; got ${items.length} items`)

  const getTier = await getAudit('tier=public_query&limit=20')
  assert(getTier.status === 200, `GET tier ${getTier.status} ${JSON.stringify(getTier.json)}`)
  assert(
    (getTier.json.data.items as { tier?: string }[]).every((r) => !r.tier || r.tier === 'public_query'),
    'tier filter'
  )

  const postSkip = await apiHttps(
    'POST',
    '/mcp/audit',
    {
      tier: 'public_query',
      tool: 'cypmemo_get_memo_full',
      subject: 'public',
      resultCode: 'MCP_READ_LAYER_SKIP',
      level: 'warn',
      clientName: marker,
    },
    tok
  )
  assert(postSkip.status === 200, `POST skip ${postSkip.status}`)
  await new Promise((r) => setTimeout(r, 2800))
  const get2 = await getAudit('resultCode=MCP_READ_LAYER_SKIP&limit=20')
  assert(get2.status === 200, `GET2 ${get2.status}`)
  const skipHit = (get2.json.data.items as { resultCode?: string }[]).some(
    (r) => r.resultCode === 'MCP_READ_LAYER_SKIP'
  )
  assert(skipHit, 'skip result visible')

  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data')
  const mcpLogDir = path.join(dataDir, 'logs', 'mcp')
  assert(fs.existsSync(mcpLogDir), 'mcp jsonl dir')
  const files = fs.readdirSync(mcpLogDir).filter((n) => n.startsWith('mcp-audit-') && n.endsWith('.jsonl'))
  assert(files.length >= 1, 'mcp-audit jsonl exists')

  const view = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/views/help/HelpMcpView.vue'),
    'utf8'
  )
  assert(view.includes('审核流水') && view.includes('loadMcpAudit'), 'UI audit panel')
  const logsView = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/views/tenant/TenantLogsView.vue'),
    'utf8'
  )
  assert(logsView.includes('MCP 审核'), 'TenantLogs MCP filter')

  console.log(
    JSON.stringify(
      {
        ok: true,
        steps: ['POST_OK', 'GET_HIT', 'TIER_FILTER', 'POST_SKIP', 'GET_SKIP', 'JSONL', 'UI'],
        items: items.length,
        alerts: (get2.json.data.alerts || []).length,
        user: u,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('[mcp-audit-p1-verify] FAIL', e)
  process.exit(1)
})
