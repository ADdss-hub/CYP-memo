/**
 * Minimal server test anchor (DEBT-T05 / P7 REG-P6).
 * Imports Err SSOT without booting HTTP.
 */
import assert from 'node:assert/strict'
import { Err } from '../src/runtime-base/l1/mgmt/code/ready.ts'

assert.equal(Err.GONE, 'E410')
assert.equal(Err.LOGIN_FAIL, 'E022')
assert.equal(Err.UNAUTH, 'E020')
console.log('server smoke: Err SSOT ok')
