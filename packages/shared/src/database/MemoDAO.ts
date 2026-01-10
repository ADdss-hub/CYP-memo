/**
 * CYP-memo 备忘录数据访问对象
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { getStorage } from '../storage'
import type { Memo, MemoHistory } from '../types'

/**
 * 备忘录数据访问对象
 * 提供备忘录数据的 CRUD 操作
 * 通过存储管理器支持本地和远程存储
 */
export class MemoDAO {
  /**
   * 创建新备忘录
   */
  async create(memo: Memo): Promise<string> {
    return await getStorage().createMemo(memo)
  }

  /**
   * 根据 ID 获取备忘录
   */
  async getById(id: string): Promise<Memo | undefined> {
    return await getStorage().getMemoById(id)
  }

  /**
   * 获取用户的所有备忘录（不包括已删除）
   */
  async getByUserId(userId: string): Promise<Memo[]> {
    const memos = await getStorage().getMemosByUserId(userId)
    return memos.filter((memo) => !memo.deletedAt)
  }

  /**
   * 获取所有备忘录（包括已删除）
   */
  async getAll(): Promise<Memo[]> {
    // 注意：此方法需要管理员权限，实际使用时需要遍历所有用户
    throw new Error('getAll 方法不支持，请使用 getByUserId')
  }

  /**
   * 根据标签搜索备忘录
   */
  async getByTag(userId: string, tag: string): Promise<Memo[]> {
    return await getStorage().getMemosByTag(userId, tag)
  }

  /**
   * 搜索备忘录（标题或内容包含关键词）
   */
  async search(userId: string, query: string): Promise<Memo[]> {
    return await getStorage().searchMemos(userId, query)
  }

  /**
   * 按标签筛选搜索
   */
  async searchByTags(userId: string, tags: string[]): Promise<Memo[]> {
    const allMemos = await getStorage().getMemosByUserId(userId)
    return allMemos.filter(
      (memo) => !memo.deletedAt && tags.some((tag) => memo.tags.includes(tag))
    )
  }

  /**
   * 更新备忘录
   */
  async update(id: string, updates: Partial<Memo>): Promise<number> {
    return await getStorage().updateMemo(id, {
      ...updates,
      updatedAt: new Date(),
    })
  }

  /**
   * 软删除备忘录
   */
  async softDelete(id: string): Promise<number> {
    return await getStorage().updateMemo(id, {
      deletedAt: new Date(),
    })
  }

  /**
   * 永久删除备忘录
   */
  async delete(id: string): Promise<void> {
    await getStorage().deleteMemo(id)
  }

  /**
   * 获取已删除的备忘录
   */
  async getDeleted(userId: string): Promise<Memo[]> {
    return await getStorage().getDeletedMemos(userId)
  }

  /**
   * 获取用户使用的所有标签
   */
  async getAllTags(userId: string): Promise<string[]> {
    const memos = await this.getByUserId(userId)
    const tagsSet = new Set<string>()
    memos.forEach((memo) => {
      memo.tags.forEach((tag) => tagsSet.add(tag))
    })
    return Array.from(tagsSet)
  }

  /**
   * 创建备忘录历史记录
   */
  async createHistory(history: MemoHistory): Promise<string> {
    return await getStorage().createMemoHistory(history)
  }

  /**
   * 获取备忘录的历史记录
   */
  async getHistory(memoId: string): Promise<MemoHistory[]> {
    return await getStorage().getMemoHistory(memoId)
  }

  /**
   * 删除备忘录的历史记录
   */
  async deleteHistory(memoId: string): Promise<void> {
    await getStorage().deleteMemoHistory(memoId)
  }
}

/**
 * MemoDAO 单例实例
 */
export const memoDAO = new MemoDAO()
