/**
 * CYP-memo 备忘录管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { memoDAO } from '../database/MemoDAO'
import { userDAO } from '../database/UserDAO'
import { validateTagName } from '../utils/validation'
import { logManager } from './LogManager'
import { generateUUID } from '../utils/crypto'
import type { Memo, MemoHistory } from '../types'

/**
 * 本地存储键名
 */
const STORAGE_KEY_DRAFT = 'cyp-memo-draft'

/**
 * 草稿信息接口
 */
interface DraftInfo {
  content: string
  timestamp: number
}

/**
 * 备忘录管理器
 * 负责备忘录的 CRUD 操作、搜索和草稿管理
 */
export class MemoManager {
  /**
   * 创建备忘录
   * @param userId 用户 ID
   * @param title 标题
   * @param content 内容
   * @param tags 标签数组
   * @returns Promise<Memo> 创建的备忘录对象
   * @throws Error 创建失败时抛出错误
   */
  async createMemo(
    userId: string,
    title: string,
    content: string,
    tags: string[] = []
  ): Promise<Memo> {
    // 验证标签
    const invalidTags = tags.filter((tag) => !validateTagName(tag))
    if (invalidTags.length > 0) {
      throw new Error(`标签名称无效: ${invalidTags.join(', ')}`)
    }

    // 获取用户信息以保存创建人名称
    const user = await userDAO.getById(userId)
    const creatorName = user?.username || '未知用户'

    // 创建备忘录对象
    const memo: Memo = {
      id: generateUUID(),
      userId,
      title: title.trim(),
      content,
      tags,
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      creatorName,
    }

    // 保存到数据库
    await memoDAO.create(memo)

    // 记录日志
    await logManager.info('备忘录创建成功', {
      userId,
      memoId: memo.id,
      action: 'memo_create',
      creatorName,
    })

    return memo
  }

  /**
   * 更新备忘录
   * @param memoId 备忘录 ID
   * @param title 标题
   * @param content 内容
   * @param tags 标签数组
   * @param attachments 附件ID数组（可选）
   * @returns Promise<Memo> 更新后的备忘录对象
   * @throws Error 更新失败时抛出错误
   */
  async updateMemo(
    memoId: string,
    title: string,
    content: string,
    tags: string[] = [],
    attachments?: string[]
  ): Promise<Memo> {
    // 获取现有备忘录
    const existingMemo = await memoDAO.getById(memoId)
    if (!existingMemo) {
      throw new Error('备忘录不存在')
    }

    // 验证标签
    const invalidTags = tags.filter((tag) => !validateTagName(tag))
    if (invalidTags.length > 0) {
      throw new Error(`标签名称无效: ${invalidTags.join(', ')}`)
    }

    // 保存历史记录
    const history: MemoHistory = {
      id: generateUUID(),
      memoId,
      content: existingMemo.content,
      timestamp: new Date(),
    }
    await memoDAO.createHistory(history)

    // 构建更新数据
    const updateData: Partial<Memo> = {
      title: title.trim(),
      content,
      tags,
    }
    
    // 如果提供了附件列表，则更新
    if (attachments !== undefined) {
      updateData.attachments = attachments
    }

    // 更新备忘录
    await memoDAO.update(memoId, updateData)

    // 获取更新后的备忘录
    const updatedMemo = await memoDAO.getById(memoId)
    if (!updatedMemo) {
      throw new Error('更新后无法获取备忘录')
    }

    // 记录日志
    await logManager.info('备忘录更新成功', {
      userId: updatedMemo.userId,
      memoId,
      action: 'memo_update',
    })

    return updatedMemo
  }

