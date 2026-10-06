/**
 * CYP-memo · 容量压测（真实环境 · 200 人峰值 / 约 10 万次访问量级）
 *
 * 阶段：
 *  1) 基线串行
 *  2) 并发爬坡 50 / 100 / 200（模拟同时在线）
 *  3) 可承载并发下总量冲刺（默认 C=50 打满约 10 万，避免无效刷 429）
 *
 *   pnpm exec tsx scripts/capacity-pressure-200u.ts
 *
 * 环境变量：
 *   CYP_LOAD_ISOLATED=1 + CYP_LOAD_EXPECT_DATA_DIR=专用压测 dataDir（硬门禁，禁止产品库）
 *   CYP_API_BASE / CYP_LOAD_TOKEN / CYP_LOAD_USER_ID / CYP_LOAD_TOTAL / CYP_LOAD_SUSTAIN_CONC
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import initSqlJs from 'sql.js'
import { assertLoadIsolation } from './load-isolation-gate.js'

const BASE = (process.env.CYP_API_BASE || '').replace(/\/$/, '')
if (!BASE) {
  throw new Error('CYP_API_BASE required — 禁止默认打产品 :5170')
}
const TOTAL = Math.max(1000, Number(process.env.CYP_LOAD_TOTAL || 100000))
const SUSTAIN_CONC = Math.max(1, Number(process.env.CYP_LOAD_SUSTAIN_CONC || 50))
const SKIP_RAMP = process.env.CYP_LOAD_SKIP_RAMP === '1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isolatedRoot = path.resolve(
  String(process.env.CYP_LOAD_EXPECT_DATA_DIR || '').trim() || path.join(__dirname, '../data-loadtest')
)
const dbFile = path.join(isolatedRoot, 'database.sqlite')
const reportDir = path.resolve(__dirname, '../../../reports/P6')

type Sample = { ms: number; status: number; path: string; ok: boolean }

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]
}

function summarize(label: string, samples: Sample[]) {
  const ok = samples.filter((s) => s.ok)
  const fail = samples.length - ok.length
  const times = ok.map((s) => s.ms).sort((a, b) => a - b)
  const byStatus = new Map<number, number>()
  for (const s of samples) byStatus.set(s.status, (byStatus.get(s.status) || 0) + 1)
  return {
    label,
    n: samples.length,
    ok: ok.length,
    fail,
    errorRate: samples.length ? fail / samples.length : 0,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    max: times.length ? times[times.length - 1] : 0,
    status: Object.fromEntries(byStatus),
  }
}

async function resolveAuth(): Promise<{ userId: string; token: string }> {
  if (process.env.CYP_LOAD_TOKEN && process.env.CYP_LOAD_USER_ID) {
    return { userId: process.env.CYP_LOAD_USER_ID, token: process.env.CYP_LOAD_TOKEN }
  }
  const expectDir = String(process.env.CYP_LOAD_EXPECT_DATA_DIR || '').trim()
  if (!expectDir) {
    throw new Error('set CYP_LOAD_TOKEN+CYP_LOAD_USER_ID or CYP_LOAD_EXPECT_DATA_DIR for auth')
  }
  const isolatedDb = path.join(path.resolve(expectDir), 'database.sqlite')
  if (!fs.existsSync(isolatedDb)) {
    throw new Error(`isolated auth db missing: ${isolatedDb}`)
  }
  const require = createRequire(import.meta.url)
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      require.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
  })
  const buf = fs.readFileSync(isolatedDb)
  const db = new SQL.Database(buf)
  const res = db.exec(
    "SELECT id, token FROM users WHERE username = 'admin123' AND token IS NOT NULL LIMIT 1"
  )
  db.close()
  if (!res.length || !res[0].values.length) throw new Error('admin123 token missing on isolated db')
  const [userId, token] = res[0].values[0] as [string, string]
  return { userId: String(userId), token: String(token) }
}

async function hit(token: string, urlPath: string, forwardedFor: string): Promise<Sample> {
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}${urlPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        // 模拟多用户来自不同客户端 IP，避免单 IP 分钟预算把多用户场景测成假阴性
        'X-Forwarded-For': forwardedFor,
      },
    })
    await res.arrayBuffer()
    return {
      ms: performance.now() - t0,
      status: res.status,
      path: urlPath,
      ok: res.status >= 200 && res.status < 400,
    }
  } catch {
    return { ms: performance.now() - t0, status: 0, path: urlPath, ok: false }
  }
}

function userPaths(userId: string): string[] {
  return [
    '/api/health',
    '/api/memos',
    `/api/users/${userId}/files`,
    `/api/users/${userId}/storage`,
    `/api/users/${userId}/notifications`,
  ]
}

async function runPool(
  label: string,
  concurrency: number,
  totalReqs: number,
  token: string,
  userId: string
) {
  const paths = userPaths(userId)
  const samples: Sample[] = []
  let next = 0
  const wall0 = performance.now()
  const mtime0 = fs.existsSync(dbFile) ? fs.statSync(dbFile).mtimeMs : 0

  async function worker(workerId: number) {
    const forwardedFor = `203.0.113.${(workerId % 200) + 1}`
    while (true) {
      const i = next++
      if (i >= totalReqs) return
      samples.push(await hit(token, paths[i % paths.length], forwardedFor))
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, id) => worker(id)))
  const wallMs = performance.now() - wall0
  const mtime1 = fs.existsSync(dbFile) ? fs.statSync(dbFile).mtimeMs : 0
  const summary = {
    ...summarize(label, samples),
    concurrency,
    wallMs: Math.round(wallMs),
    rps: Math.round((samples.length / (wallMs / 1000)) * 10) / 10,
    businessDbMtimeChanged: mtime0 !== mtime1,
  }
  console.log(
    `[${label}] n=${summary.n} conc=${concurrency} wall=${summary.wallMs}ms rps=${summary.rps} ` +
      `ok=${summary.ok} fail=${summary.fail} err=${(summary.errorRate * 100).toFixed(2)}% ` +
      `p50=${summary.p50.toFixed(0)} p95=${summary.p95.toFixed(0)} p99=${summary.p99.toFixed(0)} max=${summary.max.toFixed(0)} ` +
      `bizMtimeChanged=${summary.businessDbMtimeChanged} status=${JSON.stringify(summary.status)}`
  )
  return summary
}

async function main() {
  await assertLoadIsolation({ apiBase: BASE, scriptName: 'capacity-pressure-200u' })
  console.log(`CYP-memo capacity pressure · base=${BASE} total=${TOTAL} sustainConc=${SUSTAIN_CONC}`)
  const health = await fetch(`${BASE}/api/health`)
  if (!health.ok) throw new Error(`health ${health.status}`)
  const healthJson = await health.json()
  console.log('health', JSON.stringify(healthJson?.data?.status), 'uptime', healthJson?.data?.uptime)

  const { userId, token } = await resolveAuth()
  console.log('auth userId', userId, 'tokenLen', token.length)

  const results: any[] = []

  {
    const samples: Sample[] = []
    const paths = userPaths(userId)
    const t0 = performance.now()
    for (let i = 0; i < 50; i++) samples.push(await hit(token, paths[i % paths.length], '203.0.113.250'))
    const wallMs = performance.now() - t0
    const s = {
      ...summarize('baseline_serial_50', samples),
      concurrency: 1,
      wallMs: Math.round(wallMs),
      rps: Math.round((50 / (wallMs / 1000)) * 10) / 10,
      businessDbMtimeChanged: false,
    }
    console.log(
      `[baseline] n=50 wall=${s.wallMs}ms rps=${s.rps} p50=${s.p50.toFixed(0)} p95=${s.p95.toFixed(0)} p99=${s.p99.toFixed(0)}`
    )
    results.push(s)
  }

  if (!SKIP_RAMP) {
    results.push(await runPool('ramp_c50', 50, 50 * 20, token, userId))
    results.push(await runPool('ramp_c100', 100, 100 * 20, token, userId))
    results.push(await runPool('ramp_c200', 200, 200 * 15, token, userId))
  } else {
    console.log('[skip] ramp phases (reuse prior peak evidence)')
  }

  const used = results.reduce((a, r) => a + (r.n || 0), 0)
  const remain = Math.max(0, TOTAL - used)
  if (remain > 0) {
    const chunk = Math.min(remain, 5000)
    let left = remain
    let part = 0
    while (left > 0) {
      const n = Math.min(chunk, left)
      part += 1
      results.push(
        await runPool(`sustain_c${SUSTAIN_CONC}_p${part}`, SUSTAIN_CONC, n, token, userId)
      )
      left -= n
    }
  }

  const sustainPhases = results.filter((r) => String(r.label).startsWith('sustain_'))
  const sustain = sustainPhases.length
    ? {
        label: 'sustain_merged',
        n: sustainPhases.reduce((a, r) => a + r.n, 0),
        ok: sustainPhases.reduce((a, r) => a + r.ok, 0),
        fail: sustainPhases.reduce((a, r) => a + r.fail, 0),
        errorRate:
          sustainPhases.reduce((a, r) => a + r.fail, 0) /
          Math.max(1, sustainPhases.reduce((a, r) => a + r.n, 0)),
        p50: Math.max(...sustainPhases.map((r) => r.p50)),
        p95: Math.max(...sustainPhases.map((r) => r.p95)),
        p99: Math.max(...sustainPhases.map((r) => r.p99)),
        rps:
          Math.round(
            (sustainPhases.reduce((a, r) => a + r.n, 0) /
              Math.max(0.001, sustainPhases.reduce((a, r) => a + r.wallMs, 0) / 1000)) *
              10
          ) / 10,
      }
    : null
  const ramp200 = results.find((r) => r.label === 'ramp_c200')
  const ramp50 = results.find((r) => r.label === 'ramp_c50')
  const totalN = results.reduce((a, r) => a + (r.n || 0), 0)
  const totalFail = results.reduce((a, r) => a + (r.fail || 0), 0)

  const verdict = {
    targetUsers: 200,
    targetVolume: TOTAL,
    actualRequests: totalN,
    totalFailures: totalFail,
    overallErrorRate: totalN ? totalFail / totalN : 1,
    peakConcurrent: 200,
    peakErrorRate: ramp200?.errorRate ?? null,
    peakP95: ramp200?.p95 ?? null,
    peakP99: ramp200?.p99 ?? null,
    comfortConcurrent: ramp50 && ramp50.errorRate < 0.01 ? 50 : null,
    volumeRps: sustain?.rps ?? null,
    volumeP95: sustain?.p95 ?? null,
    volumeErrorRate: sustain?.errorRate ?? null,
    passPeak200: Boolean(
      ramp200 && ramp200.errorRate < 0.05 && ramp200.p95 < 3000 && ramp200.p99 < 8000
    ),
    passVolume100k: Boolean(
      sustain && sustain.errorRate < 0.02 && sustain.p95 < 3000 && totalN >= TOTAL * 0.95
    ),
  }

  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const out = path.join(reportDir, `capacity-pressure-200u-${Date.now()}.json`)
  fs.writeFileSync(
    out,
    JSON.stringify({ at: new Date().toISOString(), base: BASE, verdict, phases: results }, null, 2),
    'utf-8'
  )
  console.log('\n=== VERDICT ===')
  console.log(JSON.stringify(verdict, null, 2))
  console.log('report', out)
  process.exit(verdict.passVolume100k || verdict.passPeak200 ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
