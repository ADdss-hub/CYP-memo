/**
 * CYP-memo 工具函数测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  generateToken,
  validateToken
} from '../src/utils/crypto'
import {
  validatePasswordStrength,
  validateTagName,
  validateFileSize,
  getMaxFileSize
} from '../src/utils/validation'
import {
  formatDateTime,
  formatRelativeTime,
  formatFileSize
} from '../src/utils/format'
import {
  debounce,
  throttle,
  calculateVirtualScroll,
  getVisibleItems
} from '../src/utils/performance'

describe('加密工具', () => {
  describe('密码哈希', () => {
    it('应该正确哈希密码', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)

      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(0)
    })

    it('应该验证正确的密码', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword(password, hash)

      expect(isValid).toBe(true)
    })

    it('应该拒绝错误的密码', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('WrongPassword', hash)

      expect(isValid).toBe(false)
    })
  })

  describe('令牌生成', () => {
    it('应该生成有效的令牌', () => {
      const token = generateToken()

      expect(token).toBeDefined()
      expect(token.length).toBe(64) // 32 bytes = 64 hex chars
      expect(validateToken(token)).toBe(true)
    })

    it('应该生成唯一的令牌', () => {
      const token1 = generateToken()
      const token2 = generateToken()

      expect(token1).not.toBe(token2)
    })

    it('应该验证有效的令牌格式', () => {
      const validToken = 'a'.repeat(64)
      expect(validateToken(validToken)).toBe(true)
    })

    it('应该拒绝无效的令牌格式', () => {
      expect(validateToken('short')).toBe(false)
      expect(validateToken('x'.repeat(63))).toBe(false)
      expect(validateToken('x'.repeat(65))).toBe(false)
      expect(validateToken('invalid-chars-!@#$')).toBe(false)
    })
  })
})

describe('验证工具', () => {
  describe('密码强度验证', () => {
    it('应该接受有效的密码', () => {
      const result = validatePasswordStrength('Password123')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('应该拒绝过短的密码', () => {
      const result = validatePasswordStrength('Pass1')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('密码长度至少为 8 位')
    })

    it('应该拒绝没有字母的密码', () => {
      const result = validatePasswordStrength('12345678')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('密码必须包含字母')
    })

    it('应该拒绝没有数字的密码', () => {
      const result = validatePasswordStrength('Password')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('密码必须包含数字')
    })
  })

  describe('标签名称验证', () => {
    it('应该接受有效的标签名称', () => {
      expect(validateTagName('工作')).toBe(true)
      expect(validateTagName('个人项目')).toBe(true)
      expect(validateTagName('a'.repeat(20))).toBe(true)
    })

    it('应该拒绝空标签', () => {
      expect(validateTagName('')).toBe(false)
      expect(validateTagName('   ')).toBe(false)
    })

    it('应该拒绝过长的标签', () => {
      expect(validateTagName('a'.repeat(21))).toBe(false)
    })
  })

  describe('文件大小验证', () => {
    it('应该接受有效的文件大小', () => {
      expect(validateFileSize(1024)).toBe(true)
      expect(validateFileSize(1024 * 1024)).toBe(true)
      expect(validateFileSize(getMaxFileSize())).toBe(true)
    })

    it('应该拒绝超过限制的文件', () => {
      expect(validateFileSize(getMaxFileSize() + 1)).toBe(false)
    })

    it('应该拒绝零或负数大小', () => {
      expect(validateFileSize(0)).toBe(false)
      expect(validateFileSize(-1)).toBe(false)
    })
  })
})

describe('格式化工具', () => {
  describe('日期时间格式化', () => {
    it('应该格式化完整的日期时间', () => {
      const date = new Date('2025-01-05T14:30:45')
      const formatted = formatDateTime(date)

      expect(formatted).toContain('2025年')
      expect(formatted).toContain('1月')
      expect(formatted).toContain('5日')
      expect(formatted).toContain('14:30:45')
    })

    it('应该格式化仅日期', () => {
      const date = new Date('2025-01-05T14:30:45')
      const formatted = formatDateTime(date, false)

      expect(formatted).toContain('2025年')
      expect(formatted).toContain('1月')
      expect(formatted).toContain('5日')
      expect(formatted).not.toContain(':')
    })
  })

  describe('相对时间格式化', () => {
    it('应该格式化秒前', () => {
      const date = Date.now() - 30 * 1000
      const formatted = formatRelativeTime(date)
      expect(formatted).toContain('秒前')
    })

    it('应该格式化分钟前', () => {
      const date = Date.now() - 5 * 60 * 1000
      const formatted = formatRelativeTime(date)
      expect(formatted).toContain('分钟前')
    })

    it('应该格式化小时前', () => {
      const date = Date.now() - 3 * 60 * 60 * 1000
      const formatted = formatRelativeTime(date)
      expect(formatted).toContain('小时前')
    })
  })

  describe('文件大小格式化', () => {
    it('应该格式化字节', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
      expect(formatFileSize(500)).toBe('500 Bytes')
    })

    it('应该格式化 KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(2048)).toBe('2 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    it('应该格式化 MB', () => {
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(1572864)).toBe('1.5 MB')
    })

    it('应该格式化 GB', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB')
      expect(formatFileSize(1610612736)).toBe('1.5 GB')
    })
  })
})

describe('性能优化工具', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('防抖函数', () => {
    it('应该延迟执行函数', () => {
      const func = vi.fn()
      const debounced = debounce(func, 100)

      debounced()
      expect(func).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('应该在多次调用时重置计时器', () => {
      const func = vi.fn()
      const debounced = debounce(func, 100)

      debounced()
      vi.advanceTimersByTime(50)
      debounced()
      vi.advanceTimersByTime(50)

      expect(func).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(func).toHaveBeenCalledTimes(1)
    })
  })

  describe('节流函数', () => {
    it('应该限制函数执行频率', () => {
      const func = vi.fn()
      const throttled = throttle(func, 100)

      throttled()
      throttled()
      throttled()

      expect(func).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      throttled()

      expect(func).toHaveBeenCalledTimes(2)
    })
  })

  describe('虚拟滚动计算', () => {
    it('应该正确计算虚拟滚动参数', () => {
      const result = calculateVirtualScroll(0, {
        totalItems: 1000,
        itemHeight: 50,
        containerHeight: 500,
        bufferSize: 3
      })

      expect(result.startIndex).toBe(0)
      expect(result.visibleCount).toBe(10)
      expect(result.totalHeight).toBe(50000)
    })

    it('应该在滚动时更新索引', () => {
      const result = calculateVirtualScroll(500, {
        totalItems: 1000,
        itemHeight: 50,
        containerHeight: 500,
        bufferSize: 3
      })

      expect(result.startIndex).toBeGreaterThan(0)
      expect(result.offsetY).toBeGreaterThan(0)
    })

    it('应该获取可见项目', () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      const result = calculateVirtualScroll(0, {
        totalItems: 100,
        itemHeight: 50,
        containerHeight: 500,
        bufferSize: 3
      })

      const visible = getVisibleItems(items, result)
      expect(visible.length).toBeGreaterThan(0)
      expect(visible.length).toBeLessThanOrEqual(items.length)
    })
  })
})
