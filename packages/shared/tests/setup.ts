/**
 * CYP-memo 测试环境设置
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, afterEach } from 'vitest'
import { storageManager, getStorage } from '../src/storage'
import { cleanupManager } from '../src/managers/CleanupManager'
import { logManager } from '../src/managers/LogManager'

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
  try {
    // 防止上一用例留下的 fake timers 卡住 IndexedDB clear
    const { vi } = await import('vitest')
    vi.useRealTimers()
  } catch {
    /* ignore */
  }
  await ensureLocalStorage()
})

afterEach(() => {
  try {
    cleanupManager.stopAutoCleanup()
  } catch {
    /* ignore */
  }
  try {
    logManager.stopAutoCleanTask()
  } catch {
    /* ignore */
  }
})
