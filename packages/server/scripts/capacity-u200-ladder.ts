/**
 * CYP-memo · U200×4 统一压测阶梯（军械库 1.7 / R-016 / cyp-load-test）
 *
 * U0: 200 并发 · 访问 10万 · 存储 10万（分列）
 * U1: ×4 · 800 · 40万 · 40万
 * U2: ×16 · 3200 · 160万 · 160万
 * U3: ×64 · 12800 · 640万 · 640万
 *
 * 禁宕机熔断：ready 红 / 硬失败率持续 >2% / 进程不可达 → 立即停压
 * 档间冷却 ≥60s；每档后检测→设置→调优→预警→告知留痕
 *
 *   pnpm exec tsx scripts/capacity-u200-ladder.ts
 *
 * 环境变量：
 *   CYP_API_BASE / CYP_LOAD_TOKEN / CYP_LOAD_USER_ID
 *   CYP_U_STOP_AFTER=U0|U1|U2|U3（默认 U3，熔断亦可提前停）
 *   CYP_U_MAX_WORKERS（负载端工人上限，默认 400，防本机 OOM）
 *   CYP_U_COOLDOWN_MS（档间冷却，默认 60000）
 *   CYP_U_CHUNK（分片进度日志，默认 5000）
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import initSqlJs from 'sql.js'

const BASE = process.env.CYP_API_BASE || 'http://127.0.0.1:5170'
const STOP_AFTER = (process.env.CYP_U_STOP_AFTER || 'U3').toUpperCase()
const MAX_WORKERS = Math.max(8, Number(process.env.CYP_U_MAX_WORKERS || 400))
const COOLDOWN_MS = Math.max(60_000, Number(process.env.CYP_U_COOLDOWN_MS || 60_000))
const CHUNK = Math.max(500, Number(process.env.CYP_U_CHUNK || 5000))
const HARD_ERR_CIRCUIT = 0.02 // 1.6.3 窗错误率 1% ×2
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
const dbFile = path.join(dataDir, 'database.sqlite')
const reportDir = path.resolve(__dirname, '../../../reports/P6')

type TierId = 'U0' | 'U1' | 'U2' | 'U3'
type Sample = {
  ms: number
  status: number
  path: string
  kind: 'access' | 'storage'
  hardFail: boolean
  rateLimited: boolean
  ok: boolean
}

const TIERS: Array<{
  id: TierId
  users: number
  access: number
  storage: number
}> = [
  { id: 'U0', users: 200, access: 100_000, storage: 100_000 },
  { id: 'U1', users: 800, access: 400_000, storage: 400_000 },
  { id: 'U2', users: 3_200, access: 1_600_000, storage: 1_600_000 },
  { id: 'U3', users: 12_800, access: 6_400_000, storage: 6_400_000 },
]

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[i]
}

function summarize(label: string, samples: Sample[]) {
  const ok = samples.filter((s) => s.ok)
  const hard = samples.filter((s) => s.hardFail)
  const rl = samples.filter((s) => s.rateLimited)
  const times = ok.map((s) => s.ms).sort((a, b) => a - b)
  const byStatus = new Map<number, number>()
  for (const s of samples) byStatus.set(s.status, (byStatus.get(s.status) || 0) + 1)
  return {
    label,
    n: samples.length,
    ok: ok.length,
    hardFail: hard.length,
    rateLimited: rl.length,
    softFail: samples.length - ok.length - hard.length - rl.length,
    hardErrorRate: samples.length ? hard.length / samples.length : 0,
    rateLimitRate: samples.length ? rl.length / samples.length : 0,
    // 硬失败才进 1.6.3 窗错误率；429 分列韧性
    errorRate: samples.length ? hard.length / samples.length : 0,
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
  if (!res.length || !res[0].values.length) throw new Error('admin123 token missing — login once in real env')
  const [userId, token] = res[0].values[0] as [string, string]
  return { userId: String(userId), token: String(token) }
}

async function checkReady(): Promise<{ ok: boolean; status: number; body?: unknown }> {
  try {
    const res = await fetch(`${BASE}/healthz/ready`, { signal: AbortSignal.timeout(15_000) })
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { ok: res.status === 200, status: res.status, body }
  } catch {
    return { ok: false, status: 0 }
  }
}

function accessPaths(userId: string): string[] {
  return [
    '/api/health',
    '/api/memos',
    `/api/users/${userId}/files`,
    `/api/users/${userId}/storage`,
    `/api/users/${userId}/notifications`,
  ]
}

async function hitAccess(
  token: string,
  urlPath: string,
  forwardedFor: string
): Promise<Sample> {
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}${urlPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': forwardedFor,
      },
      signal: AbortSignal.timeout(30_000),
    })
    await res.arrayBuffer()
    const rateLimited = res.status === 429
    const hardFail = res.status === 0 || res.status >= 500
    const ok = res.status >= 200 && res.status < 400
    return {
      ms: performance.now() - t0,
      status: res.status,
      path: urlPath,
      kind: 'access',
      hardFail,
      rateLimited,
      ok,
    }
  } catch {
    return {
      ms: performance.now() - t0,
      status: 0,
      path: urlPath,
      kind: 'access',
      hardFail: true,
      rateLimited: false,
      ok: false,
    }
  }
}

async function hitStorage(
  token: string,
  memoId: string,
  userId: string,
  seq: number,
  forwardedFor: string
): Promise<Sample> {
  const t0 = performance.now()
  const urlPath = `/api/memos/${memoId}`
  try {
    const res = await fetch(`${BASE}${urlPath}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': forwardedFor,
        'Idempotency-Key': `u-ladder-patch-${seq}-${randomUUID()}`,
      },
      body: JSON.stringify({
        title: `u-ladder-${seq % 10000}`,
        content: `U-ladder storage write #${seq} @ ${new Date().toISOString()} user=${userId}`,
        updatedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(60_000),
    })
    await res.arrayBuffer()
    const rateLimited = res.status === 429
    const hardFail = res.status === 0 || res.status >= 500
    const ok = res.status >= 200 && res.status < 400
    return {
      ms: performance.now() - t0,
      status: res.status,
      path: urlPath,
      kind: 'storage',
      hardFail,
      rateLimited,
      ok,
    }
  } catch {
    return {
      ms: performance.now() - t0,
      status: 0,
      path: urlPath,
      kind: 'storage',
      hardFail: true,
      rateLimited: false,
      ok: false,
    }
  }
}

async function ensureMemoPool(token: string, userId: string, size: number): Promise<string[]> {
  const ids: string[] = []
  // 先拉已有列表
  try {
    const res = await fetch(`${BASE}/api/memos`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '203.0.113.250' },
    })
    const json = (await res.json()) as { data?: Array<{ id: string }> }
    const existing = (json.data || []).map((m) => m.id).filter(Boolean)
    ids.push(...existing.slice(0, size))
  } catch {
    /* create below */
  }
  while (ids.length < size) {
    const res = await fetch(`${BASE}/api/memos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': `203.0.113.${(ids.length % 200) + 1}`,
        'Idempotency-Key': `u-ladder-seed-${ids.length}-${randomUUID()}`,
      },
      body: JSON.stringify({
        userId,
        title: `u-ladder-pool-${ids.length}`,
        content: 'U200 ladder storage pool seed',
        tags: ['u-ladder'],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`seed memo failed ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as { data?: { id?: string } }
    const id = json.data?.id
    if (!id) throw new Error('seed memo missing id')
    ids.push(id)
  }
  return ids
}

