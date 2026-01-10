/**
 * CYP-memo 数据持久化管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import { logManager } from './LogManager'

/**
 * 数据持久化管理器
 * 负责数据的立即持久化、恢复和序列化
 * 通过存储管理器支持本地和远程存储
 */
export class DataManager {
  /**
   * 导出所有数据为 JSON
   * @returns Promise<string> JSON 字符串（UTF-8 编码）
   */
  async exportToJSON(): Promise<string> {
    try {
      const jsonString = await getStorage().exportAllData()

      await logManager.info('数据导出成功', {
        action: 'data_export',
      })

      return jsonString
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'data_export',
      })
      throw new Error('数据导出失败')
    }
  }

  /**
   * 从 JSON 导入数据
   * @param jsonString JSON 字符串
   * @param merge 是否合并数据（true）还是覆盖（false）
   */
  async importFromJSON(jsonString: string, merge = false): Promise<void> {
    try {
      // 如果不是合并模式，先清空数据库
      if (!merge) {
        await this.clearAllData()
      }

      await getStorage().importData(jsonString)

      await logManager.info('数据导入成功', {
        action: 'data_import',
        mode: merge ? 'merge' : 'replace',
      })
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'data_import',
      })
      throw new Error('数据导入失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  /**
   * 恢复数据（从 JSON 字符串）
   * @param jsonString JSON 字符串
   */
  async recoverData(jsonString: string): Promise<void> {
    await this.importFromJSON(jsonString, false)
  }

  /**
   * 清空所有数据
   */
  async clearAllData(): Promise<void> {
    try {
      await getStorage().clearAllData()

      await logManager.info('所有数据已清空', {
        action: 'data_clear',
      })
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'data_clear',
      })
      throw new Error('清空数据失败')
    }
  }

  /**
   * 验证数据完整性
   * @returns Promise<boolean> 数据是否完整
   */
  async validateDataIntegrity(): Promise<boolean> {
    try {
      // 获取统计信息以验证数据库可访问性
      await this.getStatistics()
      return true
    } catch (error) {
      await logManager.error(error instanceof Error ? error : new Error(String(error)), {
        action: 'data_integrity_check',
      })
      return false
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{
    userCount: number
    memoCount: number
    fileCount: number
    shareCount: number
    logCount: number
  }> {
    return await getStorage().getStatistics()
  }
}

/**
 * DataManager 单例实例
 */
export const dataManager = new DataManager()
