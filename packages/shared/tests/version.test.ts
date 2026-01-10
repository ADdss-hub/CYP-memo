/**
 * CYP-memo 版本信息测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { VERSION } from '../src/config/version'

describe('VERSION', () => {
  it('should have correct version format', () => {
    expect(VERSION.major).toBe(1)
    expect(VERSION.minor).toBe(0)
    expect(VERSION.patch).toBe(0)
    expect(VERSION.full).toBe('1.0.0')
  })

  it('should have author information', () => {
    expect(VERSION.author).toBe('CYP')
    expect(VERSION.email).toBe('nasDSSCYP@outlook.com')
  })

  it('should have copyright information', () => {
    expect(VERSION.copyright).toContain('Copyright')
    expect(VERSION.copyright).toContain('CYP')
  })
})
