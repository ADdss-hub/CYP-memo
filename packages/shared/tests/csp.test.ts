/**
 * B4 CSP：禁止 connect-src 裸 https:
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { buildAppCsp } from '../src/security/csp'

describe('buildAppCsp', () => {
  it('production policy has no wildcard https: source', () => {
    const csp = buildAppCsp(false)
    expect(csp).toContain("default-src 'self'")
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src')) || ''
    const sources = connect.trim().split(/\s+/).slice(1)
    expect(sources.includes('https:')).toBe(false)
    expect(sources).toContain("'self'")
  })

  it('allows explicit remote API origin', () => {
    const csp = buildAppCsp(false, 'https://192.168.1.8:5170')
    expect(csp).toContain('https://192.168.1.8:5170')
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src')) || ''
    expect(connect.trim().split(/\s+/).includes('https:')).toBe(false)
  })
})
