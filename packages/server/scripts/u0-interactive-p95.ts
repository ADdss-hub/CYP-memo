/**
 * B8：U0 交互窗 p95 对账（隔离实例 · 非满额 U0）
 * 质量阈抄 1.6.3：交互 request/p95 = 500/300；本探针对 GET 交互路径取样。
 *
 *   CYP_LOAD_ISOLATED=1 CYP_LOAD_EXPECT_DATA_DIR=... CYP_API_BASE=https://127.0.0.1:15170 \
 *   CYP_LOAD_TOKEN=... CYP_LOAD_USER_ID=... \
 *   pnpm --filter @cyp-memo/server exec tsx scripts/u0-interactive-p95.ts
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { assertLoadIsolation } from './load-isolation-gate.js'

const BASE = (process.env.CYP_API_BASE || '').replace(/\/$/, '')
if (!BASE) throw new Error('CYP_API_BASE required')
const TOKEN = process.env.CYP_LOAD_TOKEN || ''
const USER_ID = process.env.CYP_LOAD_USER_ID || ''
const N = Math.max(200, Number(process.env.CYP_U0_INTERACTIVE_N || 3000))
const WORKERS = Math.max(1, Number(process.env.CYP_U0_INTERACTIVE_WORKERS || 4))
const INTERACTIVE_P95 = 300
const INTERACTIVE_REQ = 500

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]
}

async function main() {
  await assertLoadIsolation({ apiBase: BASE, scriptName: 'u0-interactive-p95' })
  if (!TOKEN || !USER_ID) throw new Error('CYP_LOAD_TOKEN and CYP_LOAD_USER_ID required')

  const paths = ['/api/health', '/api/memos']
  const samples: number[] = []
  let ok = 0
  let hard = 0
  let next = 0
  const wall0 = performance.now()

  async function worker() {
    while (true) {
      const i = next++
      if (i >= N) return
      const p = paths[i % paths.length]
      const t0 = performance.now()
      try {
        const res = await fetch(`${BASE}${p}`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
          signal: AbortSignal.timeout(15_000),
        })
        const ms = performance.now() - t0
        samples.push(ms)
        if (res.ok) ok += 1
        else hard += 1
      } catch {
        samples.push(performance.now() - t0)
        hard += 1
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()))
  const wallMs = performance.now() - wall0
  const sorted = [...samples].sort((a, b) => a - b)
  const p95 = percentile(sorted, 95)
  const p50 = percentile(sorted, 50)
  const report = {
    at: new Date().toISOString(),
    kind: 'u0_interactive_p95_reconcile',
    base: BASE,
    n: samples.length,
    ok,
    hard,
    workers: WORKERS,
    wallMs: Math.round(wallMs),
    rps: Math.round((samples.length / Math.max(0.001, wallMs / 1000)) * 10) / 10,
    p50: Math.round(p50),
    p95: Math.round(p95),
    max: Math.round(sorted[sorted.length - 1] || 0),
    thresholds: { interactive_p95_ms: INTERACTIVE_P95, interactive_request_ms: INTERACTIVE_REQ },
    vsInteractiveP95: p95 <= INTERACTIVE_P95,
    vsInteractiveRequest: p95 <= INTERACTIVE_REQ,
    note: '短窗对账，不是 U0 满额 10 万次；不得改 PERF-EVID u_tier 为 U1 通过',
  }

  const reportDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../reports/P6')
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const out = path.join(reportDir, `u0-interactive-p95-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf-8')
  console.log(JSON.stringify({ ...report, report: out }, null, 2))
  if (hard / Math.max(1, samples.length) > 0.02) process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
