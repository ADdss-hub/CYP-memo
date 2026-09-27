/**
 * CYP-memo 备忘录管理器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { memoDAO } from '../database/MemoDAO'
import { fileDAO } from '../database/FileDAO'
import { userDAO } from '../database/UserDAO'
import { validateTagName } from '../utils/validation'
import { logManager } from './LogManager'
import { fileManager } from './FileManager'
import { generateUUID } from '../utils/crypto'
import { storageManager } from '../storage/StorageManager'
import type { RemoteStorageAdapter } from '../storage/RemoteStorageAdapter'
import type { FileMetadata, Memo, MemoHistory } from '../types'
import { resolveTenantRootId } from '../types'

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
    tags: string[] = [],
    opts?: { id?: string; attachments?: string[] }
  ): Promise<Memo> {
    // 验证标签
    const invalidTags = tags.filter((tag) => !validateTagName(tag))
    if (invalidTags.length > 0) {
      throw new Error(`标签名称无效: ${invalidTags.join(', ')}`)
    }

    // 获取用户信息以保存创建人名称
    const user = await userDAO.getById(userId)
    const creatorName = user?.username || '未知用户'

    // 创建备忘录对象（可选预分配 id / 附件，避免 create→update 双写）
    const memo: Memo = {
      id: opts?.id || generateUUID(),
      userId,
      title: title.trim(),
      content,
      tags,
      attachments: opts?.attachments ? [...opts.attachments] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
      creatorName,
    }

    // 保存到数据库
    await memoDAO.create(memo)

    const remote = storageManager.getMode() === 'remote'
    if (remote) {
      void logManager.info('备忘录创建成功', {
        userId,
        memoId: memo.id,
        action: 'memo_create',
        creatorName,
      })
    } else {
      await logManager.info('备忘录创建成功', {
        userId,
        memoId: memo.id,
        action: 'memo_create',
        creatorName,
      })
    }

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
    const invalidTags = tags.filter((tag) => !validateTagName(tag))
    if (invalidTags.length > 0) {
      throw new Error(`标签名称无效: ${invalidTags.join(', ')}`)
    }

    const updateData: Partial<Memo> = {
      title: title.trim(),
      content,
      tags,
    }
    if (attachments !== undefined) {
      updateData.attachments = attachments
    }

    const remote = storageManager.getMode() === 'remote'
    if (!remote) {
      const existingMemo = await memoDAO.getById(memoId)
      if (!existingMemo) {
        throw new Error('备忘录不存在')
      }
      await memoDAO.createHistory({
        id: generateUUID(),
        memoId,
        content: existingMemo.content,
        timestamp: new Date(),
      })
    }

    await memoDAO.update(memoId, updateData)

    if (remote) {
      void logManager.info('备忘录更新成功', {
        memoId,
        action: 'memo_update',
      })
      const now = new Date()
      return {
        id: memoId,
        userId: '',
        title: updateData.title || '',
        content,
        tags,
        attachments: attachments ?? [],
        createdAt: now,
        updatedAt: now,
      }
    }

    const updatedMemo = await memoDAO.getById(memoId)
    if (!updatedMemo) {
      throw new Error('更新后无法获取备忘录')
    }

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

    // 先清理关联附件，再软删除（附件管理页同步消失）
    await this.deleteMemoAttachments(memo)

    // 软删除备忘录
    await memoDAO.softDelete(memoId)

    if (storageManager.getMode() === 'remote') {
      void logManager.info('备忘录删除成功', {
        userId: memo.userId,
        memoId,
        action: 'memo_delete',
      })
    } else {
      await logManager.info('备忘录删除成功', {
        userId: memo.userId,
        memoId,
        action: 'memo_delete',
      })
    }
  }

  /**
   * 删除备忘录关联附件（attachments 列表 + memoId 反查）
   */
  private async deleteMemoAttachments(memo: Memo): Promise<void> {
    const fileIds = new Set<string>(memo.attachments || [])
    try {
      const linked = await fileDAO.getByMemoId(memo.id)
      for (const file of linked) {
        fileIds.add(file.id)
      }
    } catch (err) {
      await logManager.warn('按 memoId 查找附件失败', {
        memoId: memo.id,
        error: err instanceof Error ? err.message : String(err),
        action: 'memo_attachments_lookup_failed',
      })
    }

    if (fileIds.size === 0) return

    let others: Memo[] = []
    try {
      others = (await memoDAO.getByUserId(memo.userId)).filter(
        (item) => item.id !== memo.id && !item.deletedAt
      )
    } catch (err) {
      await logManager.warn('查找其它备忘录失败', {
        memoId: memo.id,
        error: err instanceof Error ? err.message : String(err),
        action: 'memo_attachments_lookup_failed',
      })
    }

    const exclusive: string[] = []
    for (const fileId of fileIds) {
      let meta: FileMetadata | undefined
      try {
        meta = await fileDAO.getMetadata(fileId)
      } catch {
        meta = undefined
      }
      const usedElsewhere = others.some((item) => (item.attachments || []).includes(fileId))
      const pointedElsewhere = !!(meta?.memoId && meta.memoId !== memo.id)
      if (usedElsewhere || pointedElsewhere) {
        if (meta?.memoId === memo.id) {
          const fallback = others.find((item) => (item.attachments || []).includes(fileId))
          try {
            await fileDAO.updateMetadata(fileId, { memoId: fallback?.id ?? null })
          } catch (err) {
            await logManager.warn('改写共用文件主关联失败', {
              memoId: memo.id,
              fileId,
              error: err instanceof Error ? err.message : String(err),
              action: 'memo_shared_file_reassign_failed',
            })
          }
        }
        continue
      }
      exclusive.push(fileId)
    }

    if (exclusive.length === 0) return

    try {
      await fileManager.deleteFiles(exclusive)
    } catch (err) {
      await logManager.warn('删除备忘录附件失败', {
        memoId: memo.id,
        fileCount: fileIds.size,
        error: err instanceof Error ? err.message : String(err),
        action: 'memo_attachments_delete_failed',
      })
    }
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
    const [enriched] = await this.withCreatorNames([memo])
    return enriched
  }

  /**
   * 为备忘录回填创建人用户名（多子用户共享列表可见）
   */
  private async withCreatorNames(memos: Memo[]): Promise<Memo[]> {
    const nameByUserId = new Map<string, string>()
    const out: Memo[] = []

    for (const memo of memos) {
      let name = memo.creatorName?.trim()
      if (!name) {
        if (!nameByUserId.has(memo.userId)) {
          try {
            const user = await userDAO.getById(memo.userId)
            nameByUserId.set(memo.userId, user?.username || '未知用户')
          } catch {
            nameByUserId.set(memo.userId, '未知用户')
          }
        }
        name = nameByUserId.get(memo.userId) || '未知用户'
      }
      out.push({ ...memo, creatorName: name })
    }

    return out
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
    // 远程：唯一列表 GET /memos（十权 memo_manage + 租户数据范围）
    if (storageManager.isInitialized() && storageManager.getMode() === 'remote') {
      try {
        const adapter = storageManager.getAdapter() as RemoteStorageAdapter
        const remote = await adapter.getMemos()
        return remote.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      } catch (err) {
        await logManager.error(
          err instanceof Error ? err : new Error(String(err)),
          { action: 'getAllMemos_tenant', userId }
        )
        throw err instanceof Error ? err : new Error('加载备忘录失败')
      }
    }

    const currentUser = await userDAO.getById(userId)
    if (!currentUser) {
      return this.withCreatorNames(await memoDAO.getByUserId(userId))
    }

    const rootId = resolveTenantRootId(currentUser)
    const members = await userDAO.listByTenantRootId(rootId)
    const memberIds =
      members.length > 0 ? members.map((m) => m.id) : [currentUser.id]

    let allMemos: Memo[] = []
    for (const mid of memberIds) {
      const memos = await memoDAO.getByUserId(mid)
      allMemos = [...allMemos, ...memos]
    }

    const enriched = await this.withCreatorNames(allMemos)
    return enriched.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
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
        return this.withCreatorNames(
          memosByTags.filter(
            (memo) =>
              memo.title.toLowerCase().includes(lowerQuery) ||
              memo.content.toLowerCase().includes(lowerQuery)
          )
        )
      }

      return this.withCreatorNames(memosByTags)
    }

    // 如果只有关键词搜索
    if (query && query.trim().length > 0) {
      return this.withCreatorNames(await memoDAO.search(userId, query))
    }

    // 如果没有任何筛选条件，返回本租户可见备忘录（与 getAllMemos 同源）
    return this.getAllMemos(userId)
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
    return this.withCreatorNames(await memoDAO.getByTag(userId, tag))
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

    // 永久删除前清理附件
    await this.deleteMemoAttachments(memo)

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
