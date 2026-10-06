#!/usr/bin/env node
/**
 * 为目录写 MANIFEST.sha256（每行: hex 两空格 相对路径，正斜杠）。
 * 用法: node scripts/_internal/write-dir-manifest.mjs <dir>
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/_internal/write-dir-manifest.mjs <dir>')
  process.exit(1)
}

const files = []
const walk = (d) => {
  for (const name of readdirSync(d, { withFileTypes: true })) {
    if (name.name === 'MANIFEST.sha256') continue
    const p = join(d, name.name)
    if (name.isDirectory()) walk(p)
    else if (name.isFile()) files.push(p)
  }
}
walk(dir)
files.sort((a, b) => relative(dir, a).localeCompare(relative(dir, b)))

const lines = files.map((p) => {
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex')
  const rel = relative(dir, p).split('\\').join('/')
  return `${sha}  ${rel}`
})
writeFileSync(join(dir, 'MANIFEST.sha256'), lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
console.log(join(dir, 'MANIFEST.sha256'))
