/**
 * 测试环境设置
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { beforeAll, afterAll, afterEach } from 'vitest'
import { config } from '@vue/test-utils'
import 'fake-indexeddb/auto'

// 配置 Vue Test Utils
config.global.stubs = {
  teleport: true,
  transition: false
}

// 模拟 window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
})

// 清理
afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
