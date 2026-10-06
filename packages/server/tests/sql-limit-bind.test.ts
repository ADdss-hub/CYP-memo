/**
 * B7：sql.js LIMIT 须绑定参数，禁止字符串插值。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assertNoLimitInterp(rel: string): void {
  const abs = path.join(root, rel)
  const src = fs.readFileSync(abs, 'utf8')
  assert.equal(
    /LIMIT\s+\$\{/.test(src),
    false,
    `${rel} still interpolates LIMIT`
  )
  assert.equal(
    /LIMIT\s+\?/.test(src),
    true,
    `${rel} should bind LIMIT with ?`
  )
}

assertNoLimitInterp('src/runtime-base/l0/infra/log/obs-store.ts')
assertNoLimitInterp('src/runtime-base/l0/infra/db/ready.ts')
console.log('SQL_LIMIT_BIND_PASS')
