/**
 * B4：CSP 无裸 https:；HTTPS 响应带 HSTS / XFO。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import assert from 'node:assert/strict'
import type { Request, Response, NextFunction } from 'express'
import { buildAppCsp } from '@cyp-memo/shared'
import { contentSecurityPolicy } from '../src/runtime-base/l1/mgmt/fesec/ready.ts'

const csp = buildAppCsp(false)
const connect = (csp.split(';').find((d) => d.trim().startsWith('connect-src')) || '').trim()
const sources = connect.split(/\s+/).slice(1)
assert.equal(sources.includes('https:'), false, 'connect-src must not include bare https:')
assert.ok(sources.includes("'self'"), 'connect-src must include self')

function runMiddleware(secure: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  const req = {
    secure,
    protocol: secure ? 'https' : 'http',
    headers: {},
  } as unknown as Request
  const res = {
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v
    },
  } as unknown as Response
  let nextCalled = false
  const next: NextFunction = () => {
    nextCalled = true
  }
  contentSecurityPolicy(req, res, next)
  assert.equal(nextCalled, true)
  return headers
}

const httpsHeaders = runMiddleware(true)
assert.equal(httpsHeaders['x-frame-options'], 'DENY')
assert.equal(httpsHeaders['strict-transport-security'], 'max-age=31536000; includeSubDomains')
assert.ok(httpsHeaders['content-security-policy']?.includes("default-src 'self'"))

const httpHeaders = runMiddleware(false)
assert.equal(httpHeaders['x-frame-options'], 'DENY')
assert.equal(httpHeaders['strict-transport-security'], undefined)

console.log('SECURITY_HEADERS_PASS')