type CircuitState = { tripped: boolean; reason: string }

/** 水库抽样：大档位不全量存 Sample，防 OOM */
class TimingReservoir {
  private times: number[] = []
  private readonly cap: number
  private seen = 0
  constructor(cap = 12_000) {
    this.cap = cap
  }
  push(ms: number) {
    this.seen += 1
    if (this.times.length < this.cap) {
      this.times.push(ms)
      return
    }
    const j = Math.floor(Math.random() * this.seen)
    if (j < this.cap) this.times[j] = ms
  }
  percentiles() {
    const sorted = [...this.times].sort((a, b) => a - b)
    return {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      reservoirN: sorted.length,
      seen: this.seen,
    }
  }
}

async function runPhase(opts: {
  tierId: TierId
  kind: 'access' | 'storage'
  targetUsers: number
  total: number
  token: string
  userId: string
  memoIds: string[]
  circuit: CircuitState
}): Promise<{
  label: string
  n: number
  ok: number
  hardFail: number
  rateLimited: number
  softFail: number
  hardErrorRate: number
  rateLimitRate: number
  errorRate: number
  p50: number
  p95: number
  p99: number
  max: number
  status: Record<string, number>
  concurrency: number
  targetUsers: number
  wallMs: number
  rps: number
  businessDbMtimeChanged: boolean
  aborted: boolean
  abortReason?: string
}> {
  const { tierId, kind, targetUsers, total, token, userId, memoIds, circuit } = opts
  const workers = Math.min(targetUsers, MAX_WORKERS)
  const label = `${tierId}_${kind}`
  const paths = accessPaths(userId)
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })

  let next = 0
  let aborted = false
  let abortReason = ''
  const wall0 = performance.now()
  const mtime0 = fs.existsSync(dbFile) ? fs.statSync(dbFile).mtimeMs : 0
  let completed = 0
  let okTotal = 0
  let hardTotal = 0
  let rlTotal = 0
  let softTotal = 0
  let lastProgressAt = 0
  let lastReadyCheck = 0
  let windowHard = 0
  let windowN = 0
  const byStatus = new Map<number, number>()
  const reservoir = new TimingReservoir()

  console.error(
    `[${label}] start targetUsers=${targetUsers} workers=${workers} total=${total} (MAX_WORKERS=${MAX_WORKERS})`
  )

  function emitProgress(force = false) {
    if (!force && completed - lastProgressAt < 1000 && completed < total) return
    lastProgressAt = completed
    const wall = performance.now() - wall0
    const rps = completed / Math.max(0.001, wall / 1000)
    const line =
      `[${label}] progress ${completed}/${total} rps~${rps.toFixed(1)} ` +
      `hard=${hardTotal} rl=${rlTotal} wall=${Math.round(wall)}ms`
    console.error(line)
    try {
      fs.writeFileSync(
        path.join(reportDir, 'capacity-u200-ladder-progress.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            label,
            completed,
            total,
            hardTotal,
            rlTotal,
            rps: Math.round(rps * 10) / 10,
            wallMs: Math.round(wall),
          },
          null,
          2
        ),
        'utf-8'
      )
    } catch {
      /* ignore */
    }
  }

  async function worker(workerId: number) {
    const forwardedFor = `203.0.113.${(workerId % 250) + 1}`
    while (true) {
      if (circuit.tripped || aborted) return
      const i = next++
      if (i >= total) return

      const sample =
        kind === 'access'
          ? await hitAccess(token, paths[i % paths.length], forwardedFor)
          : await hitStorage(token, memoIds[i % memoIds.length], userId, i, forwardedFor)

      if (circuit.tripped || aborted) return

      completed += 1
      byStatus.set(sample.status, (byStatus.get(sample.status) || 0) + 1)
      if (sample.ok) {
        okTotal += 1
        reservoir.push(sample.ms)
      } else if (sample.hardFail) {
        hardTotal += 1
        windowHard += 1
      } else if (sample.rateLimited) {
        rlTotal += 1
      } else {
        softTotal += 1
      }
      windowN += 1
      emitProgress()

      if (windowN >= CHUNK) {
        const rate = windowHard / windowN
        if (rate > HARD_ERR_CIRCUIT) {
          if (!circuit.tripped) {
            abortReason = `hardErrorRate ${(rate * 100).toFixed(2)}% > ${(HARD_ERR_CIRCUIT * 100).toFixed(0)}% in last ${windowN}`
            circuit.tripped = true
            circuit.reason = abortReason
            console.error(`[CIRCUIT] ${label} ${abortReason}`)
          }
          aborted = true
          return
        }
        windowHard = 0
        windowN = 0
        const now = Date.now()
        if (now - lastReadyCheck > 15_000) {
          lastReadyCheck = now
          const ready = await checkReady()
          if (!ready.ok) {
            if (!circuit.tripped) {
              abortReason = `ready not green status=${ready.status}`
              circuit.tripped = true
              circuit.reason = abortReason
              console.error(`[CIRCUIT] ${label} ${abortReason}`)
            }
            aborted = true
            return
          }
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, id) => worker(id)))
  emitProgress(true)
  const wallMs = performance.now() - wall0
  const mtime1 = fs.existsSync(dbFile) ? fs.statSync(dbFile).mtimeMs : 0
  const pct = reservoir.percentiles()
  const summary = {
    label,
    n: completed,
    ok: okTotal,
    hardFail: hardTotal,
    rateLimited: rlTotal,
    softFail: softTotal,
    hardErrorRate: completed ? hardTotal / completed : 0,
    rateLimitRate: completed ? rlTotal / completed : 0,
    errorRate: completed ? hardTotal / completed : 0,
    p50: pct.p50,
    p95: pct.p95,
    p99: pct.p99,
    max: pct.max,
    status: Object.fromEntries(byStatus),
    concurrency: workers,
    targetUsers,
    wallMs: Math.round(wallMs),
    rps: Math.round((completed / Math.max(0.001, wallMs / 1000)) * 10) / 10,
    businessDbMtimeChanged: mtime0 !== mtime1,
    aborted,
    abortReason: abortReason || undefined,
  }
  console.error(
    `[${label}] done n=${summary.n}/${total} wall=${summary.wallMs}ms rps=${summary.rps} ` +
      `ok=${summary.ok} hard=${summary.hardFail} rl=${summary.rateLimited} ` +
      `hardErr=${(summary.hardErrorRate * 100).toFixed(2)}% rlRate=${(summary.rateLimitRate * 100).toFixed(2)}% ` +
      `p50=${summary.p50.toFixed(0)} p95=${summary.p95.toFixed(0)} p99=${summary.p99.toFixed(0)} ` +
      `bizMtimeChanged=${summary.businessDbMtimeChanged} aborted=${aborted} ` +
      `status=${JSON.stringify(summary.status)}`
  )
  return summary
}

