/**
 * 交叉复核探针（只读为主 + A8c 开关夹具）
 * 输出 XCHECK_PASS / XCHECK_FAIL + JSON 证据
 */
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { createCypMemoMcp } from '../src/server.js'
import { loadMcpConfig } from '../src/config.js'
import { mcpError } from '../src/errors.js'
import { matchMemoSelector, matchFileSelector } from '../src/public/selector.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const API = process.env.CYP_MCP_API_BASE || 'https://127.0.0.1:5170/api'
const evidence: Record<string, unknown> = {}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

async function api(
  method: string,
  p: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Idempotency-Key'] = `xcheck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }
  const res = await fetch(`${API.replace(/\/$/, '')}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT ${msg}`)
}

/** 等业务库 mtime 连续静稳，避免夹具防抖落盘误伤 A9 */
async function waitDbQuiet(dbPath: string, quietMs = 3000, maxWaitMs = 60000): Promise<number> {
  let baseline = fs.statSync(dbPath).mtimeMs
  let quietSince = Date.now()
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250))
    const cur = fs.statSync(dbPath).mtimeMs
    if (cur !== baseline) {
      baseline = cur
      quietSince = Date.now()
      continue
    }
    if (Date.now() - quietSince >= quietMs) return baseline
  }
  throw new Error(`db mtime never quiet within ${maxWaitMs}ms`)
}

