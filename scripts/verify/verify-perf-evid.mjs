/**
 * PERF-EVID 核心字段核验（对齐军械库 CYP-output-perf-evid.schema.json）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const evidPath = path.join(root, 'docs/perf/perf-evid.json')
const fails = []

if (!fs.existsSync(evidPath)) {
  console.error('FAIL missing docs/perf/perf-evid.json')
  process.exit(1)
}

const evid = JSON.parse(fs.readFileSync(evidPath, 'utf8'))
const required = [
  'product_version',
  'env_id',
  'collected_at',
  'CAP-PERF-DIM',
  'quality_ref',
  'stack_profile',
  'ext_set',
  'baseline',
  'hw_profile',
  'hw_virt',
]

for (const k of required) {
  if (evid[k] === undefined || evid[k] === null || evid[k] === '') {
    fails.push(`missing required ${k}`)
  }
}

if (typeof evid.quality_ref === 'string' && !/1\.6\.3|抄/.test(evid.quality_ref)) {
  fails.push('quality_ref must declare 抄 1.6.3')
}

if (typeof evid['CAP-PERF-DIM'] === 'string' && !/^A\d\+S\d\+V\d/.test(evid['CAP-PERF-DIM'])) {
  fails.push('CAP-PERF-DIM must look like A?+S?+V?')
}

if (!evid.hw_profile || typeof evid.hw_profile !== 'object') fails.push('hw_profile object required')
if (!evid.hw_virt || typeof evid.hw_virt !== 'object') fails.push('hw_virt object required')
if (!evid.baseline || typeof evid.baseline !== 'object') fails.push('baseline object required')

if (evid.na && typeof evid.na === 'object') {
  for (const [id, row] of Object.entries(evid.na)) {
    if (!row?.reason || !row?.reviewer || !row?.date) fails.push(`na.${id} needs reason/reviewer/date`)
  }
}

if (evid.gap && typeof evid.gap === 'object') {
  for (const [id, row] of Object.entries(evid.gap)) {
    if (!row?.due_version || !row?.reason) fails.push(`gap.${id} needs due_version/reason`)
  }
}

const dimDoc = path.join(root, 'docs/perf/CAP-PERF-DIM.md')
if (!fs.existsSync(dimDoc)) fails.push('missing docs/perf/CAP-PERF-DIM.md')

if (fails.length) {
  console.error('FAIL_PERF_EVID')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}

console.log('PASS_PERF_EVID', {
  dim: evid['CAP-PERF-DIM'],
  gaps: evid.gap ? Object.keys(evid.gap).length : 0,
  na: evid.na ? Object.keys(evid.na).length : 0,
})
process.exit(0)
