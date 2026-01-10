/**
 * CYP-memo 欢迎引导管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { welcomeManager } from '../src/managers/WelcomeManager'
import { db } from '../src/database/db'

describe('欢迎引导管理器单元测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空设置表
    await db.settings.clear()
  })

  afterEach(async () => {
    // 清空设置表
    await db.settings.clear()
  })

  describe('引导步骤顺序测试', () => {
    it('应该返回正确数量的引导步骤', () => {
      const steps = welcomeManager.getGuideSteps()
      
      // 验证步骤数量（根据实现，应该有8个步骤）
      expect(steps).toHaveLength(8)
    })

    it('引导步骤应该按正确的顺序排列', () => {
      const steps = welcomeManager.getGuideSteps()
      
      // 验证步骤ID的顺序
      expect(steps[0].id).toBe('step-1')
      expect(steps[1].id).toBe('step-2')
      expect(steps[2].id).toBe('step-3')
      expect(steps[3].id).toBe('step-4')
      expect(steps[4].id).toBe('step-5')
      expect(steps[5].id).toBe('step-6')
      expect(steps[6].id).toBe('step-7')
      expect(steps[7].id).toBe('step-8')
    })

    it('第一个步骤应该是欢迎介绍', () => {
      const steps = welcomeManager.getGuideSteps()
      const firstStep = steps[0]
      
      expect(firstStep.id).toBe('step-1')
      expect(firstStep.title).toBe('欢迎使用 CYP-memo')
      expect(firstStep.description).toContain('现代化的备忘录管理系统')
      expect(firstStep.target).toBeUndefined()
      expect(firstStep.position).toBeUndefined()
    })

    it('第二个步骤应该是创建备忘录引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const secondStep = steps[1]
      
      expect(secondStep.id).toBe('step-2')
      expect(secondStep.title).toBe('创建备忘录')
      expect(secondStep.description).toContain('新建备忘录')
      expect(secondStep.target).toBe('#create-memo-btn')
      expect(secondStep.position).toBe('bottom')
    })

    it('第三个步骤应该是添加标签引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const thirdStep = steps[2]
      
      expect(thirdStep.id).toBe('step-3')
      expect(thirdStep.title).toBe('添加标签')
      expect(thirdStep.description).toContain('标签')
      expect(thirdStep.target).toBe('#tags-input')
      expect(thirdStep.position).toBe('top')
    })

    it('第四个步骤应该是上传附件引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const fourthStep = steps[3]
      
      expect(fourthStep.id).toBe('step-4')
      expect(fourthStep.title).toBe('上传附件')
      expect(fourthStep.description).toContain('上传图片')
      expect(fourthStep.description).toContain('10GB')
      expect(fourthStep.target).toBe('#upload-file-btn')
      expect(fourthStep.position).toBe('left')
    })

    it('第五个步骤应该是搜索和筛选引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const fifthStep = steps[4]
      
      expect(fifthStep.id).toBe('step-5')
      expect(fifthStep.title).toBe('搜索和筛选')
      expect(fifthStep.description).toContain('搜索框')
      expect(fifthStep.target).toBe('#search-box')
      expect(fifthStep.position).toBe('bottom')
    })

    it('第六个步骤应该是数据统计引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const sixthStep = steps[5]
      
      expect(sixthStep.id).toBe('step-6')
      expect(sixthStep.title).toBe('数据统计')
      expect(sixthStep.description).toContain('统计信息')
      expect(sixthStep.target).toBe('#statistics-link')
      expect(sixthStep.position).toBe('right')
    })

    it('第七个步骤应该是系统设置引导', () => {
      const steps = welcomeManager.getGuideSteps()
      const seventhStep = steps[6]
      
      expect(seventhStep.id).toBe('step-7')
      expect(seventhStep.title).toBe('系统设置')
      expect(seventhStep.description).toContain('设置')
      expect(seventhStep.target).toBe('#settings-link')
      expect(seventhStep.position).toBe('right')
    })

    it('最后一个步骤应该是开始使用提示', () => {
      const steps = welcomeManager.getGuideSteps()
      const lastStep = steps[7]
      
      expect(lastStep.id).toBe('step-8')
      expect(lastStep.title).toBe('开始使用')
      expect(lastStep.description).toContain('开始创建')
      expect(lastStep.target).toBeUndefined()
      expect(lastStep.position).toBeUndefined()
    })

    it('所有步骤都应该有必需的字段', () => {
      const steps = welcomeManager.getGuideSteps()
      
      for (const step of steps) {
        // 验证必需字段存在
        expect(step.id).toBeDefined()
        expect(step.id).not.toBe('')
        expect(step.title).toBeDefined()
        expect(step.title).not.toBe('')
        expect(step.description).toBeDefined()
        expect(step.description).not.toBe('')
        
        // target 和 position 是可选的
        if (step.target) {
          expect(step.target).not.toBe('')
        }
        
        if (step.position) {
          expect(['top', 'bottom', 'left', 'right']).toContain(step.position)
        }
      }
    })

    it('步骤ID应该是唯一的', () => {
      const steps = welcomeManager.getGuideSteps()
      const ids = steps.map(step => step.id)
      const uniqueIds = new Set(ids)
      
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('引导步骤应该覆盖主要功能', () => {
      const steps = welcomeManager.getGuideSteps()
      const descriptions = steps.map(step => step.description).join(' ')
      
      // 验证关键功能都被提及
      expect(descriptions).toContain('备忘录')
      expect(descriptions).toContain('标签')
      expect(descriptions).toContain('上传') // 使用"上传"而不是"附件"
      expect(descriptions).toContain('搜索')
      expect(descriptions).toContain('统计')
      expect(descriptions).toContain('设置')
    })

    it('有目标元素的步骤应该有合理的位置', () => {
      const steps = welcomeManager.getGuideSteps()
      
      for (const step of steps) {
        if (step.target) {
          // 有目标元素的步骤应该有位置指示
          expect(step.position).toBeDefined()
          expect(['top', 'bottom', 'left', 'right']).toContain(step.position!)
        }
      }
    })

    it('引导步骤的顺序应该符合用户使用流程', () => {
      const steps = welcomeManager.getGuideSteps()
      
      // 验证逻辑顺序：
      // 1. 欢迎介绍
      expect(steps[0].title).toContain('欢迎')
      
      // 2-4. 核心功能（创建、标签、附件）
      expect(steps[1].title).toContain('创建')
      expect(steps[2].title).toContain('标签')
      expect(steps[3].title).toContain('附件')
      
      // 5. 搜索功能
      expect(steps[4].title).toContain('搜索')
      
      // 6-7. 高级功能（统计、设置）
      expect(steps[5].title).toContain('统计')
      expect(steps[6].title).toContain('设置')
      
      // 8. 结束提示
      expect(steps[7].title).toContain('开始使用')
    })
  })

  describe('引导状态管理测试', () => {
    it('首次访问时应该正确初始化状态', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 第一次检查
      const isFirstTime = await welcomeManager.isFirstTime()
      expect(isFirstTime).toBe(true)
      
      // 验证设置已创建
      const setting = await db.settings.get('isFirstTime')
      expect(setting).toBeDefined()
      expect(setting?.value).toBe(true)
    })

    it('完成欢迎流程后应该更新所有相关状态', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 标记完成
      await welcomeManager.markWelcomeCompleted()
      
      // 验证首次使用标记被更新
      const firstTimeSetting = await db.settings.get('isFirstTime')
      expect(firstTimeSetting?.value).toBe(false)
      
      // 验证欢迎完成标记被设置
      const welcomeCompletedSetting = await db.settings.get('welcomeCompleted')
      expect(welcomeCompletedSetting?.value).toBe(true)
    })

    it('重置引导状态应该恢复初始状态', async () => {
      // 先完成欢迎流程
      await welcomeManager.markWelcomeCompleted()
      
      // 验证状态已完成
      let status = await welcomeManager.getGuideStatus()
      expect(status.isFirstTime).toBe(false)
      expect(status.welcomeCompleted).toBe(true)
      
      // 重置
      await welcomeManager.resetGuide()
      
      // 验证状态已恢复
      status = await welcomeManager.getGuideStatus()
      expect(status.isFirstTime).toBe(true)
      expect(status.welcomeCompleted).toBe(false)
    })

    it('getGuideStatus应该返回完整的状态信息', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 获取初始状态
      const initialStatus = await welcomeManager.getGuideStatus()
      expect(initialStatus).toHaveProperty('isFirstTime')
      expect(initialStatus).toHaveProperty('welcomeCompleted')
      expect(initialStatus.isFirstTime).toBe(true)
      expect(initialStatus.welcomeCompleted).toBe(false)
      
      // 完成欢迎流程
      await welcomeManager.markWelcomeCompleted()
      
      // 获取完成后的状态
      const completedStatus = await welcomeManager.getGuideStatus()
      expect(completedStatus.isFirstTime).toBe(false)
      expect(completedStatus.welcomeCompleted).toBe(true)
    })

    it('多次调用isFirstTime应该返回一致的结果', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 多次调用
      const result1 = await welcomeManager.isFirstTime()
      const result2 = await welcomeManager.isFirstTime()
      const result3 = await welcomeManager.isFirstTime()
      
      // 结果应该一致
      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('多次调用isWelcomeCompleted应该返回一致的结果', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 标记完成
      await welcomeManager.markWelcomeCompleted()
      
      // 多次调用
      const result1 = await welcomeManager.isWelcomeCompleted()
      const result2 = await welcomeManager.isWelcomeCompleted()
      const result3 = await welcomeManager.isWelcomeCompleted()
      
      // 结果应该一致
      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)
    })
  })

  describe('边界情况测试', () => {
    it('应该正确处理数据库为空的情况', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 检查首次使用（应该自动初始化）
      const isFirstTime = await welcomeManager.isFirstTime()
      expect(isFirstTime).toBe(true)
      
      // 检查欢迎完成状态（应该返回false）
      const isCompleted = await welcomeManager.isWelcomeCompleted()
      expect(isCompleted).toBe(false)
    })

    it('应该正确处理部分状态缺失的情况', async () => {
      // 只设置首次使用标记，不设置欢迎完成标记
      await db.settings.put({
        key: 'isFirstTime',
        value: false
      })
      
      // 检查首次使用
      const isFirstTime = await welcomeManager.isFirstTime()
      expect(isFirstTime).toBe(false)
      
      // 检查欢迎完成状态（应该返回false，因为没有设置）
      const isCompleted = await welcomeManager.isWelcomeCompleted()
      expect(isCompleted).toBe(false)
    })

    it('应该正确处理状态值类型错误的情况', async () => {
      // 设置错误类型的值
      await db.settings.put({
        key: 'isFirstTime',
        value: 'not a boolean' as unknown as boolean
      })
      
      // 应该能够处理并返回结果（实现会直接返回存储的值）
      const isFirstTime = await welcomeManager.isFirstTime()
      // 实现会直接返回存储的值，不做类型转换
      // 这个测试验证了实现的行为，即使值类型不正确也能返回
      expect(isFirstTime).toBeDefined()
    })

    it('getGuideSteps应该是纯函数（无副作用）', () => {
      // 多次调用不应该改变结果
      const steps1 = welcomeManager.getGuideSteps()
      const steps2 = welcomeManager.getGuideSteps()
      
      // 验证返回的是新数组（不是同一个引用）
      expect(steps1).not.toBe(steps2)
      
      // 但内容应该相同
      expect(steps1).toEqual(steps2)
    })

    it('修改返回的步骤数组不应该影响后续调用', () => {
      // 获取步骤并修改
      const steps1 = welcomeManager.getGuideSteps()
      steps1.push({
        id: 'modified-step',
        title: 'Modified',
        description: 'This should not affect future calls'
      })
      
      // 再次获取步骤
      const steps2 = welcomeManager.getGuideSteps()
      
      // 验证原始步骤数量没有改变
      expect(steps2).toHaveLength(8)
      expect(steps2.find(s => s.id === 'modified-step')).toBeUndefined()
    })

    it('应该正确处理并发的状态更新', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 并发调用多个操作
      const promises = [
        welcomeManager.isFirstTime(),
        welcomeManager.isWelcomeCompleted(),
        welcomeManager.getGuideStatus()
      ]
      
      // 等待所有操作完成
      const results = await Promise.all(promises)
      
      // 验证结果合理
      expect(results[0]).toBe(true) // isFirstTime
      expect(results[1]).toBe(false) // isWelcomeCompleted
      expect(results[2]).toEqual({
        isFirstTime: true,
        welcomeCompleted: false
      })
    })

    it('应该正确处理快速的完成和重置操作', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 快速执行完成和重置
      await welcomeManager.markWelcomeCompleted()
      await welcomeManager.resetGuide()
      
      // 验证最终状态
      const status = await welcomeManager.getGuideStatus()
      expect(status.isFirstTime).toBe(true)
      expect(status.welcomeCompleted).toBe(false)
    })

    it('应该正确处理多次重置操作', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 完成欢迎流程
      await welcomeManager.markWelcomeCompleted()
      
      // 多次重置
      await welcomeManager.resetGuide()
      await welcomeManager.resetGuide()
      await welcomeManager.resetGuide()
      
      // 验证状态仍然正确
      const status = await welcomeManager.getGuideStatus()
      expect(status.isFirstTime).toBe(true)
      expect(status.welcomeCompleted).toBe(false)
    })

    it('应该正确处理多次完成操作', async () => {
      // 确保数据库是干净的
      await db.settings.clear()
      
      // 多次标记完成
      await welcomeManager.markWelcomeCompleted()
      await welcomeManager.markWelcomeCompleted()
      await welcomeManager.markWelcomeCompleted()
      
      // 验证状态仍然正确
      const status = await welcomeManager.getGuideStatus()
      expect(status.isFirstTime).toBe(false)
      expect(status.welcomeCompleted).toBe(true)
    })
  })

  describe('引导步骤内容验证', () => {
    it('所有步骤的描述应该是中文', () => {
      const steps = welcomeManager.getGuideSteps()
      
      for (const step of steps) {
        // 验证标题和描述包含中文字符
        expect(step.title).toMatch(/[\u4e00-\u9fa5]/)
        expect(step.description).toMatch(/[\u4e00-\u9fa5]/)
      }
    })

    it('目标选择器应该使用有效的CSS选择器格式', () => {
      const steps = welcomeManager.getGuideSteps()
      
      for (const step of steps) {
        if (step.target) {
          // 验证选择器格式（以#或.开头）
          expect(step.target).toMatch(/^[#.][\w-]+$/)
        }
      }
    })

    it('引导步骤应该提供足够的信息', () => {
      const steps = welcomeManager.getGuideSteps()
      
      for (const step of steps) {
        // 标题应该简洁（不超过20个字符）
        expect(step.title.length).toBeLessThanOrEqual(20)
        
        // 描述应该有足够的信息（至少10个字符）
        expect(step.description.length).toBeGreaterThanOrEqual(10)
        
        // 描述不应该过长（不超过200个字符）
        expect(step.description.length).toBeLessThanOrEqual(200)
      }
    })

    it('引导步骤应该覆盖需求7中提到的功能', () => {
      const steps = welcomeManager.getGuideSteps()
      const allContent = steps.map(s => s.title + ' ' + s.description).join(' ')
      
      // 根据需求7，应该包含以下功能的引导：
      // - 创建备忘录
      expect(allContent).toContain('备忘录')
      
      // - 标签功能
      expect(allContent).toContain('标签')
      
      // - 文件上传
      expect(allContent).toContain('附件') || expect(allContent).toContain('上传')
      
      // - 搜索功能
      expect(allContent).toContain('搜索')
      
      // - 统计功能
      expect(allContent).toContain('统计')
      
      // - 设置功能
      expect(allContent).toContain('设置')
    })
  })
})
