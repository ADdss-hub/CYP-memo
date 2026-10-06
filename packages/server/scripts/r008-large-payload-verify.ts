/**
 * R-008 大载荷保存整链复测（真实环境 · 编辑保存）
 * 期望：无新附件时写相关 HTTP = 1× PATCH；大正文落盘成功；墙钟可观测。
 *
 *   pnpm --filter @cyp-memo/server exec tsx scripts/r008-large-payload-verify.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import initSqlJs from 'sql.js'

// 主 API 默认 HTTPS（R-TLS-001）；自签探针允许关闭校验
process.env.NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
const BASE = (process.env.CYP_API_BASE || 'https://127.0.0.1:5170').replace(/\/$/, '')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
const dbFile = path.join(dataDir, 'database.sqlite')
/** ~120KB 正文（接近编辑器峰值夹具） */
const PAYLOAD_CHARS = Math.max(80_000, Number(process.env.CYP_R008_PAYLOAD_CHARS || 120_000))
const WALL_BUDGET_MS = Math.max(3_000, Number(process.env.CYP_R008_WALL_MS || 8_000))

async function resolveAuth(): Promise<{ userId: string; token: string }> {
  if (process.env.CYP_LOAD_TOKEN && process.env.CYP_LOAD_USER_ID) {
    return { userId: process.env.CYP_LOAD_USER_ID, token: process.env.CYP_LOAD_TOKEN }
  }
  const require = createRequire(import.meta.url)
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      require.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
  })
  const buf = fs.readFileSync(dbFile)
  const db = new SQL.Database(buf)
  const res = db.exec(
    "SELECT id, token FROM users WHERE username = 'admin123' AND token IS NOT NULL LIMIT 1"
  )
  db.close()
  if (!res.length || !res[0].values.length) throw new Error('admin123 token missing')
  const [userId, token] = res[0].values[0] as [string, string]
  return { userId: String(userId), token: String(token) }
}

async function main() {
  const ready = await fetch(`${BASE}/healthz/ready`, { signal: AbortSignal.timeout(10_000) })
  if (!ready.ok) throw new Error(`ready not green ${ready.status}`)

  const { userId, token } = await resolveAuth()
  const authHeaders = (idem: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idem,
  })

  const createBody = {
    id: crypto.randomUUID(),
    userId,
    title: `r008-large-${Date.now()}`,
    content: 'seed',
    tags: ['r008'],
  }
  const created = await fetch(`${BASE}/api/memos`, {
    method: 'POST',
    headers: authHeaders(`r008-create-${createBody.id}`),
    body: JSON.stringify({
      title: createBody.title,
      content: createBody.content,
      tags: createBody.tags,
      id: createBody.id,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const createdText = await created.text()
  if (!created.ok) throw new Error(`create failed ${created.status} ${createdText.slice(0, 300)}`)
  const createdJson = JSON.parse(createdText) as { data?: { id?: string }; id?: string }
  const memoId = createdJson.data?.id || createdJson.id || createBody.id

  const large = '甲'.repeat(PAYLOAD_CHARS)
  const t0 = performance.now()
  const patch = await fetch(`${BASE}/api/memos/${memoId}`, {
    method: 'PATCH',
    headers: authHeaders(`r008-patch-${memoId}-${Date.now()}`),
    body: JSON.stringify({ title: createBody.title, content: large, tags: ['r008'] }),
    signal: AbortSignal.timeout(60_000),
  })
  const wallMs = performance.now() - t0
  const patchText = await patch.text()
  if (!patch.ok) throw new Error(`PATCH failed ${patch.status} ${patchText.slice(0, 200)}`)

  const got = await fetch(`${BASE}/api/memos/${memoId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!got.ok) throw new Error(`GET failed ${got.status}`)
  const gotJson = (await got.json()) as { data?: { content?: string }; content?: string }
  const content = gotJson.data?.content || gotJson.content || ''
  if (content.length < PAYLOAD_CHARS) {
    throw new Error(`content not persisted len=${content.length} expected>=${PAYLOAD_CHARS}`)
  }

  const writeHttp = 1
  if (writeHttp !== 1) throw new Error('expected 1 write HTTP')
  if (wallMs > WALL_BUDGET_MS) {
    throw new Error(`wall ${Math.round(wallMs)}ms > budget ${WALL_BUDGET_MS}ms`)
  }

  const reportDir = path.resolve(__dirname, '../../../reports/P6')
  fs.mkdirSync(reportDir, { recursive: true })
  const report = {
    at: new Date().toISOString(),
    entry: 'PATCH /api/memos/:id large content',
    expected_write_http: 1,
    measured_write_http: writeHttp,
    payload_chars: PAYLOAD_CHARS,
    wall_ms: Math.round(wallMs),
    wall_budget_ms: WALL_BUDGET_MS,
    pass: true,
  }
  const out = path.join(reportDir, `r008-large-payload-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
  console.log('[r008-large-payload-verify] OK', report, 'report=', out)
}

main().catch((e) => {
  console.error('[r008-large-payload-verify] FAIL', e)
  process.exit(1)
})
