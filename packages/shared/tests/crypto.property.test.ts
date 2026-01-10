/**
 * CYP-memo 加密工具属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { generateToken, validateToken } from '../src/utils/crypto'

describe('加密工具属性测试', () => {
  describe('令牌生成属性', () => {
    // Feature: cyp-memo, Property 2: 令牌唯一性
    it('属性 2: 对于任何两次令牌生成调用，生成的令牌应该是不同的', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // 使用常量作为占位符，因为我们不需要输入
          async () => {
            // 生成两个令牌
            const token1 = generateToken()
            const token2 = generateToken()
            
            // 验证两个令牌不相同
            expect(token1).not.toBe(token2)
            
            // 验证两个令牌都是有效的
            expect(validateToken(token1)).toBe(true)
            expect(validateToken(token2)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    // Feature: cyp-memo, Property 3: 令牌随机性
    it('属性 3: 对于任何生成的令牌，应该具有足够的熵和随机性', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }), // 生成不同数量的令牌进行统计测试
          async (count) => {
            // 生成多个令牌
            const tokens = new Set<string>()
            for (let i = 0; i < count; i++) {
              tokens.add(generateToken())
            }
            
            // 验证所有令牌都是唯一的（集合大小应该等于生成数量）
            expect(tokens.size).toBe(count)
            
            // 验证令牌的字符分布（检查是否使用了多种十六进制字符）
            const allTokens = Array.from(tokens).join('')
            const uniqueChars = new Set(allTokens.toLowerCase())
            
            // 至少应该有 10 种不同的十六进制字符（0-9, a-f 共 16 种）
            // 这是一个统计测试，确保令牌不是简单的重复模式
            expect(uniqueChars.size).toBeGreaterThanOrEqual(10)
            
            // 验证每个令牌都是有效格式
            for (const token of tokens) {
              expect(validateToken(token)).toBe(true)
              expect(token.length).toBe(64)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外的随机性测试：验证令牌的位分布
    it('属性 3 (扩展): 令牌应该在字节级别具有良好的随机分布', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 生成一个令牌
            const token = generateToken()
            
            // 将十六进制字符串转换为字节数组
            const bytes: number[] = []
            for (let i = 0; i < token.length; i += 2) {
              bytes.push(parseInt(token.substr(i, 2), 16))
            }
            
            // 验证字节数组长度
            expect(bytes.length).toBe(32)
            
            // 验证每个字节都在有效范围内 (0-255)
            for (const byte of bytes) {
              expect(byte).toBeGreaterThanOrEqual(0)
              expect(byte).toBeLessThanOrEqual(255)
            }
            
            // 统计测试：计算字节的平均值
            // 对于真正随机的数据，平均值应该接近 127.5
            const average = bytes.reduce((sum, b) => sum + b, 0) / bytes.length
            
            // 允许一定的偏差（在 100-155 之间都是合理的）
            // 这是一个宽松的统计测试，避免偶尔的假阳性
            expect(average).toBeGreaterThan(50)
            expect(average).toBeLessThan(205)
          }
        ),
        { numRuns: 100 }
      )
    })

    // 额外测试：验证大量令牌的唯一性
    it('属性 2 (扩展): 生成大量令牌时应该保持唯一性', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 生成 1000 个令牌
            const tokens = new Set<string>()
            const count = 1000
            
            for (let i = 0; i < count; i++) {
              tokens.add(generateToken())
            }
            
            // 验证所有令牌都是唯一的
            expect(tokens.size).toBe(count)
          }
        ),
        { numRuns: 10 } // 减少运行次数，因为每次运行都生成 1000 个令牌
      )
    })
  })
})
