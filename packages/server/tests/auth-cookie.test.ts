/**
 * B2 auth-cookie
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import {
  ACCESS_COOKIE,
  parseCookieHeader,
  readAccessCookie,
  setAccessCookie,
  clearAccessCookie,
} from '../src/auth-cookie.ts'
import type { Request, Response } from 'express'

const parsed = parseCookieHeader(`${ACCESS_COOKIE}=abc%201; other=1`)
assert.equal(parsed[ACCESS_COOKIE], 'abc 1')

const req = { headers: { cookie: `${ACCESS_COOKIE}=sess-token` } } as Request
assert.equal(readAccessCookie(req), 'sess-token')

const cookies: string[] = []
const res = {
  append(_name: string, value: string) {
    cookies.push(value)
  },
} as unknown as Response

setAccessCookie(res, 'tok')
assert.ok(cookies[0].includes('HttpOnly'))
assert.ok(cookies[0].includes('SameSite=Strict'))
assert.ok(cookies[0].includes('Secure'))
assert.ok(!cookies[0].toLowerCase().includes('httponly=false'))

clearAccessCookie(res)
assert.ok(cookies[1].includes('Max-Age=0'))
console.log('server smoke: auth-cookie ok')
