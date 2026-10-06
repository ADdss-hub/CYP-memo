/**
 * P0 实机核验：public-config requireFlag 读写 + 旁路叠读
 * 临时注册用户；结束时恢复 flag 默认配置
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { loadMcpConfig, reloadProductOverlays } from '../../mcp/src/config.js'

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
  const u = `rf_p0_${Date.now()}`
  const pw = 'RfP0Test9Aa!'
  await apiHttps('POST', '/auth/register', { username: u, password: pw, confirmPassword: pw })
  const login = await apiHttps('POST', '/auth/login', { username: u, password: pw })
  assert(login.status === 200 && login.json?.data?.accessToken, `login failed ${login.status}`)
  const tok = login.json.data.accessToken as string

  // 先恢复默认，避免上次中断污染
  const baseline = await apiHttps(
    'PUT',
    '/mcp/public-config',
    {
      maxLayer: 'summary',
      memoSelectorMode: 'flag',
      fileSelectorMode: 'flag',
      memoSelectorTags: [],
      memoSelectorIds: [],
      fileSelectorTags: [],
      fileSelectorIds: [],
      requireFlag: true,
    },
    tok
  )
  assert(baseline.status === 200 && baseline.json.data.requireFlag === true, `BASELINE ${baseline.status}`)

  const g1 = await apiHttps('GET', '/mcp/public-config', undefined, tok)
  assert(g1.status === 200, `GET1 ${g1.status}`)
  assert(g1.json.data.requireFlag === true, `GET1 expect requireFlag=true got ${g1.json.data.requireFlag}`)

  const putOff = await apiHttps(
    'PUT',
    '/mcp/public-config',
    {
      maxLayer: 'summary',
      memoSelectorMode: 'tag',
      fileSelectorMode: 'flag',
      memoSelectorTags: ['public'],
      memoSelectorIds: [],
      fileSelectorTags: [],
      fileSelectorIds: [],
      requireFlag: false,
    },
    tok
  )
  assert(putOff.status === 200, `PUT_OFF ${putOff.status} ${JSON.stringify(putOff.json)}`)
  assert(putOff.json.data.requireFlag === false, 'PUT_OFF requireFlag not false')
  assert(putOff.json.data.memoSelectorMode === 'tag', 'PUT_OFF mode')

  const g2 = await apiHttps('GET', '/mcp/public-config', undefined, tok)
  assert(g2.json.data.requireFlag === false, 'GET2 requireFlag')

  const dataFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/mcp-public-config.json')
  const fileJson = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  assert(fileJson.requireFlag === false, 'FILE requireFlag')

  process.env.DATA_DIR = path.dirname(dataFile)
  const cfg = loadMcpConfig()
  assert(cfg.public.memoSelector.requireFlag === false, 'MCP overlay requireFlag after load')
  fileJson.requireFlag = true
  fs.writeFileSync(dataFile, JSON.stringify(fileJson, null, 2), 'utf8')
  const info = reloadProductOverlays(cfg)
  assert(info.changed, 'reload should change')
  assert(cfg.public.memoSelector.requireFlag === true, 'MCP overlay hot requireFlag=true')

  const restore = await apiHttps(
    'PUT',
    '/mcp/public-config',
    {
      maxLayer: 'summary',
      memoSelectorMode: 'flag',
      fileSelectorMode: 'flag',
      memoSelectorTags: [],
      memoSelectorIds: [],
      fileSelectorTags: [],
      fileSelectorIds: [],
      requireFlag: true,
    },
    tok
  )
  assert(restore.status === 200 && restore.json.data.requireFlag === true, 'RESTORE')
  assert(restore.json.data.memoSelectorMode === 'flag', 'RESTORE mode')

  const view = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/views/help/HelpMcpView.vue'),
    'utf8'
  )
  assert(view.includes('v-model="publicCfg.requireFlag"'), 'UI checkbox binding')
  assert(view.includes('requireFlag: publicCfg.value.requireFlag'), 'UI save body')
  assert(view.includes('requireFlag: d.requireFlag !== false'), 'UI load')

  console.log(
    JSON.stringify(
      {
        ok: true,
        steps: ['GET1', 'PUT_OFF', 'GET2', 'FILE', 'MCP_OVERLAY', 'HOT', 'RESTORE', 'UI_SRC'],
        user: u,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('[requireFlag-verify] FAIL', e)
  process.exit(1)
})
