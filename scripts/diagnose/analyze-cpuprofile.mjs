// Aggregate self-time per function from a Node CPU profile (.cpuprofile JSON).
// Self samples = node.hitCount - sum(children hitCount). The blocking function dominates.
import fs from 'fs'
import process from 'process'

const path = process.argv[2]
if (!path) { console.error('usage: node analyze-cpuprofile.mjs <file.cpuprofile>'); process.exit(1) }
const prof = JSON.parse(fs.readFileSync(path, 'utf-8'))
const intervalUs = prof?.metadata?.samplingIntervalMicros ?? 500
const nodes = prof.nodes
const byId = new Map(nodes.map((n) => [n.id, n]))
// child hit counts
const childSum = new Map()
for (const n of nodes) {
  let s = 0
  for (const c of n.children || []) {
    const cn = byId.get(c)
    if (cn) s += cn.hitCount || 0
  }
  childSum.set(n.id, s)
}
const rows = nodes.map((n) => {
  const self = (n.hitCount || 0) - (childSum.get(n.id) || 0)
  const cf = n.callFrame || {}
  return {
    self,
    func: cf.functionName || '(anonymous)',
    url: cf.url || '',
    line: cf.line || 0,
    total: n.hitCount || 0,
  }
}).filter((r) => r.self > 0).sort((a, b) => b.self - a.self)

const totalSamples = rows.reduce((s, r) => s + r.total, 0)
console.log(`file=${path}`)
console.log(`samplingIntervalMicros=${intervalUs}  totalSamples≈${(totalSamples * intervalUs / 1000).toFixed(0)}ms`)
console.log('TOP 25 by self-time (ms = selfSamples * interval):')
console.log('selfMs\tselfSamp\ttotSamp\tfunction\tlocation')
for (const r of rows.slice(0, 25)) {
  const ms = (r.self * intervalUs / 1000).toFixed(1)
  const loc = r.url.replace(/.*\/packages\/server\//, '').replace(/.*\/node_modules\//, 'nm:') + (r.line ? `:${r.line}` : '')
  console.log(`${ms}\t${r.self}\t${r.total}\t${r.func}\t${loc}`)
}
