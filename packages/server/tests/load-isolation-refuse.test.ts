/**
 * B8：无隔离 / 缺 CYP_API_BASE 时 REFUSE。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertLoadIsolation } from '../scripts/load-isolation-gate.ts'

const expectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data-loadtest')

async function expectRefuse(envPatch: Record<string, string>, re: RegExp) {
  const prev: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(envPatch)) {
    prev[k] = process.env[k]
    if (v === '') delete process.env[k]
    else process.env[k] = v
  }
  try {
    await assertLoadIsolation({ scriptName: 'gate-test' })
    assert.fail('expected REFUSE')
  } catch (e) {
    assert.match(String(e instanceof Error ? e.message : e), re)
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

await expectRefuse({ CYP_LOAD_ISOLATED: '', CYP_LOAD_EXPECT_DATA_DIR: '', CYP_API_BASE: '' }, /REFUSE/)
await expectRefuse(
  {
    CYP_LOAD_ISOLATED: '1',
    CYP_LOAD_EXPECT_DATA_DIR: expectDir,
    CYP_API_BASE: '',
  },
  /CYP_API_BASE|REFUSE/
)
console.log('LOAD_ISOLATION_REFUSE_PASS')
