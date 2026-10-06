#!/usr/bin/env node
/**
 * 为制品写旁路 .sha256（GNU 风格：hex 两空格 文件名）。
 * 用法: node scripts/_internal/write-sha256.mjs <file>...
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node scripts/_internal/write-sha256.mjs <file>...')
  process.exit(1)
}

for (const f of files) {
  const buf = readFileSync(f)
  const sha = createHash('sha256').update(buf).digest('hex')
  const out = `${f}.sha256`
  writeFileSync(out, `${sha}  ${basename(f)}\n`, 'utf8')
  console.log(out)
}
