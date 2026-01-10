/**
 * CYP-memo 备忘录状态管理
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { memoManager } from '@cyp-memo/shared'
import type { Memo } from '@cyp-memo/shared'

/**
 * 备忘录状态管理
 */
export const useMemoStore = defineStore('memo', () => {
  // 状态
  const memos = ref<Memo[]>([])
  const currentMemo = ref<Memo | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])

  // 计算属性
  const filteredMemos = computed(() => {
    let result = memos.value

    // 按搜索查询过滤
    if (searchQuery.value) {
      result = result.filter(
        (memo) =>
          memo.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          memo.content.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    }

    // 按标签过滤
    if (selectedTags.value.length > 0) {
      result = result.filter((memo) => selectedTags.value.every((tag) => memo.tags.includes(tag)))
    }

    return result
  })

  const allTags = computed(() => {
    const tagSet = new Set<string>()
    memos.value.forEach((memo) => {
      memo.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  })

  const memoCount = computed(() => memos.value.length)

  /**
   * 加载用户的所有备忘录
   */
  async function loadMemos(userId: string) {
    isLoading.value = true
    error.value = null

    try {
      const result = await memoManager.getAllMemos(userId)
      memos.value = result
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 创建备忘录
   */
  async function createMemo(userId: string, title: string, content: string, tags: string[] = []) {
    isLoading.value = true
    error.value = null

    try {
      const memo = await memoManager.createMemo(userId, title, content, tags)
      memos.value.unshift(memo)
      return memo
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 更新备忘录
   */
  async function updateMemo(memoId: string, title: string, content: string, tags: string[] = [], attachments?: string[]) {
    isLoading.value = true
    error.value = null

    try {
      const memo = await memoManager.updateMemo(memoId, title, content, tags, attachments)
      const index = memos.value.findIndex((m) => m.id === memoId)
      if (index !== -1) {
        memos.value[index] = memo
      }
      if (currentMemo.value?.id === memoId) {
        currentMemo.value = memo
      }
      return memo
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 删除备忘录
   */
  async function deleteMemo(memoId: string) {
    isLoading.value = true
    error.value = null

    try {
      await memoManager.deleteMemo(memoId)
      memos.value = memos.value.filter((m) => m.id !== memoId)
      if (currentMemo.value?.id === memoId) {
        currentMemo.value = null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取单个备忘录
   */
  async function getMemo(memoId: string) {
    isLoading.value = true
    error.value = null

    try {
      const memo = await memoManager.getMemo(memoId)
      if (memo) {
        currentMemo.value = memo
      }
      return memo
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 搜索备忘录
   */
  async function searchMemos(userId: string, query: string) {
    isLoading.value = true
    error.value = null

    try {
      const result = await memoManager.searchMemos(userId, query)
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : '搜索备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 按标签筛选备忘录
   */
  async function getMemosByTag(userId: string, tag: string) {
    isLoading.value = true
    error.value = null

    try {
      const result = await memoManager.getMemosByTag(userId, tag)
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : '筛选备忘录失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 保存草稿
   */
  function saveDraft(content: string) {
    memoManager.saveDraft(content)
  }

  /**
   * 获取草稿
   */
  async function getDraft(): Promise<string | null> {
    return await memoManager.getDraft()
  }

  /**
   * 清除草稿
   */
  function clearDraft() {
    memoManager.clearDraft()
  }

  /**
   * 设置搜索查询
   */
  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  /**
   * 设置选中的标签
   */
  function setSelectedTags(tags: string[]) {
    selectedTags.value = tags
  }

  /**
   * 清除过滤器
   */
  function clearFilters() {
    searchQuery.value = ''
    selectedTags.value = []
  }

  /**
   * 清除错误
   */
  function clearError() {
    error.value = null
  }

  /**
   * 清空所有数据
   */
  function reset() {
    memos.value = []
    currentMemo.value = null
    searchQuery.value = ''
    selectedTags.value = []
    error.value = null
  }

  return {
    // 状态
    memos,
    currentMemo,
    isLoading,
    error,
    searchQuery,
    selectedTags,
    // 计算属性
    filteredMemos,
    allTags,
    memoCount,
    // 方法
    loadMemos,
    createMemo,
    updateMemo,
    deleteMemo,
    getMemo,
    searchMemos,
    getMemosByTag,
    saveDraft,
    getDraft,
    clearDraft,
    setSearchQuery,
    setSelectedTags,
    clearFilters,
    clearError,
    reset,
  }
})
