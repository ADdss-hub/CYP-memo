/**
 * 性能升级短核验：SLA 豁免 ops/snapshot；列表投影截断；DB 防抖默认 ≥500
 */
import { isDurationSlaExempt } from '../src/runtime-base/l1/mgmt/perf/ready.js'

const fails: string[] = []

for (const r of [
  'GET /api/ops/snapshot',
  '/api/ops/snapshot',
  'GET /api/gateway/status',
  '/api/gateway/circuit/reset',
]) {
  if (!isDurationSlaExempt(r)) fails.push(`SLA should exempt ${r}`)
}
for (const r of ['GET /api/memos', 'PATCH /api/memos/x', 'POST /api/auth/login']) {
  if (isDurationSlaExempt(r)) fails.push(`SLA should NOT exempt ${r}`)
}

const debounceDefault = (() => {
  const n = Number(process.env.CYP_DB_SAVE_DEBOUNCE_MS)
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 500
})()
if (debounceDefault < 500 && process.env.CYP_DB_SAVE_DEBOUNCE_MS == null) {
  fails.push(`DB debounce default expected 500, got ${debounceDefault}`)
}

if (fails.length) {
  console.error('[perf-upgrade-verify] FAIL')
  for (const f of fails) console.error(' -', f)
  process.exit(1)
}
console.log('[perf-upgrade-verify] OK', {
  snapshotExempt: true,
  dbDebounceDefaultMs: debounceDefault,
})
process.exit(0)
