/**
 * 次线核验：PAT 轮换 + 知识样例口径
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
  const u = `pat_rot_${Date.now()}`
  const pw = 'PatRot9Aa!'
  await apiHttps('POST', '/auth/register', { username: u, password: pw, confirmPassword: pw })
  const login = await apiHttps('POST', '/auth/login', { username: u, password: pw })
  assert(login.status === 200 && login.json?.data?.accessToken, `login ${login.status}`)
  const tok = login.json.data.accessToken as string

  const issue = await apiHttps('POST', '/mcp/pat', { label: 'rotate-probe' }, tok)
  assert(issue.status === 200 && issue.json?.data?.token, `issue ${issue.status}`)
  const oldId = issue.json.data.id as string
  const oldToken = issue.json.data.token as string
  assert(String(oldToken).startsWith('cypmcp_'), 'token prefix')

  const rot = await apiHttps('POST', `/mcp/pat/${oldId}/rotate`, {}, tok)
  assert(rot.status === 200 && rot.json?.data?.token, `rotate ${rot.status} ${JSON.stringify(rot.json)}`)
  assert(rot.json.data.rotatedFrom === oldId, 'rotatedFrom')
  assert(rot.json.data.ttlDays === 30, 'ttlDays')
  assert(rot.json.data.label === 'rotate-probe', 'label preserved')
  assert(rot.json.data.token !== oldToken, 'new token different')
  assert(rot.json.data.id !== oldId, 'new id')

  const list = await apiHttps('GET', '/mcp/pat', undefined, tok)
  assert(list.status === 200, `list ${list.status}`)
  const rows = list.json.data as { id: string; revokedAt: string | null; label: string }[]
  const oldRow = rows.find((r) => r.id === oldId)
  const newRow = rows.find((r) => r.id === rot.json.data.id)
  assert(oldRow && oldRow.revokedAt, 'old revoked')
  assert(newRow && !newRow.revokedAt, 'new active')

  const rotAgain = await apiHttps('POST', `/mcp/pat/${oldId}/rotate`, {}, tok)
  assert(rotAgain.status === 400, `rotate revoked expect 400 got ${rotAgain.status}`)

  const help = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/content/helpKnowledge.ts'),
    'utf8'
  )
  assert(help.includes('帮助中心 MCP 页签发'), 'knowledge stdio sample')
  assert(!help.includes('系统设置签发的 MCP'), 'no old settings wording')
  const view = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/views/help/HelpMcpView.vue'),
    'utf8'
  )
  assert(view.includes('rotateMcpPat') && view.includes('有效期 30 天'), 'UI rotate + ttl hint')

  console.log(
    JSON.stringify(
      {
        ok: true,
        steps: ['ISSUE', 'ROTATE', 'LIST', 'ROTATE_REVOKED_400', 'COPY'],
        oldId,
        newId: rot.json.data.id,
        user: u,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('[pat-rotate-verify] FAIL', e)
  process.exit(1)
})
