/**
 * B2：存储配置禁止持久化 apiKey
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { storageManager } from '../src/storage/StorageManager'

describe('storage config persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('strips apiKey when loading stored config', async () => {
    localStorage.setItem(
      'cyp-memo-storage-config',
      JSON.stringify({ mode: 'local', apiKey: 'stolen-bearer' })
    )
    await storageManager.initialize({ mode: 'local' })
    await storageManager.switchMode({ mode: 'local', apiKey: 'stolen-bearer' })
    const raw = localStorage.getItem('cyp-memo-storage-config') || ''
    expect(raw).not.toContain('stolen-bearer')
    expect(JSON.parse(raw).apiKey).toBeUndefined()
  })
})
