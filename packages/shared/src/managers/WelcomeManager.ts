/**
 * CYP-memo 欢迎引导管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import { logManager } from './LogManager'

/**
 * 引导步骤接口
 */
export interface GuideStep {
  id: string
  title: string
  description: string
  target?: string // 目标元素选择器
  position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * 设置键名常量
 */
const SETTING_KEY_FIRST_TIME = 'isFirstTime'
const SETTING_KEY_WELCOME_COMPLETED = 'welcomeCompleted'

/**
 * 欢迎引导管理器
 * 负责首次使用欢迎界面和功能引导
 * 通过存储管理器支持本地和远程存储
 */
export class WelcomeManager {
  /**
   * 检查是否首次使用
   * @returns Promise<boolean> 如果是首次使用返回 true，否则返回 false
   */
  async isFirstTime(): Promise<boolean> {
    try {
      const setting = await getStorage().getSetting<boolean>(SETTING_KEY_FIRST_TIME)

      // 如果没有设置记录，说明是首次使用
      if (setting === undefined) {
        // 初始化设置
        await getStorage().setSetting(SETTING_KEY_FIRST_TIME, true)

        await logManager.info('首次使用检测：是首次使用', {
          action: 'first_time_check',
          result: true,
        })

        return true
      }

      await logManager.debug('首次使用检测', {
        action: 'first_time_check',
        result: setting,
      })

      return setting
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'first_time_check',
        message: '检查首次使用状态失败',
      })
      // 出错时默认返回 false
      return false
    }
  }

  /**
   * 标记欢迎流程已完成
   * @returns Promise<void>
   */
  async markWelcomeCompleted(): Promise<void> {
    try {
      // 标记不再是首次使用
      await getStorage().setSetting(SETTING_KEY_FIRST_TIME, false)

      // 标记欢迎流程已完成
      await getStorage().setSetting(SETTING_KEY_WELCOME_COMPLETED, true)

      await logManager.info('欢迎流程已完成', {
        action: 'welcome_completed',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'mark_welcome_completed',
        message: '标记欢迎流程完成失败',
      })
      throw new Error('标记欢迎流程完成失败')
    }
  }

  /**
   * 检查欢迎流程是否已完成
   * @returns Promise<boolean> 如果已完成返回 true，否则返回 false
   */
  async isWelcomeCompleted(): Promise<boolean> {
    try {
      const setting = await getStorage().getSetting<boolean>(SETTING_KEY_WELCOME_COMPLETED)
      return setting ?? false
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'check_welcome_completed',
        message: '检查欢迎流程状态失败',
      })
      return false
    }
  }

  /**
   * 获取引导步骤
   * @returns GuideStep[] 引导步骤列表
   */
  getGuideSteps(): GuideStep[] {
    return [
      {
        id: 'step-1',
        title: '欢迎使用 CYP-memo',
        description: '一款现代化、安全可靠的个人备忘录管理系统。让我们花几分钟了解主要功能，帮助您更高效地管理备忘录。',
      },
      {
        id: 'step-2',
        title: '创建备忘录',
        description:
          '使用强大的富文本编辑器创建您的备忘录。支持 Markdown 语法、实时预览，让您的内容更加丰富多彩。',
        target: '#create-memo-btn',
        position: 'bottom',
      },
      {
        id: 'step-3',
        title: '智能标签管理',
        description: '为备忘录添加标签，实现智能分类。支持标签自动补全、颜色标记，让查找变得轻而易举。',
        target: '#tags-input',
        position: 'top',
      },
      {
        id: 'step-4',
        title: '文件附件上传',
        description: '支持上传图片、文档等多种格式文件。拖拽即可上传，图片自动预览，大文件也能轻松处理。',
        target: '#upload-file-btn',
        position: 'left',
      },
      {
        id: 'step-5',
        title: '全文搜索筛选',
        description: '强大的搜索功能支持标题、内容、标签的全文检索。多条件组合筛选，快速定位目标备忘录。',
        target: '#search-box',
        position: 'bottom',
      },
      {
        id: 'step-6',
        title: '数据统计分析',
        description: '可视化的数据统计面板，展示备忘录数量、标签使用分布、存储空间占用等关键信息。',
        target: '#statistics-link',
        position: 'right',
      },
      {
        id: 'step-7',
        title: '个性化设置',
        description: '丰富的自定义选项：深色/浅色主题切换、字体大小调整、数据导入导出等，打造专属体验。',
        target: '#settings-link',
        position: 'right',
      },
      {
        id: 'step-8',
        title: '准备就绪',
        description: '恭喜！您已了解 CYP-memo 的核心功能。现在开始创建您的第一条备忘录，开启高效记录之旅吧！',
      },
    ]
  }

  /**
   * 重置引导状态
   * 将首次使用和欢迎完成状态重置，用户下次访问时会再次看到引导
   * @returns Promise<void>
   */
  async resetGuide(): Promise<void> {
    try {
      // 重置首次使用标记
      await getStorage().setSetting(SETTING_KEY_FIRST_TIME, true)

      // 重置欢迎完成标记
      await getStorage().setSetting(SETTING_KEY_WELCOME_COMPLETED, false)

      await logManager.info('引导状态已重置', {
        action: 'reset_guide',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      await logManager.error(error as Error, {
        action: 'reset_guide',
        message: '重置引导状态失败',
      })
      throw new Error('重置引导状态失败')
    }
  }

  /**
   * 获取当前引导状态
   * @returns Promise<{ isFirstTime: boolean; welcomeCompleted: boolean }>
   */
  async getGuideStatus(): Promise<{ isFirstTime: boolean; welcomeCompleted: boolean }> {
    const isFirstTime = await this.isFirstTime()
    const welcomeCompleted = await this.isWelcomeCompleted()

    return {
      isFirstTime,
      welcomeCompleted,
    }
  }
}

/**
 * WelcomeManager 单例实例
 */
export const welcomeManager = new WelcomeManager()
