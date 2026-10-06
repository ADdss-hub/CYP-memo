/**
 * B1 XSS 净化夹具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../src/security/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out).toContain('ok')
  })

  it('strips javascript href', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out.toLowerCase()).not.toMatch(/javascript:/)
  })

  it('strips onerror handlers', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">')
    expect(out.toLowerCase()).not.toContain('onerror')
  })

  it('strips iframe', () => {
    const out = sanitizeHtml('<iframe src="https://evil.example"></iframe><p>n</p>')
    expect(out.toLowerCase()).not.toContain('<iframe')
  })
})
