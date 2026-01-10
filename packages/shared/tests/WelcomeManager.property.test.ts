/**
 * CYP-memo 欢迎引导管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { welcomeManager } from '../src/managers/WelcomeManager'
import { db } from '../src/database/db'

describe('欢迎引导管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空设置表
    await db.settings.clear()
  })

  afterEach(async () => {
    // 清空设置表
    await db.settings.clear()
  })

  describe('首次使用检测属性', () => {
    // Feature: cyp-memo, Property 32: 首次使用检测
    it('属性 32: 对于任何首次访问应用的用户，系统应该正确识别并显示欢迎界面', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的（没有设置记录）
            await db.settings.clear()
            
            // 第一次检查应该返回 true（首次使用）
            const isFirstTime1 = await welcomeManager.isFirstTime()
            expect(isFirstTime1).toBe(true)
            
            // 再次检查应该仍然返回 true（因为还没有标记完成）
            const isFirstTime2 = await welcomeManager.isFirstTime()
            expect(isFirstTime2).toBe(true)
            
            // 验证设置已经被创建
            const setting = await db.settings.get('isFirstTime')
            expect(setting).toBeDefined()
            expect(setting?.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)

    // 扩展测试：验证标记完成后不再是首次使用
    it('属性 32 (扩展): 标记欢迎流程完成后，系统应该识别为非首次使用', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 第一次检查应该是首次使用
            const isFirstTime1 = await welcomeManager.isFirstTime()
            expect(isFirstTime1).toBe(true)
            
            // 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 再次检查应该不是首次使用
            const isFirstTime2 = await welcomeManager.isFirstTime()
            expect(isFirstTime2).toBe(false)
            
            // 验证设置已经被更新
            const setting = await db.settings.get('isFirstTime')
            expect(setting).toBeDefined()
            expect(setting?.value).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)

    // 扩展测试：验证重置后恢复首次使用状态
    it('属性 32 (扩展): 重置引导状态后，系统应该恢复为首次使用状态', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 验证不是首次使用
            const isFirstTime1 = await welcomeManager.isFirstTime()
            expect(isFirstTime1).toBe(false)
            
            // 重置引导状态
            await welcomeManager.resetGuide()
            
            // 验证恢复为首次使用
            const isFirstTime2 = await welcomeManager.isFirstTime()
            expect(isFirstTime2).toBe(true)
            
            // 验证设置已经被重置
            const setting = await db.settings.get('isFirstTime')
            expect(setting).toBeDefined()
            expect(setting?.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)
  })

  describe('欢迎流程完成标记属性', () => {
    // Feature: cyp-memo, Property 33: 欢迎流程完成标记
    it('属性 33: 对于任何完成欢迎引导的用户，系统应该记录完成状态，后续访问不再显示', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 初始状态：欢迎流程未完成
            const isCompleted1 = await welcomeManager.isWelcomeCompleted()
            expect(isCompleted1).toBe(false)
            
            // 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 验证欢迎流程已完成
            const isCompleted2 = await welcomeManager.isWelcomeCompleted()
            expect(isCompleted2).toBe(true)
            
            // 验证设置已经被创建
            const setting = await db.settings.get('welcomeCompleted')
            expect(setting).toBeDefined()
            expect(setting?.value).toBe(true)
            
            // 验证首次使用标记也被更新
            const firstTimeSetting = await db.settings.get('isFirstTime')
            expect(firstTimeSetting).toBeDefined()
            expect(firstTimeSetting?.value).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)

    // 扩展测试：验证完成状态持久化
    it('属性 33 (扩展): 欢迎流程完成状态应该持久化，多次查询结果一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 多次查询应该得到一致的结果
            const isCompleted1 = await welcomeManager.isWelcomeCompleted()
            const isCompleted2 = await welcomeManager.isWelcomeCompleted()
            const isCompleted3 = await welcomeManager.isWelcomeCompleted()
            
            expect(isCompleted1).toBe(true)
            expect(isCompleted2).toBe(true)
            expect(isCompleted3).toBe(true)
            
            // 验证数据库中的值没有改变
            const setting = await db.settings.get('welcomeCompleted')
            expect(setting?.value).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)

    // 扩展测试：验证重置后欢迎流程状态被清除
    it('属性 33 (扩展): 重置引导状态后，欢迎流程完成标记应该被清除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 验证欢迎流程已完成
            const isCompleted1 = await welcomeManager.isWelcomeCompleted()
            expect(isCompleted1).toBe(true)
            
            // 重置引导状态
            await welcomeManager.resetGuide()
            
            // 验证欢迎流程完成标记被清除
            const isCompleted2 = await welcomeManager.isWelcomeCompleted()
            expect(isCompleted2).toBe(false)
            
            // 验证设置已经被重置
            const setting = await db.settings.get('welcomeCompleted')
            expect(setting).toBeDefined()
            expect(setting?.value).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)
  })

  describe('引导状态综合属性', () => {
    // 综合测试：验证完整的引导流程
    it('综合属性: 完整的引导流程应该正确更新所有状态', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 确保数据库是干净的
            await db.settings.clear()
            
            // 1. 初始状态：首次使用，欢迎流程未完成
            const status1 = await welcomeManager.getGuideStatus()
            expect(status1.isFirstTime).toBe(true)
            expect(status1.welcomeCompleted).toBe(false)
            
            // 2. 标记欢迎流程完成
            await welcomeManager.markWelcomeCompleted()
            
            // 3. 完成后状态：非首次使用，欢迎流程已完成
            const status2 = await welcomeManager.getGuideStatus()
            expect(status2.isFirstTime).toBe(false)
            expect(status2.welcomeCompleted).toBe(true)
            
            // 4. 重置引导状态
            await welcomeManager.resetGuide()
            
            // 5. 重置后状态：恢复为首次使用，欢迎流程未完成
            const status3 = await welcomeManager.getGuideStatus()
            expect(status3.isFirstTime).toBe(true)
            expect(status3.welcomeCompleted).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)

    // 综合测试：验证引导步骤的一致性
    it('综合属性: 引导步骤应该始终返回一致的内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 多次获取引导步骤
            const steps1 = welcomeManager.getGuideSteps()
            const steps2 = welcomeManager.getGuideSteps()
            const steps3 = welcomeManager.getGuideSteps()
            
            // 验证步骤数量一致
            expect(steps1.length).toBe(steps2.length)
            expect(steps2.length).toBe(steps3.length)
            expect(steps1.length).toBeGreaterThan(0)
            
            // 验证每个步骤的内容一致
            for (let i = 0; i < steps1.length; i++) {
              expect(steps1[i].id).toBe(steps2[i].id)
              expect(steps1[i].id).toBe(steps3[i].id)
              expect(steps1[i].title).toBe(steps2[i].title)
              expect(steps1[i].description).toBe(steps2[i].description)
            }
          }
        ),
        { numRuns: 100 }
      )
    }, 30000)
  })
})
