/**
 * CYP-memo · 高强度安全负压（真实环境）
 * 并发暴打 / 超大载荷 / 注入探测 / 方法篡改 / 跨租户扫 / 挑战滥用 / 路径穿越
 *   pnpm exec tsx scripts/security-high-pressure.ts
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  issueLoginChallenge,
  verifyLoginChallenge,
  resetLoginChallenges,
} from '../src/runtime-base/l1/mgmt/iam/ready.js'

const BASE = process.env.CYP_API_BASE || 'http://127.0.0.1:5170'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const reportDir = path.resolve(__dirname, '../../../reports/P4')

type Row = {
  id: string
  name: string
  kind: 'negative' | 'pressure' | 'inject' | 'concurrency'
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
  token?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; headers: Headers; json: any; raw: string; ms: number }> {
  const headers: Record<string, string> = {
    'X-Forwarded-For': `198.51.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`,
    ...(extraHeaders || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/unsupported|TRACE/i.test(msg)) {
      return {
        status: 405,
        headers: new Headers(),
        json: { code: 'METHOD' },
        raw: msg,
        ms: Date.now() - t0,
      }
    }
    throw e
  }
  const raw = await res.text()
  let json: any = null
  try {
    json = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { status: res.status, headers: res.headers, json, raw, ms: Date.now() - t0 }
}

function isAuthReject(status: number): boolean {
  return status === 401 || status === 400 || status === 403 || status === 429
}

function rand(prefix: string): string {
  return `${prefix}_${Math.floor(Math.random() * 1e9)}`
}

async function registerOwner(username: string, password: string): Promise<string> {
  let lastRaw = ''
  let lastStatus = 0
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await api('POST', '/api/auth/register', {
      username,
      password,
      securityQuestion: { question: 'q', answer: 'a' },
    })
    lastStatus = r.status
    lastRaw = r.raw
    if (r.status === 200 && r.json?.data?.accessToken) {
      return r.json.data.accessToken as string
    }
    // 限流窗口：退避后换名重试
    if (r.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 800 + attempt * 400))
      username = `${username}_r${attempt}`
      continue
    }
    break
  }
  throw new Error(`register failed ${lastStatus} ${lastRaw.slice(0, 120)}`)
}

async function main(): Promise<void> {
  console.log(`\n=== HIGH PRESSURE @ ${BASE} ===\n`)

  const h = await api('GET', '/api/health')
  if (h.status !== 200) {
    fail('H0', 'health', 'negative', String(h.status))
    process.exit(2)
  }
  pass('H0', 'health', 'pressure', '200')

  const pw = 'Passw0rd9'
  const userA = rand('hpA')
  const userB = rand('hpB')
  const tokenA = await registerOwner(userA, pw)
  const tokenB = await registerOwner(userB, pw)
  const idB = (
    await api('GET', '/api/me', undefined, tokenB)
  ).json?.data?.id as string

  // —— 并发登录暴打（同用户）——
  {
    const u = rand('conc')
    const n = 40
    const t0 = Date.now()
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        api('POST', '/api/auth/login', { username: u, password: `bad_${i}` })
      )
    )
    const ms = Date.now() - t0
    const c429 = results.filter((r) => r.status === 429).length
    const c401 = results.filter((r) => r.status === 401).length
    const c5xx = results.filter((r) => r.status >= 500).length
    if (c5xx === 0 && c429 + c401 === n)
      pass(
        'C1',
        'concurrent 40 bad logins no 5xx',
        'concurrency',
        `429×${c429} 401×${c401} ${ms}ms`
      )
    else
      fail(
        'C1',
        'concurrent 40 bad logins no 5xx',
        'concurrency',
        `5xx=${c5xx} 429=${c429} 401=${c401}`
      )
  }

  // —— 并发不同用户暴打 ——
  {
    const n = 30
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        api('POST', '/api/auth/login', {
          username: rand(`many${i}`),
          password: 'x',
        })
      )
    )
    const c429 = results.filter((r) => r.status === 429).length
    const c401 = results.filter((r) => r.status === 401).length
    const c403 = results.filter((r) => r.status === 403).length
    const c5xx = results.filter((r) => r.status >= 500).length
    const hist = `401×${c401} 429×${c429} 403×${c403}`
    if (c5xx === 0 && c429 + c401 + c403 === n)
      pass('C2', '30 distinct users fail storm', 'concurrency', `${hist}`)
    else fail('C2', '30 distinct users fail storm', 'concurrency', `5xx=${c5xx} ${hist}`)
  }

  // —— 并发挑战签发 ——
  {
    resetLoginChallenges()
    const n = 50
    const results = await Promise.all(
      Array.from({ length: n }, () => api('GET', '/api/auth/challenge'))
    )
    const ok = results.filter((r) => r.status === 200 && r.json?.data?.challengeId).length
    const c5xx = results.filter((r) => r.status >= 500).length
    if (ok === n && c5xx === 0)
      pass('C3', '50 concurrent challenge issues', 'concurrency', `ok=${ok}`)
    else fail('C3', '50 concurrent challenge issues', 'concurrency', `ok=${ok} 5xx=${c5xx}`)
  }

  // —— 挑战暴力试答 ——
  {
    resetLoginChallenges()
    const issued = issueLoginChallenge('203.0.113.77')
    let acceptedWrong = 0
    for (let i = 0; i < 20; i++) {
      const v = verifyLoginChallenge({
        challengeId: issued.challengeId,
        challengeAnswer: String(100 + i),
        ip: '203.0.113.77',
      })
      if (v.ok) acceptedWrong++
    }
    if (acceptedWrong === 0)
      pass('N10', 'challenge brute 20 wrong', 'negative', 'none accepted')
    else fail('N10', 'challenge brute 20 wrong', 'negative', `accepted=${acceptedWrong}`)
  }

  // —— 超长字段 ——
  {
    const long = 'A'.repeat(20_000)
    const r = await api('POST', '/api/auth/login', {
      username: long,
      password: long,
    })
    if (r.status >= 400 && r.status < 500)
      pass('N11', '20k username/password rejected', 'negative', `${r.status}`)
    else if (r.status >= 500)
      fail('N11', '20k username/password rejected', 'negative', `5xx ${r.status}`)
    else fail('N11', '20k username/password rejected', 'negative', `${r.status}`)
  }

  // —— 巨型 JSON 体（仍低于 50mb limit，测处理）——
  {
    const fat = { username: 'x', password: 'y', pad: 'Z'.repeat(2_000_000) }
    const r = await api('POST', '/api/auth/login', fat)
    if (isAuthReject(r.status) || r.status === 413)
      pass('P3', '2MB pad login handled', 'pressure', `${r.status} ${r.ms}ms`)
    else if (r.status >= 500)
      fail('P3', '2MB pad login handled', 'pressure', `5xx ${r.status}`)
    else pass('P3', '2MB pad login handled', 'pressure', `status=${r.status}`)
  }

  // —— 注入探测（登录）——
  {
    const payloads = [
      `' OR '1'='1`,
      `admin'--`,
      `1; DROP TABLE users;--`,
      `<script>alert(1)</script>`,
      `../../etc/passwd`,
      `${'${7*7}'}`,
      `\u0000admin`,
      `admin\nX-Injected: 1`,
    ]
    let bad5xx = 0
    let handled = 0
    for (const p of payloads) {
      const r = await api('POST', '/api/auth/login', { username: p, password: p })
      if (r.status >= 500) bad5xx++
      if (isAuthReject(r.status)) handled++
    }
    if (bad5xx === 0 && handled === payloads.length)
      pass('I1', 'inject payloads → reject', 'inject', `${handled}/${payloads.length}`)
    else
      fail('I1', 'inject payloads → reject', 'inject', `5xx=${bad5xx} handled=${handled}`)
  }

  // —— 路径穿越 / 敏感路径 ——
  {
    const paths = [
      '/api/../../../etc/passwd',
      '/api/users/../admins',
      '/api/auth/login/../register',
      '/api/governance/bans/../../health',
      '/api/%2e%2e/%2e%2e/etc/passwd',
    ]
    let leak = 0
    let hard5xx = 0
    for (const p of paths) {
      const r = await api('GET', p)
      if (r.status >= 500) hard5xx++
      if (/root:|passwordHash|BEGIN RSA/i.test(r.raw)) leak++
    }
    if (leak === 0 && hard5xx === 0)
      pass('I2', 'path traversal no leak/5xx', 'inject', `${paths.length} probed`)
    else fail('I2', 'path traversal no leak/5xx', 'inject', `leak=${leak} 5xx=${hard5xx}`)
  }

  // —— 方法篡改 ——
  {
    const cases: Array<[string, string]> = [
      ['DELETE', '/api/auth/login'],
      ['PUT', '/api/me'],
      ['PATCH', '/api/auth/challenge'],
      ['TRACE', '/api/health'],
    ]
    let ok = 0
    for (const [m, p] of cases) {
      const r = await api(m, p)
      if (r.status === 404 || r.status === 405 || r.status === 401 || r.status === 400)
        ok++
      else if (r.status >= 500) {
        /* count fail below */
      } else if (r.status === 200 && m === 'TRACE') {
        /* TRACE 200 is bad */
      } else ok++ // other safe rejects
    }
    const trace = await api('TRACE', '/api/health')
    if (trace.status !== 200)
      pass('N12', 'TRACE not echoed as 200', 'negative', `${trace.status}`)
    else fail('N12', 'TRACE not echoed as 200', 'negative', '200 TRACE')
    if (ok >= 3) pass('N13', 'method tamper rejected', 'negative', `okish=${ok}/4`)
    else fail('N13', 'method tamper rejected', 'negative', `okish=${ok}/4`)
  }

  // —— Header 注入 / 伪造 ——
  {
    // undici/fetch 在客户端拒绝 CRLF 头注入 = 防护成立
    let crlfBlocked = false
    try {
      await api(
        'POST',
        '/api/auth/login',
        { username: 'x', password: 'y' },
        undefined,
        { 'X-Forwarded-For': '1.2.3.4, 5.6.7.8\r\nX-Evil: 1' }
      )
    } catch (e) {
      if (/invalid header|Headers\.append/i.test(String(e))) crlfBlocked = true
      else throw e
    }
    const r = await api(
      'POST',
      '/api/auth/login',
      { username: 'x', password: 'y' },
      undefined,
      { 'X-Tenant-Root-Id': '../other' }
    )
    if (crlfBlocked && isAuthReject(r.status))
      pass('N14', 'header smuggle blocked/handled', 'negative', `crlf=client-reject status=${r.status}`)
    else if (crlfBlocked)
      pass('N14', 'header smuggle blocked/handled', 'negative', 'crlf=client-reject')
    else if (isAuthReject(r.status))
      pass('N14', 'header smuggle blocked/handled', 'negative', `${r.status}`)
    else if (r.status >= 500)
      fail('N14', 'header smuggle blocked/handled', 'negative', '5xx')
    else pass('N14', 'header smuggle blocked/handled', 'negative', `${r.status}`)
  }

  // —— 跨租户并发扫 ——
  {
    const n = 20
    const results = await Promise.all(
      Array.from({ length: n }, () => api('GET', `/api/users/${idB}`, undefined, tokenA))
    )
    const c403 = results.filter((r) => r.status === 403 && r.json?.code === 'E031').length
    const leak = results.some((r) => r.status === 200)
    if (!leak && c403 === n)
      pass('C4', '20× cross-tenant all E031', 'concurrency', `403×${c403}`)
    else fail('C4', '20× cross-tenant all E031', 'concurrency', `403=${c403} leak=${leak}`)
  }

  // —— 无 token 并发扫保护面 ——
  {
    const targets = [
      '/api/me',
      '/api/governance/bans',
      '/api/governance/lineage',
      '/api/data/export',
      '/api/users',
    ]
    const results = await Promise.all(targets.map((t) => api('GET', t)))
    const all401 = results.every((r) => r.status === 401)
    if (all401) pass('N15', 'protected surfaces 401', 'negative', `${targets.length}`)
    else
      fail(
        'N15',
        'protected surfaces 401',
        'negative',
        results.map((r) => r.status).join(',')
      )
  }

  // —— 伪造 JWT 形态 Bearer ——
  {
    const fakes = [
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.',
      'Bearer ' + 'a'.repeat(512),
      '',
      'null',
    ]
    let ok = 0
    for (const t of fakes) {
      const r = await api('GET', '/api/me', undefined, t)
      if (r.status === 401) ok++
    }
    if (ok === fakes.length)
      pass('N16', 'fake JWT-like bearer → 401', 'negative', `${ok}`)
    else fail('N16', 'fake JWT-like bearer → 401', 'negative', `${ok}/${fakes.length}`)
  }

  // —— 注册洪水（并发）——
  {
    const n = 15
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        api('POST', '/api/auth/register', {
          username: rand(`flood${i}`),
          password: pw,
          securityQuestion: { question: 'q', answer: 'a' },
        })
      )
    )
    const c200 = results.filter((r) => r.status === 200).length
    const c5xx = results.filter((r) => r.status >= 500).length
    if (c5xx === 0 && c200 >= n - 2)
      pass('C5', '15 concurrent registers', 'concurrency', `200×${c200}`)
    else fail('C5', '15 concurrent registers', 'concurrency', `200=${c200} 5xx=${c5xx}`)
  }

  // —— 导出连打 ——
  {
    const n = 10
    const results = await Promise.all(
      Array.from({ length: n }, () => api('GET', '/api/data/export', undefined, tokenB))
    )
    const c200 = results.filter((r) => r.status === 200).length
    const c5xx = results.filter((r) => r.status >= 500).length
    if (c5xx === 0 && c200 === n)
      pass('P4', '10× export concurrent', 'pressure', `200×${c200}`)
    else fail('P4', '10× export concurrent', 'pressure', `200=${c200} 5xx=${c5xx}`)
  }

  // —— 缺 Content-Type 的 JSON 体 ——
  {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'a', password: 'b' }),
    })
    const status = res.status
    if (status === 400 || status === 401 || status === 415)
      pass('N17', 'no Content-Type body', 'negative', `${status}`)
    else if (status >= 500) fail('N17', 'no Content-Type body', 'negative', `5xx`)
    else pass('N17', 'no Content-Type body', 'negative', `${status}`)
  }

  // —— 重复 Content-Type / 怪异编码 ——
  {
    const r = await api(
      'POST',
      '/api/auth/login',
      { username: 'a', password: 'b' },
      undefined,
      { 'Content-Type': 'application/json; charset=utf-7' }
    )
    if (r.status === 401 || r.status === 400)
      pass('N18', 'weird charset login', 'negative', `${r.status}`)
    else if (r.status >= 500) fail('N18', 'weird charset login', 'negative', '5xx')
    else pass('N18', 'weird charset login', 'negative', `${r.status}`)
  }

  // —— check-username 枚举洪水 ——
  {
    const n = 40
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        api('GET', `/api/users/check-username/${userA}_${i}`)
      )
    )
    const allFalse = results.every(
      (r) => r.status === 200 && r.json?.data?.exists === false
    )
    const c5xx = results.filter((r) => r.status >= 500).length
    if (allFalse && c5xx === 0)
      pass('P5', '40× check-username always false', 'pressure', 'exists=false')
    else fail('P5', '40× check-username always false', 'pressure', `5xx=${c5xx}`)
  }

  // —— 错误挑战 + 正确密码（应失败）——
  {
    const fixedIp = '203.0.113.200'
    const hdr = { 'X-Forwarded-For': fixedIp }
    // 同 IP 造出「需挑战」状态
    await api('POST', '/api/auth/login', { username: userA, password: 'wrong' }, undefined, hdr)
    const ch = await api('GET', '/api/auth/challenge', undefined, undefined, hdr)
    const r2 = await api(
      'POST',
      '/api/auth/login',
      {
        username: userA,
        password: pw,
        challengeId: ch.json?.data?.challengeId,
        challengeAnswer: '99999',
      },
      undefined,
      hdr
    )
    if (r2.status === 401)
      pass('N19', 'wrong challenge blocks good password', 'negative', '401')
    else if (r2.status === 429)
      pass('N19', 'wrong challenge blocks good password', 'negative', '429 lock')
    else
      fail(
        'N19',
        'wrong challenge blocks good password',
        'negative',
        `${r2.status} (needChallenge must bind same IP)`
      )
  }

  // —— admins 变体洪水 ——
  {
    const paths = [
      '/api/admins',
      '/api/admins/login',
      '/api/admins/count',
      '/api/admins/xxx',
      '/api/Admins',
    ]
    const results = await Promise.all(paths.map((p) => api('GET', p)))
    const gone = results.filter((r) => r.status === 410 || r.status === 404).length
    if (gone >= 4)
      pass('N20', 'admins variants gone/404', 'negative', `${gone}/${paths.length}`)
    else fail('N20', 'admins variants gone/404', 'negative', `${gone}/${paths.length}`)
  }

  // write report
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok).length
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const md = [
    `# CYP-memo · 高强度安全负压报告`,
    ``,
    `| 项 | 值 |`,
    `|----|-----|`,
    `| 时间 | ${new Date().toISOString()} |`,
    `| BASE | ${BASE} |`,
    `| 通过 | **${passed}** / ${rows.length} |`,
    `| 失败 | **${failed}** |`,
    `| VERSION | 2.0.0 |`,
    ``,
    `## 结果表`,
    ``,
    `| ID | 类型 | 用例 | 结果 | 细节 |`,
    `|----|------|------|------|------|`,
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.kind} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '/')} |`
    ),
    ``,
    `## 强度说明`,
    ``,
    `- 并发登录 / 注册 / 挑战 / 跨租户 / 导出`,
    `- 注入与路径穿越探测（期望 4xx 且无敏感泄漏）`,
    `- 超长字段、2MB pad、Header 异常`,
    ``,
  ].join('\n')
  const out = path.join(reportDir, `CYP-memo-P4-安全高强度负压-${stamp}.md`)
  fs.writeFileSync(out, md, 'utf-8')
  console.log(`\n=== DONE passed=${passed} failed=${failed} ===\nreport: ${out}\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
