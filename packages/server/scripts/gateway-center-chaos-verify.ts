/**
 * W4 混沌核验：出站 half-open 自动恢复 + ops 可观测地板（真实本机，非沙箱）
 * 用法：CYP_EGRESS_COOLDOWN_MS=400 CYP_EGRESS_HALF_SUCCESS=1 pnpm --filter @cyp-memo/server exec tsx scripts/gateway-center-chaos-verify.ts
 */
import http from 'http'
import {
  egressFetch,
  forceOpen,
  forceClose,
  getCircuitState,
  getCircuitDetail,
  resetAllCircuits,
  EGRESS_COOLDOWN_MS,
  EGRESS_HALF_SUCCESS_NEEDED,
} from '../src/runtime-base/l1/host/resil/egress.js'
import { consumeApiBudget } from '../src/runtime-base/l1/mgmt/iam/ready.js'
import {
  initElasticity,
  decideElasticity,
  resetElasticity,
  tryAcquireIngressSlot,
  releaseIngressSlot,
  MIN_OPS_CONCURRENCY,
} from '../src/runtime-base/l1/host/resil/ready.js'
import { getMachineCapacity } from '../src/runtime-base/l0/infra/cfg/ready.js'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmp = path.join(os.tmpdir(), `cyp-gw-chaos-${Date.now()}`)
fs.mkdirSync(tmp, { recursive: true })

let mode: 'ok' | 'fail' = 'fail'
const server = http.createServer((_req, res) => {
  if (mode === 'ok') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } else {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false }))
  }
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
const addr = server.address()
if (!addr || typeof addr === 'string') throw new Error('no port')
const port = addr.port
const url = `http://127.0.0.1:${port}/probe`
const dep = 'chaos-local-probe'

const failures: string[] = []
const cool = Number(process.env.CYP_EGRESS_COOLDOWN_MS || EGRESS_COOLDOWN_MS)
const need = EGRESS_HALF_SUCCESS_NEEDED

resetAllCircuits()
mode = 'fail'
const r1 = await egressFetch({ dependency: dep, url, timeoutMs: 1000, retries: 0 })
if (r1.ok || getCircuitState(dep) !== 'open') {
  failures.push(`expected open after fail, got ${JSON.stringify(r1)} state=${getCircuitState(dep)}`)
}

// 冷却前应仍拒绝
const r2 = await egressFetch({ dependency: dep, url, timeoutMs: 1000, retries: 0 })
if (r2.ok || r2.circuit !== 'open') {
  failures.push(`cooldown reject expected open, got ${JSON.stringify(r2)}`)
}

// 真实 half-open：等冷却后探测成功关闭（禁止 forceClose 冒充自动恢复）
console.log(`chaos waiting cooldown ${cool}ms… halfSuccess=${need}`)
await new Promise((r) => setTimeout(r, cool + 80))
if (getCircuitState(dep) !== 'half') {
  failures.push(`expected half after cooldown, got ${getCircuitState(dep)} detail=${JSON.stringify(getCircuitDetail(dep))}`)
}
mode = 'ok'
for (let i = 0; i < need; i++) {
  const probe = await egressFetch({ dependency: dep, url, timeoutMs: 1000, retries: 0 })
  if (!probe.ok) failures.push(`half probe ${i + 1} failed ${JSON.stringify(probe)}`)
}
if (getCircuitState(dep) !== 'closed') {
  failures.push(`auto recover closed expected, got ${getCircuitState(dep)}`)
}

// 运维接口仍可用
forceOpen(dep)
if (getCircuitState(dep) !== 'open') failures.push('forceOpen failed')
forceClose(dep)
if (getCircuitState(dep) !== 'closed') failures.push('forceClose failed')

// 可观测地板：弹性压到 0.35 后 ops RPM 仍 ≥ floor；危机并发 ≥ MIN_OPS_CONCURRENCY
initElasticity({ dataDir: tmp })
try {
  decideElasticity({ event: 'PerfPressureCritical', p95Ms: 9999 })
} catch {
  /* MQ 未起时忽略事件发布；applied 已写入 */
}
const cap = getMachineCapacity()
const floor = Math.max(cap.clientErrorRpm || 10, Math.floor(cap.apiRpm * 0.05))
const budget = consumeApiBudget(`chaos-floor:GET:ops`, undefined, { protectUser: false })
if (budget.limit < floor) failures.push(`ops floor broken limit=${budget.limit} floor=${floor}`)

const crisisSlot = tryAcquireIngressSlot({ control: 'crisis', lane: 'ops' })
if (!crisisSlot.ok || crisisSlot.limit < MIN_OPS_CONCURRENCY) {
  failures.push(`minOpsConcurrency broken limit=${crisisSlot.limit} min=${MIN_OPS_CONCURRENCY}`)
}
if (crisisSlot.ok) releaseIngressSlot('ops')

resetElasticity()
resetAllCircuits()

server.close()
try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (failures.length) {
  console.error('[gateway-center-chaos-verify] FAIL')
  for (const f of failures) console.error(' -', f)
  process.exit(1)
}
console.log('[gateway-center-chaos-verify] OK', {
  cooldownMs: EGRESS_COOLDOWN_MS,
  halfSuccess: need,
  opsFloor: floor,
  minOpsConcurrency: MIN_OPS_CONCURRENCY,
  apiRpm: cap.apiRpm,
})
process.exit(0)
