/**
 * CYP-memo 闭集 35 自动化矩阵机检
 * SSOT: docs/runtime-base/automation-matrix.json + AUTOMATION_INTELLIGENCE.md
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))

const fails = []

if (!exists('docs/runtime-base/AUTOMATION_INTELLIGENCE.md')) {
  fails.push('missing AUTOMATION_INTELLIGENCE.md')
}
if (!exists('docs/runtime-base/automation-matrix.json')) {
  fails.push('missing automation-matrix.json')
  console.error(fails.join('\n'))
  process.exit(1)
}

const matrix = JSON.parse(read('docs/runtime-base/automation-matrix.json'))
const items = matrix.items || []
if (items.length !== 35) fails.push(`matrix items=${items.length} want 35`)
if (matrix.closedSet !== 35) fails.push('closedSet field must be 35')

const ids = new Set()
for (const it of items) {
  if (!it.id || !/^RB-L[01]-/.test(it.id)) fails.push(`bad id: ${it.id}`)
  if (ids.has(it.id)) fails.push(`dup id: ${it.id}`)
  ids.add(it.id)
  if (!['A0', 'A1', 'A2', 'A3'].includes(it.acl)) fails.push(`${it.id} bad acl`)
  if (!Array.isArray(it.capIds) || !it.capIds.length) fails.push(`${it.id} missing capIds`)
  if (!['observe', 'set_target'].includes(it.ops)) fails.push(`${it.id} bad ops`)
  if (!Array.isArray(it.symbols) || !it.symbols.length) fails.push(`${it.id} missing symbols`)

  const cardRel = `docs/runtime-base/component-cards/${it.id}.md`
  if (!exists(cardRel)) {
    fails.push(`missing card ${it.id}`)
    continue
  }
  const card = read(cardRel)
  if (!card.includes('自动化 ACL')) fails.push(`${it.id} card missing 自动化 ACL`)
  if (!card.includes(it.acl)) fails.push(`${it.id} card missing acl ${it.acl}`)
}

const a3 = items.filter((x) => x.acl === 'A3')
const needA3 = ['RB-L1-MGMT-PERF-01', 'RB-L1-HOST-RESIL-01', 'RB-L1-HOST-ALERT-01']
for (const id of needA3) {
  const row = items.find((x) => x.id === id)
  if (!row || row.acl !== 'A3') fails.push(`${id} must be A3`)
}
if (a3.length < 3) fails.push(`A3 count=${a3.length} want >=3`)

const anchorOf = {
  'RB-L1-MGMT-PERF-01': 'packages/server/src/runtime-base/l1/mgmt/perf/ready.ts',
  'RB-L1-HOST-RESIL-01': 'packages/server/src/runtime-base/l1/host/resil/ready.ts',
  'RB-L1-HOST-ALERT-01': 'packages/server/src/runtime-base/l1/host/alert/ready.ts',
  'RB-L1-MGMT-CONF-01': 'packages/server/src/runtime-base/l1/mgmt/conf/ready.ts',
  'RB-L1-HOST-SCHED-01': 'packages/server/src/runtime-base/l1/host/sched/ready.ts',
}

for (const it of items) {
  const anchor = anchorOf[it.id]
  if (!anchor) continue
  const src = read(anchor)
  for (const sym of it.symbols) {
    if (!src.includes(sym)) fails.push(`${it.id} anchor missing symbol ${sym}`)
  }
}

const index = read('packages/server/src/index.ts')
if (index.includes('/api/alerts/:id/assign') || index.includes('/api/alerts/:id/close')) {
  fails.push('manual alert assign/close must stay removed')
}

const std = read('docs/runtime-base/AUTOMATION_INTELLIGENCE.md')
for (const need of ['IA13-X', 'opsObservesOnly', 'A3', 'automation-matrix.json', 'verify:automation-matrix']) {
  if (!std.includes(need.replace('opsObservesOnly', '运维观测优先')) && need === 'opsObservesOnly') {
    if (!std.includes('运维观测优先')) fails.push('standard missing 运维观测优先')
  } else if (need !== 'opsObservesOnly' && !std.includes(need)) {
    fails.push(`standard missing ${need}`)
  }
}

if (fails.length) {
  console.error('FAIL_AUTOMATION_MATRIX')
  for (const f of fails) console.error(`- ${f}`)
  process.exit(1)
}
console.log('PASS_AUTOMATION_MATRIX')
console.log(`items=35 a3=${a3.length}`)