function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0
  const raw = fs.readFileSync(filePath, 'utf-8')
  if (!raw.trim()) return 0
  return raw.split(/\r?\n/).filter((l) => l.trim()).length
}

async function postTierClosedLoop(
  tierId: TierId,
  accessSummary: Awaited<ReturnType<typeof runPhase>> | null,
  storageSummary: Awaited<ReturnType<typeof runPhase>> | null
) {
  const ready = await checkReady()
  let health: any = null
  try {
    const res = await fetch(`${BASE}/api/health`)
    health = await res.json()
  } catch {
    health = null
  }

  const alertsPath = path.join(dataDir, 'alerts', 'outbox.jsonl')
  const elasticityPath = path.join(dataDir, 'elasticity', 'decisions.jsonl')
  const notifyPath = path.join(dataDir, 'notify', 'outbox.jsonl')
  const alertsN = countLines(alertsPath)
  const elasticityN = countLines(elasticityPath)
  const notifyN = countLines(notifyPath)

  const detect = {
    access: accessSummary
      ? {
          n: accessSummary.n,
          hardErrorRate: accessSummary.hardErrorRate,
          rateLimitRate: accessSummary.rateLimitRate,
          p95: accessSummary.p95,
          p99: accessSummary.p99,
          rps: accessSummary.rps,
        }
      : null,
    storage: storageSummary
      ? {
          n: storageSummary.n,
          hardErrorRate: storageSummary.hardErrorRate,
          rateLimitRate: storageSummary.rateLimitRate,
          p95: storageSummary.p95,
          p99: storageSummary.p99,
          rps: storageSummary.rps,
          businessDbMtimeChanged: storageSummary.businessDbMtimeChanged,
        }
      : null,
    readyOk: ready.ok,
    storageSpace: health?.data?.storageSpace || health?.data?.diskSpace || null,
  }

  // 设置：记录当前配置可观测快照（不擅自改生产配置；弹性若已收紧则记入）
  const setStep = {
    note: '配置管控保持压前注入；本档不直接改源码常量',
    apiBudgetObserved: 'gateway XFF + apiRpm',
    maxWorkersCap: MAX_WORKERS,
  }

  // 调优建议（可逆）
  const tune: string[] = []
  if (accessSummary && accessSummary.p95 > 500) {
    tune.push(`访问 p95=${accessSummary.p95.toFixed(0)}ms > 交互硬阈 300–500；保持并发舒适区或调高容量包协商`)
  }
  if (storageSummary && storageSummary.p95 > 2000) {
    tune.push(`存储写 p95=${storageSummary.p95.toFixed(0)}ms > 标准/重写阈；关注 sql.js 整库落盘与写串行`)
  }
  if (accessSummary && accessSummary.rateLimitRate > 0.05) {
    tune.push(`访问 429 占比 ${(accessSummary.rateLimitRate * 100).toFixed(1)}% — 弹性限流已生效，属韧性非硬失败`)
  }
  if (!tune.length) tune.push('本档指标在声明容量内可维持；无需紧急调参')

  const warn = {
    alertsOutboxLines: alertsN,
    elasticityDecisionLines: elasticityN,
    triggeredOrExplainable:
      alertsN > 0 || elasticityN > 0 || (accessSummary?.rateLimitRate || 0) > 0.01
        ? '有告警/弹性决策或限流韧性可解释'
        : '本档未产生新告警行（若负载未越界属可解释）',
  }

  const inform = {
    notifyOutboxLines: notifyN,
    summary: `${tierId} 压测档完成：访问 n=${accessSummary?.n ?? 0} 硬错=${(
      (accessSummary?.hardErrorRate || 0) * 100
    ).toFixed(2)}% p95=${accessSummary?.p95?.toFixed(0) ?? '-'}；存储 n=${
      storageSummary?.n ?? 0
    } 硬错=${((storageSummary?.hardErrorRate || 0) * 100).toFixed(2)}% p95=${
      storageSummary?.p95?.toFixed(0) ?? '-'
    }；ready=${ready.ok ? '绿' : '红'}`,
  }

  // 告知落盘（reports + notify 旁路摘要）
  const informDir = path.join(dataDir, 'notify')
  if (!fs.existsSync(informDir)) fs.mkdirSync(informDir, { recursive: true })
  const informLine = JSON.stringify({
    at: new Date().toISOString(),
    source: 'capacity-u200-ladder',
    tier: tierId,
    message: inform.summary,
  })
  fs.appendFileSync(path.join(informDir, 'outbox.jsonl'), informLine + '\n', 'utf-8')

  const closed = {
    tier: tierId,
    at: new Date().toISOString(),
    steps: {
      detect,
      set: setStep,
      tune,
      warn,
      inform: { ...inform, notifyOutboxLinesAfter: countLines(notifyPath) },
      optimize: '指标与熔断结论写入 reports/P6；版本史/工作日志由主会话并入',
    },
  }
  console.log(`[${tierId} closed-loop]`, inform.summary)
  return closed
}

