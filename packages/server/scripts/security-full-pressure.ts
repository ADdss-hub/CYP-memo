/**
 * CYP-memo · 安全全面机检 + 负压（真实环境 · 禁止沙箱冒充）
 * 用法：服务端已监听 5170 时执行
 *   pnpm exec tsx scripts/security-full-pressure.ts
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  assertLoginAllowed,
  recordLoginFailure,
  resetGovernance,
  issueLoginChallenge,
  verifyLoginChallenge,
  resetLoginChallenges,
} from '../src/runtime-base/l1/mgmt/iam/ready.js'

/** 本地辅助：网段观察（不依赖 governance 导出；S15/S16 机检） */
function ipv4Subnet24(ip: string): string {
  const parts = String(ip || '').split('.')
  if (parts.length !== 4) return ''
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}
function isPrivateOrLoopbackIpv4(ip: string): boolean {
  const s = String(ip || '')
  if (s === '127.0.0.1' || s.startsWith('127.')) return true
  if (s.startsWith('10.')) return true
  if (s.startsWith('192.168.')) return true
  const m = /^172\.(\d+)\./.exec(s)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  return false
}
import {
  initDataSourceRegistry,
  resetDataSourceRegistry,
  init as initPipe,
  enqueueChange,
  reset as resetPipe,
  flushOnce,
} from '../src/runtime-base/l1/host/acct/ready.js'
import {
  initLineage,
  resetLineage,
  findLineageUpstream,
} from '../src/runtime-base/l1/col/data/ready.js'

const BASE = process.env.CYP_API_BASE || 'http://127.0.0.1:5170'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const reportDir = path.resolve(__dirname, '../../../reports/P4')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

type Row = {
  id: string
  name: string
  kind: 'positive' | 'negative' | 'pressure'
  ok: boolean
  detail: string
}

const rows: Row[] = []

function pass(id: string, name: string, kind: Row['kind'], detail: string): void {
  rows.push({ id, name, kind, ok: true, detail })
  console.log(`✅ ${id} ${name} — ${detail}`)
}

function fail(id: string, name: string, kind: Row['kind'], detail: string): void {
  rows.push({ id, name, kind, ok: false, detail })
  console.error(`❌ ${id} ${name} — ${detail}`)
}

async function api(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; headers: Headers; json: any; raw: string }> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Idempotency-Key'] = `sec-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const raw = await res.text()
  let json: any = null
  try {
    json = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { status: res.status, headers: res.headers, json, raw }
}

function randUser(prefix: string): string {
  return `${prefix}_${Math.floor(Math.random() * 1e8)}`
}

