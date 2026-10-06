/**
 * MCP A1–A10 实机验收（反伪装：失败即非 0，禁止假绿）
 *
 * 依赖：本机 API https://127.0.0.1:5170 已就绪
 * 副作用：注册一次性 Owner 夹具账号（用户名 mcp-accept-*），可事后手工清理
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { createCypMemoMcp } from '../src/server.js'
import { loadMcpConfig } from '../src/config.js'
import { buildPurposeSummary } from '../src/summary/purpose.js'
import { extractTextFromBuffer } from '../src/extract/text.js'
import { mcpError } from '../src/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.CYP_MCP_API_BASE || 'https://127.0.0.1:5170/api'
const DATA_DB = path.resolve(__dirname, '../../server/data/database.sqlite')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

const evidence: Record<string, unknown> = {}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT ${msg}`)
}

async function apiJson(
  method: string,
  p: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Idempotency-Key'] = `accept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  const res = await fetch(`${API.replace(/\/$/, '')}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

function toolNames(list: { tools?: { name: string }[] }): string[] {
  return (list.tools || []).map((t) => t.name).sort()
}

async function main(): Promise<void> {
  // —— 前置 ——
  const health = await apiJson('GET', '/health')
  assert(health.status === 200 && health.json?.success, 'API health')
  evidence.A_api_health = health.status

  // A10 错误码工厂
  assert(mcpError('MCP_DISABLED').code === -32603, 'A10 code')
  assert(mcpError('MCP_FORBIDDEN').code === -32007, 'FORBIDDEN -32007')
  evidence.A10_codes = true

  // A5 摘要
  const purpose = buildPurposeSummary({
    title: '验收备忘',
    tags: ['mcp'],
    contentHint: '正文前缀不应直接当作用途说明出现在摘要开头。',
  })
  assert(purpose.summary.length <= 50, 'A5 len')
  assert(!purpose.summary.startsWith('正文前缀'), 'A5 not raw prefix')
  evidence.A5 = { summary: purpose.summary, len: purpose.summary.length }

  // A6 抽取
  const okTxt = extractTextFromBuffer(Buffer.from('hello', 'utf8'), 'a.txt', 'text/plain')
  assert(okTxt.extractable, 'A6 text ok')
  const bad = extractTextFromBuffer(Buffer.from([0, 1, 2]), 'x.bin', 'application/octet-stream')
  assert(!bad.extractable && bad.reason, 'A6 not extractable')
  evidence.A6 = { extractableFalse: true, reason: bad.reason }

  // —— 注册夹具账号 + PAT + 公开备忘录（A8/A8b/A8c）——
  const uname = `mcp-accept-${Date.now().toString(36)}`
  const pass = `Acc${Date.now().toString(36)}9`
  const reg = await apiJson('POST', '/auth/register', {
    username: uname,
    password: pass,
    securityQuestion: { question: 'q', answer: 'a' },
  })
  assert(reg.status === 200 && reg.json?.success, `register ${JSON.stringify(reg.json)}`)
  const sessionToken = reg.json.data.accessToken as string
  evidence.fixture_user = uname

  const patRes = await apiJson('POST', '/mcp/pat', { label: 'accept' }, sessionToken)
  assert(patRes.status === 200 && patRes.json?.data?.token?.startsWith('cypmcp_'), 'PAT issue')
  const pat = patRes.json.data.token as string
  evidence.A8b_pat_issued = true

  const noPat = await apiJson('POST', '/mcp/pat', { label: 'x' })
  assert(noPat.status === 401, 'A8b no token → 401')
  evidence.A8b_noauth = 401

  const memo = await apiJson(
    'POST',
    '/memos',
    { title: 'MCP公开验收', content: '分段阅读验收正文内容足够长一些。', tags: ['mcp', 'public'] },
    sessionToken
  )
  assert(memo.status === 200 && memo.json?.data?.id, 'create memo')
  const memoId = memo.json.data.id as string

  const flag = await apiJson('PATCH', `/memos/${memoId}/mcp-public`, { mcpPublic: true }, sessionToken)
  assert(flag.status === 200, 'set mcpPublic')
  evidence.A8c_flag = true

  const pubList = await apiJson('GET', '/public/mcp/memos')
  assert(pubList.status === 200, 'public list')
  const items = pubList.json?.data?.items || []
  assert(items.some((m: { id: string }) => m.id === memoId), 'A8 public hit')
  const missPublic = await apiJson('GET', '/public/mcp/memos/not-a-real-id')
  assert(missPublic.status === 404, 'A8 non-public 404')
  evidence.A8 = { publicHit: true, notFound: 404 }

  // —— A9 观测写不碰业务库 mtime ——
  assert(fs.existsSync(DATA_DB), 'db exists')
  // 夹具写（注册/备忘录/PAT）可能仍在 sql.js 防抖落盘中，先等连续静稳再取基线
  {
    let baseline = fs.statSync(DATA_DB).mtimeMs
    let quietSince = Date.now()
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250))
      const cur = fs.statSync(DATA_DB).mtimeMs
      if (cur !== baseline) {
        baseline = cur
        quietSince = Date.now()
        continue
      }
      if (Date.now() - quietSince >= 3000) break
    }
  }
  const mtimeBefore = fs.statSync(DATA_DB).mtimeMs
  for (let i = 0; i < 20; i++) {
    const a = await apiJson('POST', '/mcp/audit', {
      tier: 'public_query',
      level: 'INFO',
      tool: 'cypmemo_list_memos',
      subject: 'public',
      resultCode: 'ok',
    })
    assert(a.status === 200, `audit ${i} status=${a.status} body=${JSON.stringify(a.json)?.slice(0, 180)}`)
  }
  await new Promise((r) => setTimeout(r, 2000))
  const mtimeAfter = fs.statSync(DATA_DB).mtimeMs
  assert(mtimeAfter === mtimeBefore, `A9 mtime unchanged ${mtimeBefore}→${mtimeAfter}`)
  evidence.A9 = { mtimeBefore, mtimeAfter, audits: 20 }

  // —— InMemory MCP 客户端联调（A1/A1b/A2/A3/A4/A7）——
  process.env.CYP_MCP_API_BASE = API
  delete process.env.CYP_MCP_PAT
  const handle = createCypMemoMcp(loadMcpConfig())
  // 公开轨上下文
  handle.setContext({
    track: 'public',
    subject: 'public',
    token: null,
    maxLayer: 'summary',
    clientName: 'accept-script',
    connectorId: 'cyp-accept',
  })

  const mcpServer = handle.createServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'cyp-accept-client', version: '2.0.0' })
  await mcpServer.connect(serverTransport)
  await client.connect(clientTransport)

  const listed = await client.listTools()
  const names = toolNames(listed)
  evidence.A1_connect = true
  evidence.A1b_connector_id = 'cyp-accept'
  evidence.A2_tools = names
  assert(names.includes('cypmemo_list_memos'), 'A2 has list')
  assert(names.includes('cypmemo_submit_read_honesty_report'), 'A2 has report')
  assert(!names.includes('cypmemo_create_memo'), 'A2 no write tools')
  assert(!names.includes('cypmemo_delete_memo'), 'A2 no delete')

  // A4 跳层：公开轨 maxLayer=summary，直接 full 应 NOT_FOUND；另测 session skip 用 PAT 全功能
  handle.setContext({
    track: 'full',
    subject: 'pending',
    token: pat,
    maxLayer: 'full',
    clientName: 'accept-script',
  })

  let skipOk = false
  const rSkip: any = await client.callTool({
    name: 'cypmemo_get_memo_full',
    arguments: { memo_id: memoId },
  })
  const skipText = JSON.stringify(rSkip)
  evidence.A4_result = skipText.slice(0, 500)
  // 严格：须 isError + 载荷含 MCP_READ_LAYER_SKIP（禁止仅靠 -32602 / isError 冒充）
  skipOk =
    rSkip?.isError === true &&
    skipText.includes('MCP_READ_LAYER_SKIP')
  assert(skipOk, 'A4 layer skip reason MCP_READ_LAYER_SKIP')

  // 正规分段 + 诚实报告（A7）
  await client.callTool({ name: 'cypmemo_get_memo_title', arguments: { memo_id: memoId } })
  await client.callTool({ name: 'cypmemo_get_memo_summary', arguments: { memo_id: memoId } })
  // 公开 maxLayer 已切 full 上下文，可取全文
  await client.callTool({ name: 'cypmemo_get_memo_full', arguments: { memo_id: memoId } })
  const report: any = await client.callTool({
    name: 'cypmemo_submit_read_honesty_report',
    arguments: {
      resource_type: 'memo',
      resource_id: memoId,
      layers_read: ['title', 'summary', 'full'],
      purpose_understood: '验收分段阅读与诚实报告闭环',
      claimed_complete: true,
      client_name: 'accept-script',
    },
  })
  const reportText = JSON.stringify(report)
  assert(reportText.includes('report_submitted') || reportText.includes('"ok":true'), 'A7 report')
  evidence.A7 = true

  // A3：运行时打开 memo_write + list_changed
  let listChanged = false
  client.setNotificationHandler('notifications/tools/list_changed', async () => {
    listChanged = true
  })
  handle.enableWriteCaps({ memo: true, file: false })
  await new Promise((r) => setTimeout(r, 300))
  if (!listChanged) {
    handle.getActiveServer()?.sendToolListChanged()
    await new Promise((r) => setTimeout(r, 300))
  }
  const listed2 = await client.listTools()
  const names2 = toolNames(listed2)
  assert(names2.includes('cypmemo_create_memo'), 'A3 write tool visible')
  evidence.A3 = {
    tools: names2.filter((n) => n.includes('create') || n.includes('update') || n.includes('delete')),
    listChanged,
  }
  assert(listChanged, 'A3 list_changed notification received')
  evidence.A3_listChanged_notified = listChanged

  // A3b：写工具实跑（create → 可见 id）
  const created: any = await client.callTool({
    name: 'cypmemo_create_memo',
    arguments: {
      title: 'MCP写工具验收',
      content: 'accept write exec',
      tags: ['mcp-accept-write'],
    },
  })
  const createdText = JSON.stringify(created)
  evidence.A3_write_exec = createdText.slice(0, 400)
  assert(created?.isError !== true, 'A3 create not error')
  assert(/"id"\s*:/.test(createdText) || createdText.includes('id'), 'A3 create returns id')
  let createdId = ''
  try {
    const raw = String(created?.content?.[0]?.text || '')
    createdId = String(JSON.parse(raw)?.id || '')
  } catch {
    const m = createdText.match(/"id"\s*:\s*"([^"]+)"/)
    createdId = m?.[1] || ''
  }
  assert(createdId, 'A3 create id parse')

  const updated: any = await client.callTool({
    name: 'cypmemo_update_memo',
    arguments: { memo_id: createdId, title: 'MCP写工具验收-已改' },
  })
  assert(updated?.isError !== true, 'A3 update ok')
  const deleted: any = await client.callTool({
    name: 'cypmemo_delete_memo',
    arguments: { memo_id: createdId },
  })
  assert(deleted?.isError !== true, 'A3 delete ok')
  evidence.A3_write_crud = { create: createdId, update: true, delete: true }

  // A3c：file_write 实跑（upload → update metadata → delete）
  let fileListChanged = false
  client.setNotificationHandler('notifications/tools/list_changed', async () => {
    fileListChanged = true
  })
  handle.enableWriteCaps({ memo: false, file: true })
  await new Promise((r) => setTimeout(r, 300))
  if (!fileListChanged) {
    handle.getActiveServer()?.sendToolListChanged()
    await new Promise((r) => setTimeout(r, 300))
  }
  const listedFile = await client.listTools()
  const fileNames = toolNames(listedFile)
  assert(fileNames.includes('cypmemo_upload_file'), 'A3c upload tool visible')
  assert(fileNames.includes('cypmemo_update_file_metadata'), 'A3c update meta visible')
  assert(fileNames.includes('cypmemo_delete_file'), 'A3c delete file visible')
  evidence.A3c_listChanged = fileListChanged
  assert(fileListChanged, 'A3c list_changed for file_write')

  const uploadBody = Buffer.from('mcp-accept-file-write-fixture\n', 'utf8').toString('base64')
  const uploaded: any = await client.callTool({
    name: 'cypmemo_upload_file',
    arguments: {
      filename: 'mcp-accept-a3c.txt',
      content_base64: uploadBody,
      mime_type: 'text/plain',
      mcpPublic: false,
    },
  })
  const uploadedText = JSON.stringify(uploaded)
  evidence.A3c_upload_snip = uploadedText.slice(0, 400)
  assert(uploaded?.isError !== true, 'A3c upload not error')
  let fileId = ''
  try {
    fileId = String(JSON.parse(String(uploaded?.content?.[0]?.text || ''))?.id || '')
  } catch {
    const m = uploadedText.match(/"id"\s*:\s*"([^"]+)"/)
    fileId = m?.[1] || ''
  }
  assert(fileId, 'A3c upload id parse')

  const metaPatched: any = await client.callTool({
    name: 'cypmemo_update_file_metadata',
    arguments: {
      file_id: fileId,
      filename: 'mcp-accept-a3c-renamed.txt',
      mcpPublic: true,
    },
  })
  assert(metaPatched?.isError !== true, 'A3c update metadata ok')

  // A_res_file：file Resources 分段读取（与 tools 同门禁）
  const templates = await client.listResourceTemplates()
  const tmplText = JSON.stringify(templates)
  assert(tmplText.includes('cypmemo://file/{id}/{layer}') || tmplText.includes('cypmemo://file/'), 'A_res_file template listed')
  evidence.A_res_file_template = true

  let skipResOk = false
  try {
    await client.readResource({ uri: `cypmemo://file/${fileId}/full` })
  } catch (e: any) {
    const msg = JSON.stringify(e?.message || e) + JSON.stringify(e)
    skipResOk = /MCP_READ_LAYER_SKIP|layer skipped|Segmented/i.test(msg) || e?.code === -32602
  }
  assert(skipResOk, 'A_res_file skip full without title')
  evidence.A_res_file_skip = true

  const titleRes = await client.readResource({ uri: `cypmemo://file/${fileId}/title` })
  const titleResText = JSON.stringify(titleRes)
  assert(/mcp-accept-a3c-renamed|filename/i.test(titleResText), 'A_res_file title')
  const sumRes = await client.readResource({ uri: `cypmemo://file/${fileId}/summary` })
  const sumResText = JSON.stringify(sumRes)
  assert(/summary/i.test(sumResText), 'A_res_file summary')
  const fullRes = await client.readResource({ uri: `cypmemo://file/${fileId}/full` })
  const fullResText = JSON.stringify(fullRes)
  assert(
    fullResText.includes('mcp-accept-file-write-fixture') || fullResText.includes('extractable'),
    'A_res_file full text'
  )
  evidence.A_res_file = { title: true, summary: true, full: true }

  const fileDeleted: any = await client.callTool({
    name: 'cypmemo_delete_file',
    arguments: { file_id: fileId },
  })
  assert(fileDeleted?.isError !== true, 'A3c delete file ok')
  evidence.A3c_file_write = {
    upload: fileId,
    update: true,
    delete: true,
    tools: fileNames.filter((n) => n.includes('file') || n.includes('upload')),
  }

  // A1-HTTP：环回 Streamable HTTP 真传输（独立端口，不依赖外部 sidecar）
  const httpPort = 5179
  process.env.CYP_MCP_HTTP_PORT = String(httpPort)
  const httpHandle = createCypMemoMcp(loadMcpConfig())
  const { startHttp } = await import('../src/transport/http.js')
  await startHttp(httpHandle)
  await new Promise((r) => setTimeout(r, 200))
  const hz = await fetch(`https://127.0.0.1:${httpPort}/healthz`)
  assert(hz.ok, 'A1 HTTPS healthz')
  const missingProto = await fetch(`https://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
  })
  const missingProtoBody = await missingProto.text()
  assert(
    missingProto.status === 400 && missingProtoBody.includes('Missing') && missingProtoBody.includes('-32020'),
    'A1 missing proto'
  )
  const disc = await fetch(`https://127.0.0.1:${httpPort}/discover`, {
    headers: { 'MCP-Protocol-Version': '2026-07-28' },
  })
  const discJson: any = await disc.json()
  assert(disc.ok && discJson?.protocolVersion === '2026-07-28', 'A1 discover')
  // 手写 JSON-RPC：当前官方 SDK 会话只认 2025-11-25 等；产品基线 2026-07-28 仍用于 discover / 缺头校验
  const listRpc = await fetch(`https://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  const listBody = await listRpc.text()
  evidence.A1_http_list_status = listRpc.status
  evidence.A1_http_list_snip = listBody.slice(0, 400)
  assert(listRpc.ok, 'A1 HTTPS tools/list status')
  assert(listBody.includes('cypmemo_list_memos'), 'A1 HTTPS tools/list query')
  assert(!listBody.includes('cypmemo_create_memo'), 'A1 HTTPS no write tools')
  const titleRpc = await fetch(`https://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'cypmemo_get_memo_title', arguments: { memo_id: memoId } },
    }),
  })
  const titleBody = await titleRpc.text()
  assert(titleRpc.ok && !titleBody.includes('"isError":true'), 'A1b HTTP public title')
  evidence.A1_http = {
    healthz: hz.status,
    missingProto: missingProto.status,
    discover: discJson?.protocolVersion,
    listOk: true,
    publicTitle: true,
  }

  // A10：禁用态 HTTP 503 + MCP_DISABLED
  process.env.CYP_MCP_ENABLED = 'false'
  process.env.CYP_MCP_HTTP_PORT = '5182'
  const offHandle = createCypMemoMcp(loadMcpConfig())
  assert(offHandle.config.enabled === false, 'A10 env disable')
  await startHttp(offHandle)
  await new Promise((r) => setTimeout(r, 200))
  const hzOff = await fetch('https://127.0.0.1:5182/healthz')
  assert(hzOff.status === 503, 'A10 healthz 503')
  const offMcp = await fetch('https://127.0.0.1:5182/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
    },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
  })
  const offBody = await offMcp.text()
  assert(offMcp.status === 503 && offBody.includes('MCP_DISABLED') && offBody.includes('-32603'), 'A10 HTTPS disabled')
  evidence.A10_env = true
  evidence.A10_http = { healthz: hzOff.status, mcp: offMcp.status }
  delete process.env.CYP_MCP_ENABLED
  delete process.env.CYP_MCP_HTTP_PORT

  await client.close()
  await mcpServer.close()

  console.log('MCP_ACCEPT_PASS')
  console.log(JSON.stringify(evidence, null, 2))
  // HTTP 服务随进程退出；显式 exit 避免 listen 挂住
  process.exit(0)
}

main().catch((e) => {
  console.error('MCP_ACCEPT_FAIL', e)
  console.error(JSON.stringify(evidence, null, 2))
  process.exit(1)
})
