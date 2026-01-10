/**
 * CYP-memo 用户端应用测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { VERSION } from '@shared/config/version'

describe('App Configuration', () => {
  it('should have correct version', () => {
    expect(VERSION.full).toBe('1.0.0')
  })
})
