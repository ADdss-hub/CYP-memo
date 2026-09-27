/**
 * CYP-memo 统一产品壳应用测试环境设置
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import 'fake-indexeddb/auto'
import { beforeAll, beforeEach } from 'vitest'
import { storageManager, getStorage } from '@shared/storage'

async function ensureLocalStorage(): Promise<void> {
  if (!storageManager.isInitialized()) {
    await storageManager.initialize({ mode: 'local' })
  }
  try {
    await getStorage().clearAllData()
  } catch {
    await storageManager.initialize({ mode: 'local' })
    try {
      await getStorage().clearAllData()
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
}

beforeAll(async () => {
  await storageManager.initialize({ mode: 'local' })
})

beforeEach(async () => {
  await ensureLocalStorage()
})
