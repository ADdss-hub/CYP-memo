/**
 * CYP-memo 验证工具属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validatePasswordStrength,
  validateTagName,
  validateFileSize,
  getMaxFileSize
} from '../src/utils/validation'

describe('验证工具属性测试', () => {
  describe('密码强度验证属性', () => {
    // Feature: cyp-memo, Property 1: 密码强度验证
    it('属性 1: 对于任何密码字符串，密码验证函数应该正确识别是否满足强度要求（至少 8 位，包含字母和数字）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (password) => {
            const result = validatePasswordStrength(password)
            
            // 检查长度要求
            const hasMinLength = password.length >= 8
            // 检查字母要求
            const hasLetter = /[a-zA-Z]/.test(password)
            // 检查数字要求
            const hasDigit = /[0-9]/.test(password)
            
            // 密码应该在满足所有条件时才有效
            const shouldBeValid = hasMinLength && hasLetter && hasDigit
            
            expect(result.valid).toBe(shouldBeValid)
            
            // 验证错误消息的正确性
            if (!hasMinLength) {
              expect(result.errors).toContain('密码长度至少为 8 位')
            }
            if (!hasLetter) {
              expect(result.errors).toContain('密码必须包含字母')
            }
            if (!hasDigit) {
              expect(result.errors).toContain('密码必须包含数字')
            }
            
            // 如果密码有效，错误数组应该为空
            if (shouldBeValid) {
              expect(result.errors).toHaveLength(0)
            } else {
              expect(result.errors.length).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外测试：验证有效密码的属性
    it('属性 1 (扩展): 所有满足要求的密码都应该被接受', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成满足要求的密码：至少 8 位，包含字母和数字
          fc.tuple(
            fc.stringOf(fc.char(), { minLength: 0, maxLength: 10 }), // 前缀
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'), { minLength: 1, maxLength: 5 }), // 字母
            fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 5 }), // 数字
            fc.stringOf(fc.char(), { minLength: 0, maxLength: 10 }) // 后缀
          ).map(([prefix, letters, digits, suffix]) => {
            // 组合成至少 8 位的密码
            let password = prefix + letters + digits + suffix
            // 如果长度不足 8 位，补充字符
            while (password.length < 8) {
              password += 'a1'
            }
            return password
          }),
          async (password) => {
            const result = validatePasswordStrength(password)
            
            // 验证密码确实满足所有要求
            expect(password.length).toBeGreaterThanOrEqual(8)
            expect(/[a-zA-Z]/.test(password)).toBe(true)
            expect(/[0-9]/.test(password)).toBe(true)
            
            // 应该被验证为有效
            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('文件大小验证属性', () => {
    // Feature: cyp-memo, Property 17: 文件大小限制
    it('属性 17: 对于任何文件，如果大小超过 10GB 应该被拒绝，否则应该被接受', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 11 * 1024 * 1024 * 1024 }), // 生成从负数到超过 10GB 的文件大小
          async (fileSize) => {
            const result = validateFileSize(fileSize)
            const maxSize = getMaxFileSize()
            
            // 文件大小应该在 (0, 10GB] 范围内才有效
            const shouldBeValid = fileSize > 0 && fileSize <= maxSize
            
            expect(result).toBe(shouldBeValid)
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外测试：边界值测试
    it('属性 17 (扩展): 边界值应该被正确处理', async () => {
      const maxSize = getMaxFileSize()
      
      // 测试边界值
      expect(validateFileSize(0)).toBe(false) // 零字节无效
      expect(validateFileSize(1)).toBe(true) // 1 字节有效
      expect(validateFileSize(maxSize)).toBe(true) // 正好 10GB 有效
      expect(validateFileSize(maxSize + 1)).toBe(false) // 超过 10GB 无效
      expect(validateFileSize(-1)).toBe(false) // 负数无效
    })

    // 额外测试：常见文件大小范围
    it('属性 17 (扩展): 常见文件大小应该被正确验证', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            1024, // 1 KB
            1024 * 1024, // 1 MB
            10 * 1024 * 1024, // 10 MB
            100 * 1024 * 1024, // 100 MB
            1024 * 1024 * 1024, // 1 GB
            5 * 1024 * 1024 * 1024 // 5 GB
          ),
          async (fileSize) => {
            const result = validateFileSize(fileSize)
            
            // 所有这些常见大小都应该有效
            expect(result).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('标签名称验证属性', () => {
    // Feature: cyp-memo, Property 21: 标签名称验证
    it('属性 21: 对于任何标签名称，如果为空或超过 20 个字符应该被拒绝，否则应该被接受', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (tagName) => {
            const result = validateTagName(tagName)
            
            // 去除首尾空格后检查
            const trimmed = tagName.trim()
            const shouldBeValid = trimmed.length > 0 && trimmed.length <= 20
            
            expect(result).toBe(shouldBeValid)
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外测试：边界值测试
    it('属性 21 (扩展): 边界值应该被正确处理', async () => {
      // 空字符串
      expect(validateTagName('')).toBe(false)
      
      // 只有空格
      expect(validateTagName('   ')).toBe(false)
      expect(validateTagName('\t\n')).toBe(false)
      
      // 1 个字符（有效）
      expect(validateTagName('a')).toBe(true)
      
      // 20 个字符（有效）
      expect(validateTagName('a'.repeat(20))).toBe(true)
      
      // 21 个字符（无效）
      expect(validateTagName('a'.repeat(21))).toBe(false)
      
      // 带空格的边界情况
      expect(validateTagName('  a  ')).toBe(true) // 去除空格后为 1 个字符
      expect(validateTagName('  ' + 'a'.repeat(20) + '  ')).toBe(true) // 去除空格后为 20 个字符
      expect(validateTagName('  ' + 'a'.repeat(21) + '  ')).toBe(false) // 去除空格后为 21 个字符
    })

    // 额外测试：有效标签名称
    it('属性 21 (扩展): 所有有效长度的标签都应该被接受', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          async (tagName) => {
            const result = validateTagName(tagName)
            
            // 验证标签确实在有效范围内
            const trimmed = tagName.trim()
            expect(trimmed.length).toBeGreaterThan(0)
            expect(trimmed.length).toBeLessThanOrEqual(20)
            
            // 应该被验证为有效
            expect(result).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外测试：中文字符支持
    it('属性 21 (扩展): 中文字符应该被正确计数', async () => {
      // 中文字符
      expect(validateTagName('工作')).toBe(true)
      expect(validateTagName('个人项目')).toBe(true)
      
      // 正好 20 个中文字符
      const tag20 = '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾'
      expect(tag20.length).toBe(20)
      expect(validateTagName(tag20)).toBe(true)
      
      // 21 个中文字符（超过限制）
      const tag21 = '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾壹'
      expect(tag21.length).toBe(21)
      expect(validateTagName(tag21)).toBe(false)
      
      // 混合字符
      expect(validateTagName('工作Project123')).toBe(true)
    })
  })
})
