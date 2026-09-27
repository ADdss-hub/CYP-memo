/**
 * 三道边界拒绝用例复现（RJ-01 / RJ-02 / RJ-03）
 * 用法：pnpm exec tsx scripts/verify-rejection-cases.ts [RJ-01|RJ-02|RJ-03]
 */
import os from 'os'
import path from 'path'
import { initAudit, listRecentAudits } from '../src/runtime-base/l1/host/audit/ready.ts'
import { initFullChainLog, listRecentChainMarks } from '../src/runtime-base/l1/mgmt/trace/ready.ts'
import { runPublicAccessProbe } from '../src/runtime-base/l1/pub/acc/ready.ts'
import { probeMissingPermissionRow } from '../src/runtime-base/l1/mgmt/rbac/ready.ts'
import {
  listWiringRejections,
  probeTrustAnchorRotation,
  probeUnregisteredDbBypass,
} from '../src/runtime-base/l0/coord/plt/ready.ts'
import { effectiveProbeParams, PROBE_DEFAULTS } from '../src/runtime-base/l0/coord/cmp/ready.ts'

const which = (process.argv[2] || 'ALL').trim()
const fails: string[] = []

initFullChainLog()
initAudit({ dataDir: path.join(os.tmpdir(), 'cyp-memo-rj') })

function runRj01(): void {
  const probe = runPublicAccessProbe()
  const mark = listRecentChainMarks(20).some(
    (m) => m.kind === 'public_deny' && String(m.detail || '').includes('allowlist')
  )
  if (!probe.allowlistDeny || !probe.denyLogged || !mark) {
    fails.push(`RJ-01 deny=${probe.allowlistDeny} logged=${probe.denyLogged} mark=${mark}`)
  }
}

function runRj02(): void {
  const before = listRecentAudits(20, { applyRetention: false }).length
  const probe = probeMissingPermissionRow()
  const audits = listRecentAudits(20, { applyRetention: false })
  const audited = audits.slice(before).some((a) => a.action === 'permission_denied')
    || audits.some((a) => a.action === 'permission_denied' && String(a.resource).includes('rj02'))
  const mark = listRecentChainMarks(20).some((m) => m.kind === 'permission_deny' && m.traceId === 'rj02-permission')
  if (!probe.denied || probe.proceeded || !audited || !mark) {
    fails.push(`RJ-02 denied=${probe.denied} proceeded=${probe.proceeded} audited=${audited} mark=${mark}`)
  }
}

function runRj03(): void {
  const probe = probeUnregisteredDbBypass()
  const rec = listWiringRejections().some(
    (r) => r.caller === 'RB-L1-PUB-OPEN-01' && r.callee === 'RB-L0-INFRA-DB-01'
  )
  const mark = listRecentChainMarks(20).some((m) => m.kind === 'wiring_deny')
  if (!probe.refused || probe.rowsRead !== 0 || !rec || !mark) {
    fails.push(`RJ-03 refused=${probe.refused} rows=${probe.rowsRead} rec=${rec} mark=${mark}`)
  }
}

if (which === 'ALL' || which === 'RJ-01') runRj01()
if (which === 'ALL' || which === 'RJ-02') runRj02()
if (which === 'ALL' || which === 'RJ-03') runRj03()
if (which === 'ALL' || which === 'MTLS') {
  const rot = probeTrustAnchorRotation()
  const live = effectiveProbeParams('Liveness')
  const def = PROBE_DEFAULTS.Liveness
  const probeOk =
    live.failureThreshold === def.failureThreshold &&
    live.periodSeconds === def.periodSeconds &&
    live.initialDelaySeconds === def.initialDelaySeconds &&
    live.timeoutSeconds === def.timeoutSeconds
  if (!rot.ok || !probeOk) fails.push(`MTLS rot=${rot.detail} probeOk=${probeOk}`)
}
if (!['ALL', 'RJ-01', 'RJ-02', 'RJ-03', 'MTLS'].includes(which)) {
  fails.push(`unknown case ${which}`)
}

if (fails.length) {
  console.error('FAIL_REJECTION_CASES')
  for (const f of fails) console.error(f)
  process.exit(1)
}
console.log(`PASS_REJECTION_CASES ${which}`)
