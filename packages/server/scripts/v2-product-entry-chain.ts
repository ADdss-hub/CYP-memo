/**
 * 产品唯一入口 V2：登录态 + 备忘录 + 分享公开访问 + 上传，随后删除夹具。
 * 仅用产品库已有 token，不新建账号。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbFile = path.resolve(__dirname, '../data/database.sqlite')
const BASE = (process.env.CYP_API_BASE || 'https://192.168.10.3:5170').replace(/\/$/, '')

const SQL = await initSqlJs({
  locateFile: (f) =>
    require.resolve(f === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${f}`),
})
const db = new SQL.Database(fs.readFileSync(dbFile))
const res = db.exec(
  "SELECT id, username, token FROM users WHERE token IS NOT NULL AND length(token) > 8 LIMIT 1"
)
db.close()
if (!res.length || !res[0].values.length) {
  throw new Error('product db has no session token; refuse creating a new user')
}
const [userId, username, token] = res[0].values[0] as [string, string, string]
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

async function json(method: string, p: string, body?: unknown) {
  const mutating = method !== 'GET' && method !== 'HEAD'
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      ...auth,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(mutating ? { 'Idempotency-Key': `v2-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => null)
  return { status: r.status, j, headers: r.headers }
}

const health = await fetch(`${BASE}/api/health`)
const csp = health.headers.get('content-security-policy') || ''
const hsts = health.headers.get('strict-transport-security') || ''
const xfo = health.headers.get('x-frame-options') || ''
if (health.status !== 200) throw new Error(`health ${health.status}`)
if (!csp.includes("default-src 'self'")) throw new Error(`CSP missing self: ${csp}`)
if (csp.split(';').some((d) => d.trim().startsWith('connect-src') && d.trim().split(/\s+/).includes('https:'))) {
  throw new Error('CSP still has bare https:')
}
if (!hsts.includes('max-age=')) throw new Error('HSTS missing')
if (xfo !== 'DENY') throw new Error(`XFO ${xfo}`)

const me = await json('GET', `/api/users/${userId}`)
if (me.status !== 200 || !me.j?.success) throw new Error(`auth ${me.status} ${JSON.stringify(me.j)}`)

const memo = await json('POST', '/api/memos', { title: '__cyp_v2_verify__', content: '<p>v2</p>', userId })
const memoId = memo.j?.data?.id as string
if (memo.status !== 200 || !memoId) throw new Error(`memo ${JSON.stringify(memo.j)}`)

const share = await json('POST', '/api/shares', { memoId, userId })
const shareId = share.j?.data?.id as string
if (share.status !== 200 || !shareId) throw new Error(`share ${JSON.stringify(share.j)}`)

const acc = await fetch(`${BASE}/api/public/shares/${shareId}/access`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `v2-acc-${Date.now()}` },
  body: '{}',
})
const accj = await acc.json()
if (!accj?.data?.success) throw new Error(`public share ${JSON.stringify(accj)}`)
const html = String(accj.data.memo?.content || '')
if (html.includes('<script')) throw new Error('share content still has script')

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])
const fd = new FormData()
fd.append('file', new Blob([png], { type: 'image/png' }), 'v2-verify.png')
fd.append('metadata', JSON.stringify({ userId, memoId, filename: 'v2-verify.png', type: 'image/png' }))
const up = await fetch(`${BASE}/api/files`, {
  method: 'POST',
  headers: { ...auth, 'Idempotency-Key': `v2-up-${Date.now()}` },
  body: fd,
})
const upj = await up.json().catch(() => null)
const fileId = upj?.data?.id as string | undefined
if (up.status !== 200 || !fileId) throw new Error(`upload ${up.status} ${JSON.stringify(upj)}`)

await json('DELETE', `/api/files/${fileId}`)
await json('DELETE', `/api/shares/${shareId}`)
await json('DELETE', `/api/memos/${memoId}`)

console.log(
  JSON.stringify(
    {
      ok: true,
      base: BASE,
      username,
      health: health.status,
      hsts: Boolean(hsts),
      xfo,
      memoCreatedThenDeleted: true,
      sharePublicOk: true,
      uploadThenDeleted: true,
    },
    null,
    2
  )
)
console.log('V2_PRODUCT_ENTRY_PASS')
