/**
 * 契约治理 · 消费者驱动契约（CDC）实机核验
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  initApiContract,
  resetApiContract,
  registerConsumerExpectation,
  verifyConsumerDrivenContracts,
  runCdcProbe,
} from '../src/runtime-base/l1/col/ctr/ready.js'

const dir = path.join(os.tmpdir(), `cyp-cdc-${Date.now()}`)
fs.mkdirSync(dir, { recursive: true })
resetApiContract()
initApiContract({ dataDir: dir })

const probe = runCdcProbe()
if (!probe.consumerSatisfied || !probe.consumerRejectedOnMissing) {
  console.error('CDC_PROBE_FAIL', probe)
  process.exit(1)
}

registerConsumerExpectation({
  consumerId: 'cdc-script-web',
  expectedPaths: ['GET /api/health', 'POST /api/auth/login'],
})
const ok = verifyConsumerDrivenContracts()
if (!ok.ok) {
  console.error('CDC_CORE_FAIL', ok.failures)
  process.exit(1)
}

registerConsumerExpectation({
  consumerId: 'cdc-script-break',
  expectedPaths: ['GET /api/not-registered-by-provider'],
})
const bad = verifyConsumerDrivenContracts()
if (bad.ok || !bad.failures.some((f) => f.consumerId === 'cdc-script-break')) {
  console.error('CDC_MISSING_MUST_FAIL', bad)
  process.exit(1)
}

console.log('PASS_CDC_CONTRACTS', { probe, failuresWhenMissing: bad.failures.length })
process.exit(0)