  /**
   * 删除备忘录
   * @param memoId 备忘录 ID
   * @throws Error 删除失败时抛出错误
   */
  async deleteMemo(memoId: string): Promise<void> {
    // 获取备忘录
    const memo = await memoDAO.getById(memoId)
    if (!memo) {
      throw new Error('备忘录不存在')
    }

    // 软删除备忘录
    await memoDAO.softDelete(memoId)

    // 记录日志
    await logManager.info('备忘录删除成功', {
      userId: memo.userId,
      memoId,
      action: 'memo_delete',
    })
  }

  /**
   * 获取备忘录
   * @param memoId 备忘录 ID
   * @returns Promise<Memo> 备忘录对象
   * @throws Error 获取失败时抛出错误
   */
  async getMemo(memoId: string): Promise<Memo> {
    const memo = await memoDAO.getById(memoId)
    if (!memo) {
      throw new Error('备忘录不存在')
    }
    if (memo.deletedAt) {
      throw new Error('备忘录已被删除')
    }
    return memo
  }

  /**
   * 获取所有备忘录
   * 数据隔离规则：
   * - 主账号可以看到自己和所有子账号的备忘录
   * - 子账号可以看到自己、主账号和同一主账号下其他子账号的备忘录
   * - 不同主账号之间的数据完全隔离，互不可见
   * @param userId 用户 ID
   * @returns Promise<Memo[]> 备忘录列表
   */
  async getAllMemos(userId: string): Promise<Memo[]> {
    // 获取当前用户信息
    const currentUser = await userDAO.getById(userId)
    if (!currentUser) {
      return await memoDAO.getByUserId(userId)
    }

    let allMemos: Memo[] = []

    if (currentUser.isMainAccount) {
      // 主账号：获取自己的备忘录
      const ownMemos = await memoDAO.getByUserId(userId)
      allMemos = [...ownMemos]

      // 获取所有子账号的备忘录
      const subAccounts = await userDAO.getSubAccounts(userId)
      for (const subAccount of subAccounts) {
        const subMemos = await memoDAO.getByUserId(subAccount.id)
        allMemos = [...allMemos, ...subMemos]
      }
    } else if (currentUser.parentUserId) {
      // 子账号：获取自己的备忘录
      const ownMemos = await memoDAO.getByUserId(userId)
      allMemos = [...ownMemos]

      // 获取主账号的备忘录
      const parentMemos = await memoDAO.getByUserId(currentUser.parentUserId)
      allMemos = [...allMemos, ...parentMemos]

      // 获取同一主账号下其他子账号的备忘录
      const siblingAccounts = await userDAO.getSubAccounts(currentUser.parentUserId)
      for (const sibling of siblingAccounts) {
        // 排除自己，避免重复
        if (sibling.id !== userId) {
          const siblingMemos = await memoDAO.getByUserId(sibling.id)
          allMemos = [...allMemos, ...siblingMemos]
        }
      }
    } else {
      // 普通用户（没有主账号也没有子账号）：只获取自己的备忘录
      allMemos = await memoDAO.getByUserId(userId)
    }

    // 按更新时间排序（最新的在前）
    return allMemos.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  /**
   * 搜索备忘录
   * @param userId 用户 ID
   * @param query 搜索关键词
   * @param tags 标签筛选（可选）
   * @returns Promise<Memo[]> 匹配的备忘录列表
   */
  async searchMemos(userId: string, query?: string, tags?: string[]): Promise<Memo[]> {
    // 如果有标签筛选
    if (tags && tags.length > 0) {
      const memosByTags = await memoDAO.searchByTags(userId, tags)

      // 如果还有关键词搜索，进一步筛选
      if (query && query.trim().length > 0) {
        const lowerQuery = query.toLowerCase()
        return memosByTags.filter(
          (memo) =>
            memo.title.toLowerCase().includes(lowerQuery) ||
            memo.content.toLowerCase().includes(lowerQuery)
        )
      }

      return memosByTags
    }

    // 如果只有关键词搜索
    if (query && query.trim().length > 0) {
      return await memoDAO.search(userId, query)
    }

    // 如果没有任何筛选条件，返回所有备忘录
    return await memoDAO.getByUserId(userId)
  }

  /**
   * 获取备忘录历史
   * @param memoId 备忘录 ID
   * @returns Promise<MemoHistory[]> 历史记录列表
   */
  async getMemoHistory(memoId: string): Promise<MemoHistory[]> {
    return await memoDAO.getHistory(memoId)
  }

  /**
   * 自动保存草稿
   * @param content 草稿内容
   */
  async saveDraft(content: string): Promise<void> {
    const draftInfo: DraftInfo = {
      content,
      timestamp: Date.now(),
    }

    try {
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(draftInfo))
    } catch (error) {
      // 如果保存失败（例如存储空间不足），记录错误但不抛出
      await logManager.warn('草稿保存失败', {
        error: error instanceof Error ? error.message : String(error),
        action: 'draft_save',
      })
    }
  }

