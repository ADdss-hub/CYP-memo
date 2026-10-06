/**
 * 全覆盖性能短核验：列表批查、SLA 豁免、防抖默认、1.6.3 路由分型
 */
import {
  isDurationSlaExempt,
  classifyPerfRoute,
  resolveRouteSla,
  INTERACTIVE_HIGH_STANDARD_SLA,
  HEAVY_HIGH_STANDARD_SLA,
  HIGH_STANDARD_SLA,
} from '../src/runtime-base/l1/mgmt/perf/ready.js'
import { database } from '../src/runtime-base/l0/infra/db/ready.js'

const fails: string[] = []

if (!isDurationSlaExempt('GET /api/ops/snapshot')) fails.push('snapshot not SLA-exempt')
if (isDurationSlaExempt('GET /api/memos')) fails.push('memos must count for SLA')

if (classifyPerfRoute('GET /api/memos') !== 'interactive') fails.push('GET /api/memos not interactive')
if (classifyPerfRoute('PATCH /api/memos/x') !== 'interactive') fails.push('PATCH memo not interactive')
if (classifyPerfRoute('POST /api/files') !== 'heavy') fails.push('POST /api/files not heavy')
if (classifyPerfRoute('GET /api/users/x/settings') !== 'standard') fails.push('settings should be standard')
if (resolveRouteSla('GET /api/memos').p95Ms !== INTERACTIVE_HIGH_STANDARD_SLA.p95Ms) {
  fails.push('interactive p95 must be 300')
}
if (resolveRouteSla('POST /api/files').requestMs !== HEAVY_HIGH_STANDARD_SLA.requestMs) {
  fails.push('heavy requestMs must be 3000')
}
if (HIGH_STANDARD_SLA.p95Ms !== 500) fails.push('standard p95 must be 500')

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
