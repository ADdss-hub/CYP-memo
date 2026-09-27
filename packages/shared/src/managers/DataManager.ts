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
      let parsed: { version?: string }
      try {
        parsed = JSON.parse(jsonString)
      } catch {
        throw new Error('无效的 JSON 格式')
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.version) {
        throw new Error('缺少版本信息')
      }

      // 覆盖模式先清空；合并模式由适配器 bulkPut 不整库清空
      if (!merge) {
        await this.clearAllData()
      }

      await getStorage().importData(jsonString, { merge })

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
      await this.getStatistics()

      // 本地模式：检测孤立备忘录（userId 无对应用户）
      const { storageManager } = await import('../storage')
      if (storageManager.isInitialized() && storageManager.getAdapter().getMode() === 'local') {
        const { db } = await import('../database/db')
        const userIds = new Set((await db.users.toArray()).map((u) => u.id))
        const orphan = await db.memos.filter((m) => !userIds.has(m.userId)).first()
        if (orphan) {
          return false
        }
      }

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
