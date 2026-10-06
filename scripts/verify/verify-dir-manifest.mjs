#!/usr/bin/env node
/**
 * 校验目录 MANIFEST.sha256。缺清单或哈希不一致则退出 1。
 * 用法: node scripts/verify/verify-dir-manifest.mjs <dir>
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/verify/verify-dir-manifest.mjs <dir>')
  process.exit(1)
}
const man = join(dir, 'MANIFEST.sha256')
if (!existsSync(man)) {
  console.error(`missing ${man}`)
  process.exit(1)
}
const lines = readFileSync(man, 'utf8').split(/\r?\n/)
let n = 0
for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const sp = t.search(/\s+/)
  if (sp < 0) {
    console.error(`bad line: ${t}`)
    process.exit(1)
  }
  const want = t.slice(0, sp)
  const rel = t.slice(sp).trim()
  const p = join(dir, rel)
  if (!existsSync(p)) {
    console.error(`missing file ${rel}`)
    process.exit(1)
  }
  const got = createHash('sha256').update(readFileSync(p)).digest('hex')
  if (got !== want) {
    console.error(`sha256 mismatch ${rel}`)
    process.exit(1)
  }
  n += 1
}
if (n < 1) {
  console.error('empty MANIFEST.sha256')
  process.exit(1)
}
console.log(`OK MANIFEST ${n} files`)