  /**
   * 获取草稿
   * @returns Promise<string | null> 草稿内容，如果没有则返回 null
   */
  async getDraft(): Promise<string | null> {
    try {
      const data = localStorage.getItem(STORAGE_KEY_DRAFT)
      if (!data) {
        return null
      }

      const draftInfo = JSON.parse(data) as DraftInfo
      return draftInfo.content
    } catch (error) {
      await logManager.warn('草稿读取失败', {
        error: error instanceof Error ? error.message : String(error),
        action: 'draft_get',
      })
      return null
    }
  }

  /**
   * 清除草稿
   */
  async clearDraft(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY_DRAFT)
    } catch (error) {
      await logManager.warn('草稿清除失败', {
        error: error instanceof Error ? error.message : String(error),
        action: 'draft_clear',
      })
    }
  }

  /**
   * 获取用户的所有标签
   * @param userId 用户 ID
   * @returns Promise<string[]> 标签列表
   */
  async getAllTags(userId: string): Promise<string[]> {
    return await memoDAO.getAllTags(userId)
  }

  /**
   * 按标签获取备忘录
   * @param userId 用户 ID
   * @param tag 标签
   * @returns Promise<Memo[]> 备忘录列表
   */
  async getMemosByTag(userId: string, tag: string): Promise<Memo[]> {
    return await memoDAO.getByTag(userId, tag)
  }

  /**
   * 永久删除备忘录（包括历史记录）
   * @param memoId 备忘录 ID
   */
  async permanentlyDeleteMemo(memoId: string): Promise<void> {
    // 获取备忘录
    const memo = await memoDAO.getById(memoId)
    if (!memo) {
      throw new Error('备忘录不存在')
    }

    // 删除历史记录
    await memoDAO.deleteHistory(memoId)

    // 永久删除备忘录
    await memoDAO.delete(memoId)

    // 记录日志
    await logManager.info('备忘录永久删除成功', {
      userId: memo.userId,
      memoId,
      action: 'memo_permanent_delete',
    })
  }

  /**
   * 获取已删除的备忘录
   * @param userId 用户 ID
   * @returns Promise<Memo[]> 已删除的备忘录列表
   */
  async getDeletedMemos(userId: string): Promise<Memo[]> {
    return await memoDAO.getDeleted(userId)
  }

  /**
   * 恢复已删除的备忘录
   * @param memoId 备忘录 ID
   */
  async restoreMemo(memoId: string): Promise<void> {
    const memo = await memoDAO.getById(memoId)
    if (!memo) {
      throw new Error('备忘录不存在')
    }

    if (!memo.deletedAt) {
      throw new Error('备忘录未被删除')
    }

    // 恢复备忘录（清除 deletedAt）
    await memoDAO.update(memoId, {
      deletedAt: undefined,
    })

    // 记录日志
    await logManager.info('备忘录恢复成功', {
      userId: memo.userId,
      memoId,
      action: 'memo_restore',
    })
  }
}

/**
 * MemoManager 单例实例
 */
export const memoManager = new MemoManager()