function tierPass(
  tier: (typeof TIERS)[0],
  access: Awaited<ReturnType<typeof runPhase>>,
  storage: Awaited<ReturnType<typeof runPhase>>,
  closed: Awaited<ReturnType<typeof postTierClosedLoop>>
) {
  const accessFull = access.n >= tier.access * 0.95 && !access.aborted
  const storageFull = storage.n >= tier.storage * 0.95 && !storage.aborted
  const hardOk =
    access.hardErrorRate <= 0.01 && storage.hardErrorRate <= 0.01
  const readyOk = Boolean(closed.steps.detect.readyOk)
  const loopOk = Boolean(
    closed.steps.detect && closed.steps.set && closed.steps.tune && closed.steps.warn && closed.steps.inform
  )
  return {
    accessFull,
    storageFull,
    hardOk,
    readyOk,
    loopOk,
    pass: accessFull && storageFull && hardOk && readyOk && loopOk && !access.aborted && !storage.aborted,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log(
    `CYP-memo U200×4 ladder · base=${BASE} stopAfter=${STOP_AFTER} maxWorkers=${MAX_WORKERS} cooldownMs=${COOLDOWN_MS}`
  )
  console.log('SSOT: 1.7 / R-016 / cyp-load-test · real env only · no L-tier substitute')

  const ready0 = await checkReady()
  if (!ready0.ok) throw new Error(`preflight ready not green status=${ready0.status}`)

  const { userId, token } = await resolveAuth()
  console.log('auth userId', userId, 'tokenLen', token.length)

  const memoIds = await ensureMemoPool(token, userId, 200)
  console.log('storage memo pool', memoIds.length)

  const circuit: CircuitState = { tripped: false, reason: '' }
  const tierResults: any[] = []
  let stopReason = ''

  for (const tier of TIERS) {
    if (circuit.tripped) {
      stopReason = circuit.reason
      break
    }

    console.log(`\n======== ${tier.id} users=${tier.users} access=${tier.access} storage=${tier.storage} ========`)

    const access = await runPhase({
      tierId: tier.id,
      kind: 'access',
      targetUsers: tier.users,
      total: tier.access,
      token,
      userId,
      memoIds,
      circuit,
    })

    if (circuit.tripped) {
      const closed = await postTierClosedLoop(tier.id, access, null)
      tierResults.push({
        tier: tier.id,
        access,
        storage: null,
        closedLoop: closed,
        pass: { pass: false, reason: circuit.reason },
      })
      stopReason = circuit.reason
      break
    }

    // 访问→存储之间短冷却（同档内，≥预算窗）
    console.log(`[${tier.id}] intra-tier cooldown ${COOLDOWN_MS}ms (access→storage)`)
    await sleep(COOLDOWN_MS)

    const storage = await runPhase({
      tierId: tier.id,
      kind: 'storage',
      targetUsers: tier.users,
      total: tier.storage,
      token,
      userId,
      memoIds,
      circuit,
    })

    const closed = await postTierClosedLoop(tier.id, access, storage)
    const pass = tierPass(tier, access, storage, closed)
    tierResults.push({ tier: tier.id, access, storage, closedLoop: closed, pass })
    console.log(`[${tier.id} verdict]`, JSON.stringify(pass))

    if (!pass.pass || circuit.tripped) {
      stopReason = circuit.reason || `${tier.id} did not meet pass criteria`
      break
    }

    if (tier.id === STOP_AFTER) {
      stopReason = `stopAfter=${STOP_AFTER}`
      break
    }

    const next = TIERS[TIERS.indexOf(tier) + 1]
    if (next) {
      console.log(`[cooldown] ${COOLDOWN_MS}ms before ${next.id}`)
      await sleep(COOLDOWN_MS)
      const readyMid = await checkReady()
      if (!readyMid.ok) {
        circuit.tripped = true
        circuit.reason = `post-${tier.id} ready red before ${next.id}`
        stopReason = circuit.reason
        break
      }
    }
  }

  const readyFinal = await checkReady()
  const allDeclared = TIERS.filter((t) => {
    const order = ['U0', 'U1', 'U2', 'U3']
    return order.indexOf(t.id) <= order.indexOf(STOP_AFTER as TierId)
  })
  const passedIds = tierResults.filter((t) => t.pass?.pass).map((t) => t.tier)
  const fullLadderPass =
    allDeclared.every((t) => passedIds.includes(t.id)) && readyFinal.ok && !circuit.tripped

  const report = {
    at: new Date().toISOString(),
    standard: '1.7 U200×4 / R-016 / cyp-load-test',
    base: BASE,
    stopAfter: STOP_AFTER,
    maxWorkers: MAX_WORKERS,
    cooldownMs: COOLDOWN_MS,
    circuit,
    stopReason,
    readyFinal: readyFinal.ok,
    fullLadderPass,
    passedTiers: passedIds,
    tiers: tierResults,
  }

  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const out = path.join(reportDir, `capacity-u200-ladder-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf-8')

  console.log('\n=== U200 LADDER VERDICT ===')
  console.log(
    JSON.stringify(
      {
        fullLadderPass,
        passedTiers: passedIds,
        circuit,
        stopReason,
        readyFinal: readyFinal.ok,
        report: out,
      },
      null,
      2
    )
  )
  // 熔断止损后诚实退出：未全过 = 非 0（仍写出报告）
  process.exit(fullLadderPass ? 0 : 2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
