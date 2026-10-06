/**
 * B6：运行时源码不得设置 NODE_TLS_REJECT_UNAUTHORIZED=0。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.name.endsWith('.ts')) out.push(p)
  }
  return out
}

for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, 'utf8')
  assert.equal(
    /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/.test(text),
    false,
    `${path.relative(srcRoot, file)} sets NODE_TLS_REJECT_UNAUTHORIZED=0`
  )
}
assert.ok(fs.existsSync(path.join(srcRoot, 'tls', 'fetch-lan.ts')), 'fetch-lan.ts missing')
console.log('MCP_TLS_NO_GLOBAL_INSECURE_PASS')
