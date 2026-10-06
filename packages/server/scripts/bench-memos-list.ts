/**
 * 列表热点基准：只读快照读取 admin123 token，对运行态 GET /api/memos 测 p50/p95/p99。
 * 用法（在 packages/server 下）：tsx scripts/bench-memos-list.ts
 * 环境变量：BENCH_N（顺序样本数，默认120） BENCH_CONC（并发突发数，默认30） CYP_API_BASE
 */
import initSqlJs from 'sql.js'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const req = createRequire(path.join(process.cwd(), 'package.json'))
const SQL = await initSqlJs({
  locateFile: (file: string) =>
    req.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
})

const dbPath = path.resolve(process.cwd(), 'data/database.sqlite')
const buf = fs.readFileSync(dbPath)
const db = new SQL.Database(buf) // 只读内存快照，不写盘
const res = db.exec("SELECT id, token, tenantRootId FROM users WHERE username='admin123' AND token IS NOT NULL LIMIT 1")
if (!res.length || !res[0].values.length) {
  console.error('NO admin123 token found in database.sqlite')
  process.exit(2)
}
const [userId, token, tenantRootId] = res[0].values[0] as string[]
db.close()
console.error(`token acquired userId=${userId} tenantRootId=${tenantRootId}`)

const BASE = process.env.CYP_API_BASE || 'http://127.0.0.1:5170'
const N = Number(process.env.BENCH_N || 120)
const CONC = Number(process.env.BENCH_CONC || 30)
const WARMUP = Number(process.env.BENCH_WARMUP || 20)

async function one(): Promise<number> {
  const t0 = performance.now()
  const r = await fetch(`${BASE}/api/memos`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  })
  await r.arrayBuffer()
  return performance.now() - t0
}

// 预热
for (let i = 0; i < WARMUP; i++) await one()

const benchStart = Date.now()

const samples: number[] = []
for (let i = 0; i < N; i++) samples.push(await one())
const burst = await Promise.all(Array.from({ length: CONC }, () => one()))
samples.push(...burst)
const benchEnd = Date.now()

samples.sort((a, b) => a - b)
const pct = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]
const sum = samples.reduce((a, b) => a + b, 0)
console.log(
  JSON.stringify({
    n: samples.length,
    p50: +pct(0.5).toFixed(1),
    p90: +pct(0.9).toFixed(1),
    p95: +pct(0.95).toFixed(1),
    p99: +pct(0.99).toFixed(1),
    max: +samples[samples.length - 1].toFixed(1),
    avg: +(sum / samples.length).toFixed(1),
  }),
)
console.error(`BENCH_WINDOW=${benchStart}-${benchEnd}`)
