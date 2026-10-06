/**
 * 嵌入式 5.7 等价落点实机核验（NR-12）。通过 ≠ NR-05 完善。
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  initSchedule,
  resetSchedule,
  runScheduleTicketProbe,
} from '../src/runtime-base/l1/host/sched/ready.js'
import {
  init as initPipeline,
  reset as resetPipeline,
  runAcctReplayProbe,
} from '../src/runtime-base/l1/host/acct/ready.js'
import {
  initRegistry,
  resetRegistry,
  registerSelfAfterInit,
  bindEmbeddedServiceCollab,
  runMeshDiscoverProbe,
} from '../src/runtime-base/l1/col/svc/ready.js'
import { initKms } from '../src/runtime-base/l1/mgmt/kms/ready.js'

const dir = path.join(os.tmpdir(), `cyp-eq-${Date.now()}`)
fs.mkdirSync(dir, { recursive: true })

resetSchedule()
initSchedule({ dataDir: dir, tickIntervalMs: 60_000 })
const tickets = await runScheduleTicketProbe()
if (!tickets.triggered || !tickets.hasRunning || !tickets.hasTerminal) {
  console.error('TICKET_AUDIT_FAIL', tickets)
  process.exit(1)
}
resetSchedule()

resetPipeline()
initPipeline({ dataDir: dir })
const replay = runAcctReplayProbe()
if (replay.flushed < 1 || replay.replayed < 1 || replay.aggregated < 1 || !replay.limitFromConfig) {
  console.error('ACCT_REPLAY_FAIL', replay)
  process.exit(1)
}
resetPipeline()

initKms({ dataDir: dir })
resetRegistry()
initRegistry({ dataDir: dir })
registerSelfAfterInit({
  serviceName: 'cyp-memo-server',
  instanceId: 'self-eq',
  host: '127.0.0.1',
  port: 9,
})
bindEmbeddedServiceCollab({ host: '127.0.0.1', port: 9 })
const mesh = runMeshDiscoverProbe()
if (
  !mesh.formEmbedded ||
  !mesh.noIndependentMesh ||
  !mesh.gatewayFound ||
  !mesh.serverFound ||
  !mesh.routeGranted ||
  !mesh.routeDenied
) {
  console.error('MESH_DISCOVER_FAIL', mesh)
  process.exit(1)
}
resetRegistry()

console.log('PASS_EMBEDDED_EQUIVALENTS', { tickets, replay, mesh })
process.exit(0)
