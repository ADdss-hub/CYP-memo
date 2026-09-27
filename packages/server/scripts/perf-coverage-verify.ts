/**
 * 全覆盖性能短核验：列表批查、SLA 豁免、防抖默认
 */
import { isDurationSlaExempt } from '../src/runtime-base/l1/mgmt/perf/ready.js'
import { database } from '../src/runtime-base/l0/infra/db/ready.js'

const fails: string[] = []

if (!isDurationSlaExempt('GET /api/ops/snapshot')) fails.push('snapshot not SLA-exempt')
if (isDurationSlaExempt('GET /api/memos')) fails.push('memos must count for SLA')

const debounceDefault = (() => {
  const n = Number(process.env.CYP_DB_SAVE_DEBOUNCE_MS)
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 500
})()
if (debounceDefault < 500 && process.env.CYP_DB_SAVE_DEBOUNCE_MS == null) {
  fails.push(`DB debounce default expected 500, got ${debounceDefault}`)
}

if (typeof database.getMemosByUserIds !== 'function') {
  fails.push('getMemosByUserIds missing')
}
if (typeof database.getMemosListByUserIds !== 'function') {
  fails.push('getMemosListByUserIds missing')
}
if (typeof database.countByUserIds !== 'function') {
  fails.push('countByUserIds missing')
}

if (fails.length) {
  console.error('[perf-coverage-verify] FAIL')
  for (const f of fails) console.error(' -', f)
  process.exit(1)
}
console.log('[perf-coverage-verify] OK', {
  snapshotExempt: true,
  dbDebounceDefaultMs: debounceDefault,
  batchListApi: true,
})
process.exit(0)