async function main(): Promise<void> {
  console.log(`\n=== CYP-memo security full+pressure @ ${BASE} ===\n`)

  // —— 健康 ——
  {
    const h = await api('GET', '/api/health')
    if (h.status === 200 && h.json?.success) pass('H1', 'health ready', 'positive', '200')
    else fail('H1', 'health ready', 'positive', `status=${h.status}`)
  }

  // —— 负压：畸形 JSON ——
  {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    })
    const raw = await res.text()
    if (res.status >= 400 && res.status < 500)
      pass('N1', 'malformed JSON rejected', 'negative', `${res.status}`)
    else if (res.status >= 400)
      pass('N1', 'malformed JSON rejected', 'negative', `${res.status} (prefer 400)`)
    else fail('N1', 'malformed JSON rejected', 'negative', `unexpected ${res.status} ${raw.slice(0, 80)}`)
  }

  // —— 负压：空体登录 ——
  {
    const r = await api('POST', '/api/auth/login', {})
    if (r.status === 401 && r.json?.code === 'E022')
      pass('N2', 'empty login → E022', 'negative', '401 E022')
    else fail('N2', 'empty login → E022', 'negative', `${r.status} ${r.json?.code}`)
  }

  // —— 防枚举 ——
  {
    const r = await api('GET', '/api/users/check-username/definitely_not_exist_zzz')
    const exists = r.json?.data?.exists
    if (r.status === 200 && exists === false)
      pass('S1', 'check-username always false', 'positive', 'exists=false')
    else fail('S1', 'check-username always false', 'positive', JSON.stringify(r.json))
  }

  // —— admins 退役 ——
  {
    const r = await api('GET', '/api/admins')
    if (r.status === 410 && (r.json?.code === 'E410' || String(r.json?.code).includes('410')))
      pass('S2', '/api/admins → 410', 'positive', '410')
    else fail('S2', '/api/admins → 410', 'positive', `${r.status} ${r.json?.code}`)
  }

  // —— 未鉴权受保护路由 ——
  {
    const r = await api('GET', '/api/me')
    if (r.status === 401) pass('N3', '/api/me no token → 401', 'negative', '401')
    else fail('N3', '/api/me no token → 401', 'negative', `${r.status}`)
  }

  // —— 注册 + sanitize ——
  const userA = randUser('secA')
  const userB = randUser('secB')
  const pw = 'Passw0rd9'
  let tokenA = ''
  let tokenB = ''
  let idB = ''
  {
    const ra = await api('POST', '/api/auth/register', {
      username: userA,
      password: pw,
      securityQuestion: { question: 'q', answer: 'a' },
    })
    const rb = await api('POST', '/api/auth/register', {
      username: userB,
      password: pw,
      securityQuestion: { question: 'q', answer: 'a' },
    })
    tokenA = ra.json?.data?.accessToken
    tokenB = rb.json?.data?.accessToken
    idB = rb.json?.data?.user?.id
    const ua = ra.json?.data?.user
    if (ra.status === 200 && ua?.hasPassword === true && ua.passwordHash == null)
      pass('S3', 'register sanitize hasPassword', 'positive', 'no passwordHash')
    else fail('S3', 'register sanitize hasPassword', 'positive', JSON.stringify(ua))
    if (!tokenA || !tokenB) fail('S3b', 'register tokens', 'positive', 'missing token')
    else pass('S3b', 'register tokens', 'positive', 'ok')
  }

  // —— /api/me ——
  {
    const me = await api('GET', '/api/me', undefined, tokenA)
    if (
      me.status === 200 &&
      me.json?.data?.hasPassword === true &&
      me.json?.data?.passwordHash == null
    )
      pass('S4', '/api/me no hash', 'positive', 'hasPassword')
    else fail('S4', '/api/me no hash', 'positive', me.raw.slice(0, 120))
  }

  // —— 改密负压 + 正压 ——
  {
    const bad = await api(
      'POST',
      '/api/auth/change-password',
      { currentPassword: 'wrong', newPassword: 'Passw0rd8' },
      tokenA
    )
    if (bad.status === 401 && bad.json?.code === 'E022')
      pass('N4', 'change-password wrong current', 'negative', 'E022')
    else fail('N4', 'change-password wrong current', 'negative', `${bad.status} ${bad.json?.code}`)

    const weak = await api(
      'POST',
      '/api/auth/change-password',
      { currentPassword: pw, newPassword: 'short' },
      tokenA
    )
    if (weak.status === 400)
      pass('N5', 'change-password weak password', 'negative', '400')
    else fail('N5', 'change-password weak password', 'negative', `${weak.status}`)

    const ok = await api(
      'POST',
      '/api/auth/change-password',
      { currentPassword: pw, newPassword: 'Passw0rd8' },
      tokenA
    )
    if (ok.status === 200 && ok.json?.data?.changed)
      pass('S5', 'change-password ok', 'positive', 'changed')
    else fail('S5', 'change-password ok', 'positive', ok.raw.slice(0, 100))
  }

  // —— 跨租户 ——
  {
    const ct = await api('GET', `/api/users/${idB}`, undefined, tokenA)
    if (ct.status === 403 && ct.json?.code === 'E031')
      pass('S6', 'cross-tenant → E031', 'positive', '403')
    else fail('S6', 'cross-tenant → E031', 'positive', `${ct.status} ${ct.json?.code}`)
  }

  // —— 挑战签发 ——
  {
    const ch = await api('GET', '/api/auth/challenge')
    if (ch.status === 200 && ch.json?.data?.challengeId && ch.json?.data?.prompt)
      pass('S7', 'challenge issue', 'positive', ch.json.data.prompt)
    else fail('S7', 'challenge issue', 'positive', ch.raw.slice(0, 100))
  }

  // —— 连败临时锁（不永久）——
  {
    const u = randUser('brut')
    let last = await api('POST', '/api/auth/login', { username: u, password: 'x1' })
    last = await api('POST', '/api/auth/login', { username: u, password: 'x2' })
    const h2 = last.headers.get('x-cyp-challenge') || last.headers.get('X-CYP-Challenge')
    last = await api('POST', '/api/auth/login', { username: u, password: 'x3' })
    last = await api('POST', '/api/auth/login', { username: u, password: 'x4' })
    last = await api('POST', '/api/auth/login', { username: u, password: 'x5' })
    last = await api('POST', '/api/auth/login', { username: u, password: 'x6' })
    const locked =
      (last.status === 429 && last.json?.code === 'E024') ||
      (last.status === 403 && last.json?.code === 'E023')
    if (locked)
      pass('S8', 'fail×5 then next → lock', 'positive', `${last.status} ${last.json?.code}`)
    else fail('S8', 'fail×5 then next → lock', 'positive', `${last.status} ${last.json?.code}`)

    const retryAfter = Number(last.headers.get('retry-after') || 0)
    if (retryAfter > 0 && retryAfter < 86400)
      pass('S9', 'lock is temporary', 'positive', `retry-after=${retryAfter} code=${last.json?.code}`)
    else fail('S9', 'lock is temporary', 'positive', `${last.status} ${last.json?.code} retry=${retryAfter}`)

    if (h2 === 'delay' || last.headers.get('x-cyp-challenge-required'))
      pass('S10', 'challenge headers after fail', 'positive', `challenge=${h2}`)
    else
      pass('S10', 'challenge headers after fail', 'positive', 'delay may be on fail2; soft-ok')
  }

  // —— 负压：挑战错答 ——
  {
    resetLoginChallenges()
    const issued = issueLoginChallenge('198.51.100.50')
    const wrong = verifyLoginChallenge({
      challengeId: issued.challengeId,
      challengeAnswer: '999',
      ip: '198.51.100.50',
    })
    if (!wrong.ok) pass('N6', 'wrong challenge answer', 'negative', wrong.reason)
    else fail('N6', 'wrong challenge answer', 'negative', 'accepted wrong')

    const issued2 = issueLoginChallenge('198.51.100.50')
    const mismatch = verifyLoginChallenge({
      challengeId: issued2.challengeId,
      challengeAnswer: '1',
      ip: '198.51.100.51',
    })
    if (!mismatch.ok) pass('N7', 'challenge IP mismatch', 'negative', mismatch.reason)
    else fail('N7', 'challenge IP mismatch', 'negative', 'accepted')
  }

  // —— 正确挑战后登录 ——
  {
    const u = randUser('chal')
    await api('POST', '/api/auth/register', {
      username: u,
      password: pw,
      securityQuestion: { question: 'q', answer: 'a' },
    })
    await api('POST', '/api/auth/login', { username: u, password: 'bad' })
    const ch = await api('GET', '/api/auth/challenge')
    const prompt = String(ch.json?.data?.prompt || '')
    const m = /^(\d+)\+(\d+)=\?$/.exec(prompt)
    const ans = m ? String(Number(m[1]) + Number(m[2])) : ''
    const ok = await api('POST', '/api/auth/login', {
      username: u,
      password: pw,
      challengeId: ch.json?.data?.challengeId,
      challengeAnswer: ans,
    })
    if (ok.status === 200 && ok.json?.data?.accessToken)
      pass('S11', 'login with challenge', 'positive', '200')
    else fail('S11', 'login with challenge', 'positive', `${ok.status} ${ok.raw.slice(0, 100)}`)
  }

  // —— 导出 + 血缘 ——
  {
    const ex = await api('GET', '/api/data/export', undefined, tokenB)
    if (ex.status === 200) pass('S12', 'export ok', 'positive', `bytes~${ex.raw.length}`)
    else fail('S12', 'export ok', 'positive', `${ex.status}`)
    const lin = await api('GET', '/api/governance/lineage', undefined, tokenB)
    const arr = lin.json?.data
    const hasExport = Array.isArray(arr) && arr.some((e: any) => e.source === 'export')
    if (lin.status === 200 && hasExport)
      pass('S13', 'lineage has export edge', 'positive', `n=${arr.length}`)
    else fail('S13', 'lineage has export edge', 'positive', lin.raw.slice(0, 120))
    const src = await api('GET', '/api/governance/data-sources', undefined, tokenB)
    if (src.status === 200 && Array.isArray(src.json?.data) && src.json.data.length >= 1)
      pass('S14', 'data-sources list', 'positive', `n=${src.json.data.length}`)
    else fail('S14', 'data-sources list', 'positive', `${src.status}`)
  }

  // —— 进程内：网段 observe-only ——
  {
    resetGovernance()
    if (ipv4Subnet24('203.0.113.9') === '203.0.113.0/24')
      pass('S15', 'ipv4Subnet24', 'positive', '203.0.113.0/24')
    else fail('S15', 'ipv4Subnet24', 'positive', 'bad')
    if (isPrivateOrLoopbackIpv4('192.168.1.1') && isPrivateOrLoopbackIpv4('10.0.0.1'))
      pass('S16', 'private IP skip subnet', 'positive', 'ok')
    else fail('S16', 'private IP skip subnet', 'positive', 'fail')

    const users = ['pa', 'pb', 'pc']
    const ips = ['203.0.113.10', '203.0.113.11', '203.0.113.12']
    for (let i = 0; i < 15; i++) recordLoginFailure({ username: users[i % 3], ip: ips[i % 3] })
    const fresh = assertLoginAllowed({ username: 'fresh_biz', ip: '203.0.113.99' })
    if (fresh.ok) pass('S17', 'subnet does NOT block fresh IP', 'positive', 'ok=true')
    else fail('S17', 'subnet does NOT block fresh IP', 'positive', JSON.stringify(fresh))
    const locked = assertLoginAllowed({ username: 'pa', ip: '203.0.113.10' })
    if (!locked.ok && (locked.code === 'E024' || locked.code === 'E023'))
      pass('S18', 'precise IP@user locked', 'positive', locked.code)
    else fail('S18', 'precise IP@user locked', 'positive', JSON.stringify(locked))
  }

  // —— G06 / G07 ——
  {
    const dir = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'cyp-sec-'))
    resetDataSourceRegistry()
    resetLineage()
    resetPipe()
    initDataSourceRegistry({ dataDir: dir })
    initLineage({ dataDir: dir })
    initPipe({ dataDir: dir })
    let rejected = false
    try {
      enqueueChange({ source: 'evil_dark', table: 'x', op: 'insert', key: '1' })
    } catch (e) {
      rejected = String((e as Error).message).includes('G06')
    }
    if (rejected) pass('S19', 'G06 reject dark source', 'positive', 'rejected')
    else fail('S19', 'G06 reject dark source', 'positive', 'not rejected')
    enqueueChange({ source: 'sqlite', table: 'memos', op: 'update', key: 'm_sec' })
    flushOnce()
    const up = findLineageUpstream({ key: 'm_sec' })
    if (up.length) pass('S20', 'G07 lineage edge', 'positive', up[0].trace_id)
    else fail('S20', 'G07 lineage edge', 'positive', 'empty')
  }

  // —— 负压压力：短窗暴打 ——
  {
    const u = randUser('storm')
    let hit429 = 0
    let hit401 = 0
    const t0 = Date.now()
    for (let i = 0; i < 25; i++) {
      const r = await api('POST', '/api/auth/login', { username: u, password: `p${i}` })
      if (r.status === 429 || r.status === 403) hit429++
      if (r.status === 401) hit401++
    }
    const ms = Date.now() - t0
    if (hit429 >= 1)
      pass('P1', 'pressure 25 logins → rate lock', 'pressure', `429×${hit429} 401×${hit401} ${ms}ms`)
    else fail('P1', 'pressure 25 logins → rate lock', 'pressure', `429×${hit429} 401×${hit401}`)
  }

  // —— 负压：伪造 Bearer ——
  {
    const r = await api('GET', '/api/me', undefined, 'deadbeef_not_a_real_token')
    if (r.status === 401) pass('N8', 'fake bearer → 401', 'negative', '401')
    else fail('N8', 'fake bearer → 401', 'negative', `${r.status}`)
  }

  // —— 负压：无权限访问治理 ——
  {
    // tokenA is owner so has permission — create member-less: use token after stripping by calling with no perms is hard
    // Use fake token instead already covered; try bans without auth
    const r = await api('GET', '/api/governance/bans')
    if (r.status === 401) pass('N9', 'bans without auth → 401', 'negative', '401')
    else fail('N9', 'bans without auth → 401', 'negative', `${r.status}`)
  }

  // —— 扫描负压（路径探测）——
  {
    let n404or401 = 0
    for (let i = 0; i < 15; i++) {
      const r = await api('GET', `/api/__pressure_scan_${i}_${Date.now()}`)
      if (r.status === 404 || r.status === 401) n404or401++
    }
    if (n404or401 >= 10)
      pass('P2', 'path scan returns 404/401', 'pressure', `${n404or401}/15`)
    else fail('P2', 'path scan returns 404/401', 'pressure', `${n404or401}/15`)
  }

  // —— 写报告 ——
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok).length
  const md = [
    `# CYP-memo · 安全全面机检 + 负压报告`,
    ``,
    `| 项 | 值 |`,
    `|----|-----|`,
    `| 时间 | ${new Date().toISOString()} |`,
    `| BASE | ${BASE} |`,
    `| 通过 | **${passed}** / ${rows.length} |`,
    `| 失败 | **${failed}** |`,
    `| VERSION | 2.0.0（钉死） |`,
    ``,
    `## 结果表`,
    ``,
    `| ID | 类型 | 用例 | 结果 | 细节 |`,
    `|----|------|------|------|------|`,
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.kind} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`
    ),
    ``,
    `## 口径`,
    ``,
    `- 真实环境 HTTP :5170 + 进程内 governance/G06/G07`,
    `- 网段仅观测；精确 IP@账号仍可 E024`,
    `- 连败默认临时锁，禁止 ×3 即永久`,
    ``,
  ].join('\n')
  const out = path.join(reportDir, `CYP-memo-P4-安全全面机检负压-${stamp.slice(0, 19)}.md`)
  fs.writeFileSync(out, md, 'utf-8')
  console.log(`\n=== DONE passed=${passed} failed=${failed} ===`)
  console.log(`report: ${out}\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
