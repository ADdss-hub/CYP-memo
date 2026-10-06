#!/usr/bin/env node
/**
 * 比对 file 与 file.sha256。无 sidecar 则失败。
 * 用法: node scripts/verify/verify-artifact-sha256.mjs <file>
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'

const f = process.argv[2]
if (!f) {
  console.error('usage: node scripts/verify/verify-artifact-sha256.mjs <file>')
  process.exit(1)
}
const side = `${f}.sha256`
if (!existsSync(side)) {
  console.error(`missing ${side}`)
  process.exit(1)
}
const buf = readFileSync(f)
const got = createHash('sha256').update(buf).digest('hex')
const line = readFileSync(side, 'utf8').trim()
const want = line.split(/\s+/)[0]
const name = line.split(/\s+/).slice(1).join(' ')
if (want !== got) {
  console.error(`sha256 mismatch want=${want} got=${got}`)
  process.exit(1)
}
if (name && name !== basename(f)) {
  console.error(`name mismatch sidecar=${name} file=${basename(f)}`)
  process.exit(1)
}
console.log(`OK ${basename(f)} sha256=${got}`)
