/**
 * half-open 短冷却核验（CYP_EGRESS_COOLDOWN_MS + CYP_EGRESS_HALF_SUCCESS）
 * 与 gateway-center-chaos-verify 互补：等待真实冷却窗口后探测恢复。
 */
import http from 'http'
import {
  egressFetch,
  getCircuitState,
  resetAllCircuits,
  EGRESS_COOLDOWN_MS,
  EGRESS_HALF_SUCCESS_NEEDED,
} from '../src/runtime-base/l1/host/resil/egress.js'

const cool = Number(process.env.CYP_EGRESS_COOLDOWN_MS || EGRESS_COOLDOWN_MS)
const need = EGRESS_HALF_SUCCESS_NEEDED
let mode: 'ok' | 'fail' = 'fail'
const server = http.createServer((_req, res) => {
  if (mode === 'ok') {
    res.writeHead(200)
    res.end('ok')
  } else {
    res.writeHead(503)
    res.end('no')
  }
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const addr = server.address()
if (!addr || typeof addr === 'string') throw new Error('no port')
const url = `http://127.0.0.1:${addr.port}/`
const dep = 'half-open-probe'

resetAllCircuits()
mode = 'fail'
await egressFetch({ dependency: dep, url, timeoutMs: 800, retries: 0 })
if (getCircuitState(dep) !== 'open') {
  console.error('FAIL not open')
  process.exit(1)
}

console.log(`waiting cooldown ${cool}ms for half-open… needSuccess=${need}`)
await new Promise((r) => setTimeout(r, cool + 80))
mode = 'ok'
const st = getCircuitState(dep)
if (st !== 'half' && st !== 'closed') {
  console.error('FAIL expected half after cooldown, got', st)
  process.exit(1)
}
for (let i = 0; i < need; i++) {
  const probe = await egressFetch({ dependency: dep, url, timeoutMs: 800, retries: 0 })
  if (!probe.ok) {
    console.error('FAIL half probe', i + 1, probe, getCircuitState(dep))
    process.exit(1)
  }
}
if (getCircuitState(dep) !== 'closed') {
  console.error('FAIL expected closed after', need, 'successes, got', getCircuitState(dep))
  process.exit(1)
}
server.close()
console.log('[gateway-center-halfopen-verify] OK')
process.exit(0)