async function main(): Promise<void> {
  // 设计已对齐：A8 表与 O6 均固定 MCP_NOT_FOUND；MCP_NOT_PUBLIC 仅兼容别名
  evidence.design_A8_aligned_O6 = {
    A8: 'MCP_NOT_FOUND/-32602',
    O6: 'MCP_NOT_FOUND',
    MCP_NOT_PUBLIC_thrown: false,
  }
  assert(mcpError('MCP_FORBIDDEN').code === -32007, 'FORBIDDEN code')
  assert(mcpError('MCP_READ_LAYER_SKIP').code === -32602, 'SKIP code')
  assert(mcpError('MCP_NOT_PUBLIC').code === -32603, 'NOT_PUBLIC code exists')

  // 公开选择器单元（§10.3）
  assert(
    matchMemoSelector({ id: 'a', tags: ['x'], mcpPublic: true }, { mode: 'flag', tags: [], ids: [], requireFlag: true }),
    'flag+public'
  )
  assert(
    !matchMemoSelector({ id: 'a', tags: ['x'], mcpPublic: false }, { mode: 'flag', tags: [], ids: [], requireFlag: true }),
    'flag+private'
  )
  assert(
    matchMemoSelector({ id: 'a', tags: ['pub'], mcpPublic: true }, { mode: 'tag', tags: ['pub'], ids: [], requireFlag: true }),
    'tag hit'
  )
  assert(
    !matchMemoSelector({ id: 'a', tags: ['other'], mcpPublic: true }, { mode: 'tag', tags: ['pub'], ids: [], requireFlag: true }),
    'tag miss'
  )
  assert(
    matchMemoSelector({ id: 'id1', tags: [], mcpPublic: true }, { mode: 'ids', tags: [], ids: ['id1'], requireFlag: true }),
    'ids hit'
  )
  assert(
    !matchMemoSelector({ id: 'id2', tags: [], mcpPublic: true }, { mode: 'ids', tags: [], ids: ['id1'], requireFlag: true }),
    'ids miss'
  )
  assert(!matchMemoSelector({ id: 'a', mcpPublic: true }, { mode: 'none', tags: [], ids: [], requireFlag: true }), 'none')
  assert(
    matchFileSelector({ id: 'f1', filename: 'doc-pub.txt', mcpPublic: true }, { mode: 'tag', tags: ['pub'], ids: [], requireFlag: true }),
    'file tag'
  )
  evidence.selector_unit = true

  const uname = `mcp-xcheck-${Date.now().toString(36)}`
  const pass = `Xc${Date.now().toString(36)}9`
  const reg = await api('POST', '/auth/register', {
    username: uname,
    password: pass,
    securityQuestion: { question: 'q', answer: 'a' },
  })
  assert(reg.status === 200 && reg.json?.success, `register ${JSON.stringify(reg.json)}`)
  const tok = reg.json.data.accessToken as string

  const memo = await api(
    'POST',
    '/memos',
    { title: '交叉复核备忘', content: '全文不应经公开 REST 无层泄露。', tags: ['xcheck'] },
    tok
  )
  assert(memo.json?.data?.id, 'memo')
  const id = memo.json.data.id as string
  await api('PATCH', `/memos/${id}/mcp-public`, { mcpPublic: true }, tok)

  // REST 公开详情是否带 content（相对 O5 max_layer=summary 的旁路）
  const det = await api('GET', `/public/mcp/memos/${id}`)
  evidence.REST_public_detail_has_content = Boolean(det.json?.data?.content)
  evidence.REST_public_content_len = String(det.json?.data?.content || '').length
  evidence.REST_public_has_summary = typeof det.json?.data?.summary === 'string'
  assert(!det.json?.data?.content, 'REST public must not leak full content (O5)')
  assert(
    typeof det.json?.data?.summary === 'string' && det.json.data.summary.length > 0,
    `REST public summary present keys=${Object.keys(det.json?.data || {}).join(',')}`
  )

  // A8c 开关
  const before = await api('GET', '/public/mcp/memos')
  const hitBefore = (before.json?.data?.items || []).some((m: { id: string }) => m.id === id)
  await api('PATCH', `/memos/${id}/mcp-public`, { mcpPublic: false }, tok)
  const afterOff = await api('GET', `/public/mcp/memos/${id}`)
  const listOff = await api('GET', '/public/mcp/memos')
  const hitOff = (listOff.json?.data?.items || []).some((m: { id: string }) => m.id === id)
  await api('PATCH', `/memos/${id}/mcp-public`, { mcpPublic: true }, tok)
  const listOn = await api('GET', '/public/mcp/memos')
  const hitOn = (listOn.json?.data?.items || []).some((m: { id: string }) => m.id === id)
  evidence.A8c = { hitBefore, afterOffStatus: afterOff.status, hitOff, hitOn }
  assert(hitBefore && afterOff.status === 404 && !hitOff && hitOn, 'A8c toggle')

  const db = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server/data/database.sqlite')
  const secLog = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../server/data/logs/security/2026-09-29.log'
  )

  // MCP 公开轨：full 应被 maxLayer 挡住
  process.env.CYP_MCP_API_BASE = API
  const handle = createCypMemoMcp(loadMcpConfig())
  handle.setContext({
    track: 'public',
    subject: 'public',
    token: null,
    maxLayer: 'summary',
    clientName: 'xcheck',
  })
  const srv = handle.createServer()
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'xcheck', version: '2.0.0' })
  await srv.connect(st)
  await client.connect(ct)

  const fullPub: any = await client.callTool({
    name: 'cypmemo_get_memo_full',
    arguments: { memo_id: id },
  })
  const fullText = JSON.stringify(fullPub)
  evidence.public_full_blocked = fullPub?.isError === true || fullText.includes('not found') || fullText.includes('MCP_')
  assert(fullPub?.isError === true || /not found|MCP_/i.test(fullText), 'public full blocked')

  // 选择器接线：ids 白名单不含本夹具 → list 不含、title 报错
  const cfgIds = loadMcpConfig()
  cfgIds.public.memoSelector = { mode: 'ids', tags: [], ids: ['__no_such_id__'], requireFlag: true }
  const handleIds = createCypMemoMcp(cfgIds)
  handleIds.setContext({
    track: 'public',
    subject: 'public',
    token: null,
    maxLayer: 'summary',
    clientName: 'xcheck-ids',
  })
  const srvIds = handleIds.createServer()
  const [ctIds, stIds] = InMemoryTransport.createLinkedPair()
  const clientIds = new Client({ name: 'xcheck-ids', version: '2.0.0' })
  await srvIds.connect(stIds)
  await clientIds.connect(ctIds)
  const listIds: any = await clientIds.callTool({ name: 'cypmemo_list_memos', arguments: {} })
  const listIdsText = JSON.stringify(listIds)
  assert(!listIdsText.includes(id), 'selector ids filters list')
  const titleIds: any = await clientIds.callTool({
    name: 'cypmemo_get_memo_title',
    arguments: { memo_id: id },
  })
  assert(titleIds?.isError === true && JSON.stringify(titleIds).includes('MCP_NOT_FOUND'), 'selector ids blocks get')
  evidence.selector_ids_wired = true
  await clientIds.close()
  await srvIds.close()

  // 选择器接线：tag 白名单不含夹具 tag → list 不含
  const cfgTag = loadMcpConfig()
  cfgTag.public.memoSelector = { mode: 'tag', tags: ['__no_such_tag__'], ids: [], requireFlag: true }
  const handleTag = createCypMemoMcp(cfgTag)
  handleTag.setContext({
    track: 'public',
    subject: 'public',
    token: null,
    maxLayer: 'summary',
    clientName: 'xcheck-tag',
  })
  const srvTag = handleTag.createServer()
  const [ctTag, stTag] = InMemoryTransport.createLinkedPair()
  const clientTag = new Client({ name: 'xcheck-tag', version: '2.0.0' })
  await srvTag.connect(stTag)
  await clientTag.connect(ctTag)
  const listTag: any = await clientTag.callTool({ name: 'cypmemo_list_memos', arguments: {} })
  assert(!JSON.stringify(listTag).includes(id), 'selector tag filters list')
  evidence.selector_tag_wired = true
  await clientTag.close()
  await srvTag.close()

  // 跳层：无 title 直接 full（PAT 轨）
  const pat = await api('POST', '/mcp/pat', { label: 'xcheck' }, tok)
  assert(pat.json?.data?.token, 'pat')
  handle.setContext({
    track: 'full',
    subject: 'pending',
    token: pat.json.data.token,
    maxLayer: 'full',
    clientName: 'xcheck',
  })
  const skip: any = await client.callTool({
    name: 'cypmemo_get_memo_full',
    arguments: { memo_id: id },
  })
  const skipText = JSON.stringify(skip)
  evidence.A4_shape = skipText.slice(0, 400)
  assert(skip?.isError === true && skipText.includes('MCP_READ_LAYER_SKIP'), 'A4 skip reason')
  evidence.A4_strict_reason_in_payload = skipText.includes('MCP_READ_LAYER_SKIP')

  // O4：正规分段至 full 后会话 incomplete，后续 title 仍可查（不抛 MCP_REPORT_REQUIRED）
  await client.callTool({ name: 'cypmemo_get_memo_title', arguments: { memo_id: id } })
  await client.callTool({ name: 'cypmemo_get_memo_summary', arguments: { memo_id: id } })
  const fullOk: any = await client.callTool({
    name: 'cypmemo_get_memo_full',
    arguments: { memo_id: id },
  })
  assert(fullOk?.isError !== true, `O4 full ok ${JSON.stringify(fullOk).slice(0, 200)}`)
  const afterFull: any = await client.callTool({
    name: 'cypmemo_get_memo_title',
    arguments: { memo_id: id },
  })
  const afterText = JSON.stringify(afterFull)
  assert(afterFull?.isError !== true, 'O4 post-full title still allowed')
  assert(!afterText.includes('MCP_REPORT_REQUIRED'), 'O4 must not block with REPORT_REQUIRED')
  evidence.O4_incomplete_nonblock = true

  // 公开文件 blob 门禁（O5：默认 summary 不可直接下 blob）
  const up = await api(
    'POST',
    '/mcp/files/upload-b64',
    {
      filename: 'xcheck-public.txt',
      contentBase64: Buffer.from('hello public file', 'utf8').toString('base64'),
      mimeType: 'text/plain',
      mcpPublic: true,
    },
    tok
  )
  assert(up.status === 200 && up.json?.data?.id, `upload fixture ${JSON.stringify(up.json)}`)
  const fid = up.json.data.id as string
  // 若 create 未落 mcpPublic，再 PATCH
  if (!up.json.data.mcpPublic) {
    await api('PATCH', `/files/${fid}/metadata`, { mcpPublic: true }, tok)
  }
  const blob = await api('GET', `/public/mcp/files/${fid}/blob`)
  evidence.public_blob_gated = { status: blob.status, fileId: fid }
  assert(blob.status === 404, 'public blob gated when max_layer=summary')
  const fileMeta = await api('GET', `/public/mcp/files/${fid}?layer=summary`)
  evidence.public_file_summary = Boolean(fileMeta.json?.data?.summary)
  assert(fileMeta.status === 200 && fileMeta.json?.data?.summary, 'public file summary ok')

  // 禁 passthrough：PAT 直打业务 REST 须 401；换发下游令牌后可读
  const leak = await api('GET', `/memos/${id}`, undefined, pat.json.data.token)
  evidence.pat_passthrough_blocked = leak.status
  assert(leak.status === 401, `PAT must not hit REST ${leak.status}`)
  const ex = await api('POST', '/mcp/exchange', {}, pat.json.data.token)
  assert(ex.status === 200 && String(ex.json?.data?.accessToken || '').startsWith('cypmcpds_'), 'exchange')
  const ds = ex.json.data.accessToken as string
  const viaDs = await api('GET', `/memos/${id}`, undefined, ds)
  assert(viaDs.status === 200 && viaDs.json?.data?.id === id, 'downstream token reads memo')
  evidence.token_exchange = { audience: ex.json.data.audience, dsOk: true }

  // OAuth 2.1 PKCE + DCR
  const meta = await api('GET', '/mcp/oauth/metadata')
  assert(meta.status === 200 && meta.json?.token_endpoint, 'oauth metadata')
  const dcr = await fetch(`${API.replace(/\/$/, '')}/mcp/oauth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `dcr-${Date.now()}`,
    },
    body: JSON.stringify({ redirect_uris: ['http://127.0.0.1/cb'], client_name: 'xcheck' }),
  })
  const dcrJson: any = await dcr.json()
  assert(dcr.status === 201 && dcrJson?.client_id && dcrJson?.client_secret, 'DCR')
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const az = await api(
    'GET',
    `/mcp/oauth/authorize?response_type=code&client_id=${encodeURIComponent(dcrJson.client_id)}&redirect_uri=${encodeURIComponent('http://127.0.0.1/cb')}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256&state=s1`,
    undefined,
    tok
  )
  assert(az.status === 200 && az.json?.data?.code, `authorize ${JSON.stringify(az.json)}`)
  const tokRes = await fetch(`${API.replace(/\/$/, '')}/mcp/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `tok-${Date.now()}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: az.json.data.code,
      redirect_uri: 'http://127.0.0.1/cb',
      client_id: dcrJson.client_id,
      client_secret: dcrJson.client_secret,
      code_verifier: verifier,
    }),
  })
  const tokJson: any = await tokRes.json()
  assert(tokRes.ok && String(tokJson?.access_token || '').startsWith('cypmcpds_'), 'oauth token')
  evidence.oauth = { metadata: true, dcr: true, pkce: true }

  const listed = await client.listResourceTemplates()
  const listedText = JSON.stringify(listed)
  const tmplHit = listedText.includes('cypmemo://memo')
  const fileTmplHit = listedText.includes('cypmemo://file')
  evidence.resource_templates = tmplHit
  evidence.resource_templates_file = fileTmplHit
  assert(tmplHit, `resource templates listed ${listedText.slice(0, 300)}`)
  assert(fileTmplHit, `file resource template listed ${listedText.slice(0, 300)}`)

  // 自起 HTTPS 旁路探针（缺头 / discover / 错版）
  const httpPort = 5180
  process.env.CYP_MCP_HTTP_PORT = String(httpPort)
  const httpHandle = createCypMemoMcp(loadMcpConfig())
  const { startHttp } = await import('../src/transport/http.js')
  await startHttp(httpHandle)
  await new Promise((r) => setTimeout(r, 200))
  const miss = await fetch(`https://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
  })
  const missBody = await miss.text()
  evidence.protocol_missing = { status: miss.status, body: missBody.slice(0, 200) }
  assert(miss.status === 400 && missBody.includes('Missing') && missBody.includes('-32020'), 'missing proto')

  const bad = await fetch(`https://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '1999-01-01',
    },
    body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
  })
  const badBody = await bad.text()
  evidence.protocol_mismatch = { status: bad.status, body: badBody.slice(0, 200) }
  assert(bad.status === 400 && badBody.includes('-32020'), 'protocol mismatch')

  const disc = await fetch(`https://127.0.0.1:${httpPort}/discover`, {
    headers: { 'MCP-Protocol-Version': '2026-07-28' },
  })
  const discJson: any = await disc.json()
  evidence.discover = discJson
  assert(disc.ok && discJson?.protocolVersion === '2026-07-28' && discJson?._meta, 'discover')

  await client.close()
  await srv.close()

  // A9 放到夹具写全部结束后：静稳 → 仅 audit → 业务库 mtime 不变 + security 命中
  const m0 = await waitDbQuiet(db)
  for (let i = 0; i < 8; i++) {
    const a = await api('POST', '/mcp/audit', {
      tier: 'public_query',
      level: 'INFO',
      tool: 'cypmemo_xcheck_probe',
      subject: 'xcheck',
      resultCode: 'ok',
    })
    assert(a.status === 200, `audit ${i} status=${a.status} body=${JSON.stringify(a.json)?.slice(0, 180)}`)
  }
  await new Promise((r) => setTimeout(r, 2000))
  const m1 = fs.statSync(db).mtimeMs
  const secHas =
    fs.existsSync(secLog) &&
    fs.readFileSync(secLog, 'utf8').includes('cypmemo_xcheck_probe')
  evidence.A9_mtime_same = m0 === m1
  evidence.A9_security_log_hit = secHas
  evidence.A9_mtime = { m0, m1 }
  assert(m0 === m1, `A9 mtime ${m0}→${m1}`)
  assert(secHas, 'A9 security log')

  console.log('XCHECK_PASS')
  console.log(JSON.stringify(evidence, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error('XCHECK_FAIL', e)
  console.error(JSON.stringify(evidence, null, 2))
  process.exit(1)
})
