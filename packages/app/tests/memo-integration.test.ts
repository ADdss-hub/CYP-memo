/**
 * CYP-memo 备忘录界面集成测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 * 
 * 测试需求: 3, 4 - 备忘录管理和标签功能
 * 
 * 注意: 这些测试专注于 store 层面的集成测试，而不是完整的 UI 组件测试
 * 因为 MemoEditor 等复杂组件在测试环境中挂载较慢
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMemoStore } from '../src/stores/memo'
import { useAuthStore } from '../src/stores/auth'
import { db } from '@cyp-memo/shared'

describe('备忘录界面集成测试 - CRUD 流程', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let memoStore: ReturnType<typeof useMemoStore>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 获取 store 实例
    authStore = useAuthStore()
    memoStore = useMemoStore()

    // 注册并登录测试用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
  })

  it('应该成功完成创建备忘录流程', async () => {
    // 创建备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '测试备忘录标题',
      '<p>测试备忘录内容</p>',
      ['测试标签']
    )

    // 验证备忘录已创建
    expect(memoStore.memos.length).toBe(1)
    expect(memoStore.memos[0].title).toBe('测试备忘录标题')
    expect(memoStore.memos[0].content).toBe('<p>测试备忘录内容</p>')
    expect(memoStore.memos[0].tags).toContain('测试标签')
    expect(memo.userId).toBe(authStore.currentUser!.id)
  })

  it('应该成功完成查看备忘录流程', async () => {
    // 先创建一个备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '查看测试备忘录',
      '<p>这是备忘录内容</p>',
      ['标签1', '标签2']
    )

    // 获取备忘录详情
    const fetchedMemo = await memoStore.getMemo(memo.id)

    // 验证备忘录数据
    expect(fetchedMemo).not.toBeNull()
    expect(fetchedMemo!.title).toBe('查看测试备忘录')
    expect(fetchedMemo!.content).toBe('<p>这是备忘录内容</p>')
    expect(fetchedMemo!.tags).toEqual(['标签1', '标签2'])
    expect(memoStore.currentMemo).toEqual(fetchedMemo)
  })

  it('应该成功完成编辑备忘录流程', async () => {
    // 先创建一个备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '原始标题',
      '<p>原始内容</p>',
      ['原始标签']
    )

    // 更新备忘录
    const updatedMemo = await memoStore.updateMemo(
      memo.id,
      '修改后的标题',
      '<p>修改后的内容</p>',
      ['原始标签', '新标签']
    )

    // 验证备忘录已更新
    expect(updatedMemo.title).toBe('修改后的标题')
    expect(updatedMemo.content).toBe('<p>修改后的内容</p>')
    expect(updatedMemo.tags).toContain('新标签')
    expect(updatedMemo.tags).toContain('原始标签')
    
    // 验证 store 中的数据也已更新
    const storedMemo = memoStore.memos.find(m => m.id === memo.id)
    expect(storedMemo?.title).toBe('修改后的标题')
  })

  it('应该成功完成删除备忘录流程', async () => {
    // 先创建一个备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '待删除备忘录',
      '<p>待删除内容</p>',
      []
    )

    expect(memoStore.memos.length).toBe(1)

    // 删除备忘录
    await memoStore.deleteMemo(memo.id)

    // 验证备忘录已删除（getMemo 会抛出错误因为备忘录已被软删除）
    await expect(memoStore.getMemo(memo.id)).rejects.toThrow('备忘录已被删除')
    expect(memoStore.memos.length).toBe(0)
  })

  it('应该支持创建多个备忘录', async () => {
    // 创建多个备忘录
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录1',
      '<p>内容1</p>',
      ['标签A']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录2',
      '<p>内容2</p>',
      ['标签B']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录3',
      '<p>内容3</p>',
      ['标签A', '标签B']
    )

    // 验证所有备忘录都已创建
    expect(memoStore.memos.length).toBe(3)
    expect(memoStore.memoCount).toBe(3)
  })

  it('应该支持创建无标签的备忘录', async () => {
    // 创建无标签备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '无标签备忘录',
      '<p>无标签内容</p>',
      []
    )

    // 验证备忘录已创建且无标签
    expect(memo.tags).toEqual([])
    expect(memoStore.memos.length).toBe(1)
  })
})

describe('备忘录界面集成测试 - 搜索和筛选', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let memoStore: ReturnType<typeof useMemoStore>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 获取 store 实例
    authStore = useAuthStore()
    memoStore = useMemoStore()

    // 注册并登录测试用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })

    // 创建测试数据
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '前端开发笔记',
      '<p>Vue 3 和 TypeScript 的使用技巧</p>',
      ['前端', '开发']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '后端开发笔记',
      '<p>Node.js 和 Express 的最佳实践</p>',
      ['后端', '开发']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '数据库设计',
      '<p>IndexedDB 的使用方法</p>',
      ['数据库', '前端']
    )
  })

  it('应该能够按标题搜索备忘录', async () => {
    // 搜索 "前端"
    const results = await memoStore.searchMemos(authStore.currentUser!.id, '前端')

    // 验证搜索结果（只搜索标题中包含"前端"的）
    expect(results.length).toBe(1) // 只有 "前端开发笔记"
    expect(results[0].title).toBe('前端开发笔记')
  })

  it('应该能够按内容搜索备忘录', async () => {
    // 搜索 "TypeScript"
    const results = await memoStore.searchMemos(authStore.currentUser!.id, 'TypeScript')

    // 验证搜索结果
    expect(results.length).toBe(1) // 只有 "前端开发笔记"
    expect(results[0].title).toBe('前端开发笔记')
  })

  it('应该能够按标签筛选备忘录', async () => {
    // 按标签 "前端" 筛选
    const results = await memoStore.getMemosByTag(authStore.currentUser!.id, '前端')

    // 验证筛选结果
    expect(results.length).toBe(2) // "前端开发笔记" 和 "数据库设计"
    expect(results.every(m => m.tags.includes('前端'))).toBe(true)
  })

  it('应该能够使用 store 的筛选功能', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 设置搜索查询
    memoStore.setSearchQuery('开发')

    // 验证筛选结果
    const filtered = memoStore.filteredMemos
    expect(filtered.length).toBe(2) // "前端开发笔记" 和 "后端开发笔记"
  })

  it('应该能够同时使用搜索和标签筛选', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 设置搜索查询和标签筛选
    memoStore.setSearchQuery('开发')
    memoStore.setSelectedTags(['前端'])

    // 验证筛选结果（同时包含 "开发" 且有 "前端" 标签）
    const filtered = memoStore.filteredMemos
    expect(filtered.length).toBe(1) // 只有 "前端开发笔记"
    expect(filtered[0].title).toBe('前端开发笔记')
  })

  it('应该能够清除筛选条件', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 设置筛选条件
    memoStore.setSearchQuery('开发')
    memoStore.setSelectedTags(['前端'])

    // 验证筛选生效
    expect(memoStore.filteredMemos.length).toBe(1)

    // 清除筛选
    memoStore.clearFilters()

    // 验证所有备忘录都显示
    expect(memoStore.filteredMemos.length).toBe(3)
    expect(memoStore.searchQuery).toBe('')
    expect(memoStore.selectedTags.length).toBe(0)
  })

  it('应该在没有搜索结果时返回空数组', async () => {
    // 搜索不存在的内容
    const results = await memoStore.searchMemos(authStore.currentUser!.id, '不存在的内容')

    // 验证返回空数组
    expect(results.length).toBe(0)
  })

  it('应该显示所有可用标签', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 获取所有标签
    const tags = memoStore.allTags

    // 验证标签列表
    expect(tags.length).toBe(4) // '前端', '开发', '后端', '数据库'
    expect(tags).toContain('前端')
    expect(tags).toContain('后端')
    expect(tags).toContain('开发')
    expect(tags).toContain('数据库')
  })

  it('应该按标签名称排序', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 获取所有标签
    const tags = memoStore.allTags

    // 验证标签已排序
    const sortedTags = [...tags].sort()
    expect(tags).toEqual(sortedTags)
  })

  it('应该支持多标签筛选', async () => {
    // 加载所有备忘录
    await memoStore.loadMemos(authStore.currentUser!.id)

    // 设置多个标签筛选（需要同时包含两个标签）
    memoStore.setSelectedTags(['前端', '开发'])

    // 验证筛选结果
    const filtered = memoStore.filteredMemos
    expect(filtered.length).toBe(1) // 只有 "前端开发笔记" 同时包含两个标签
    expect(filtered[0].title).toBe('前端开发笔记')
  })
})

describe('备忘录界面集成测试 - 端到端流程', () => {
  let pinia: ReturnType<typeof createPinia>
  let authStore: ReturnType<typeof useAuthStore>
  let memoStore: ReturnType<typeof useMemoStore>

  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()

    // 创建新的 Pinia 实例
    pinia = createPinia()
    setActivePinia(pinia)

    // 获取 store 实例
    authStore = useAuthStore()
    memoStore = useMemoStore()

    // 注册并登录测试用户
    await authStore.registerWithPassword('testuser', 'Test1234', {
      question: '您的出生地是？',
      answerHash: 'hashedanswer'
    })
  })

  it('应该完成完整的创建-查看-编辑-删除流程', async () => {
    // 1. 创建备忘录
    const memo = await memoStore.createMemo(
      authStore.currentUser!.id,
      '完整流程测试',
      '<p>初始内容</p>',
      ['测试']
    )

    // 验证创建成功
    expect(memoStore.memos.length).toBe(1)
    expect(memo.title).toBe('完整流程测试')

    // 2. 查看备忘录
    const fetchedMemo = await memoStore.getMemo(memo.id)
    expect(fetchedMemo).not.toBeNull()
    expect(fetchedMemo!.title).toBe('完整流程测试')
    expect(fetchedMemo!.content).toBe('<p>初始内容</p>')

    // 3. 编辑备忘录
    const updatedMemo = await memoStore.updateMemo(
      memo.id,
      '修改后的标题',
      '<p>修改后的内容</p>',
      ['测试', '已修改']
    )
    expect(updatedMemo.title).toBe('修改后的标题')
    expect(updatedMemo.content).toBe('<p>修改后的内容</p>')
    expect(updatedMemo.tags).toContain('已修改')

    // 4. 删除备忘录
    await memoStore.deleteMemo(memo.id)
    expect(memoStore.memos.length).toBe(0)

    // 验证备忘录已被软删除（会抛出错误）
    await expect(memoStore.getMemo(memo.id)).rejects.toThrow('备忘录已被删除')
  })

  it('应该完成创建多个备忘录并搜索的流程', async () => {
    // 创建多个备忘录
    await memoStore.createMemo(
      authStore.currentUser!.id,
      'JavaScript 学习',
      '<p>ES6+ 新特性</p>',
      ['编程', 'JavaScript']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      'Python 学习',
      '<p>Python 基础语法</p>',
      ['编程', 'Python']
    )
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '算法笔记',
      '<p>排序算法总结</p>',
      ['算法']
    )

    // 验证所有备忘录都已创建
    expect(memoStore.memos.length).toBe(3)

    // 搜索 "学习"
    const searchResults = await memoStore.searchMemos(authStore.currentUser!.id, '学习')
    expect(searchResults.length).toBe(2)
    expect(searchResults.every(m => m.title.includes('学习'))).toBe(true)

    // 按标签筛选 "编程"
    const tagResults = await memoStore.getMemosByTag(authStore.currentUser!.id, '编程')
    expect(tagResults.length).toBe(2)
    expect(tagResults.every(m => m.tags.includes('编程'))).toBe(true)

    // 使用 store 的筛选功能
    await memoStore.loadMemos(authStore.currentUser!.id)
    memoStore.setSearchQuery('学习')
    memoStore.setSelectedTags(['编程'])
    
    const filtered = memoStore.filteredMemos
    expect(filtered.length).toBe(2) // JavaScript 学习 和 Python 学习
  })

  it('应该支持草稿保存和恢复', async () => {
    // 保存草稿
    const draftContent = '<p>这是一个草稿内容</p>'
    memoStore.saveDraft(draftContent)

    // 获取草稿
    const retrievedDraft = await memoStore.getDraft()
    expect(retrievedDraft).toBe(draftContent)

    // 清除草稿
    memoStore.clearDraft()
    const clearedDraft = await memoStore.getDraft()
    expect(clearedDraft).toBeNull()
  })

  it('应该支持批量操作', async () => {
    // 创建多个备忘录
    const memo1 = await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录1',
      '<p>内容1</p>',
      ['标签A']
    )
    const memo2 = await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录2',
      '<p>内容2</p>',
      ['标签B']
    )
    const memo3 = await memoStore.createMemo(
      authStore.currentUser!.id,
      '备忘录3',
      '<p>内容3</p>',
      ['标签A']
    )

    expect(memoStore.memos.length).toBe(3)

    // 批量删除
    await memoStore.deleteMemo(memo1.id)
    await memoStore.deleteMemo(memo2.id)

    expect(memoStore.memos.length).toBe(1)
    expect(memoStore.memos[0].id).toBe(memo3.id)
  })

  it('应该正确处理错误状态', async () => {
    // 尝试获取不存在的备忘录应该抛出错误
    await expect(
      memoStore.getMemo('non-existent-id')
    ).rejects.toThrow('备忘录不存在')

    // 尝试更新不存在的备忘录应该抛出错误
    await expect(
      memoStore.updateMemo('non-existent-id', '标题', '<p>内容</p>', [])
    ).rejects.toThrow()

    // 尝试删除不存在的备忘录应该抛出错误
    await expect(
      memoStore.deleteMemo('non-existent-id')
    ).rejects.toThrow()
  })

  it('应该支持重置 store 状态', async () => {
    // 创建一些数据
    await memoStore.createMemo(
      authStore.currentUser!.id,
      '测试备忘录',
      '<p>测试内容</p>',
      ['测试']
    )
    memoStore.setSearchQuery('测试')
    memoStore.setSelectedTags(['测试'])

    expect(memoStore.memos.length).toBe(1)
    expect(memoStore.searchQuery).toBe('测试')
    expect(memoStore.selectedTags.length).toBe(1)

    // 重置 store
    memoStore.reset()

    // 验证所有状态已清空
    expect(memoStore.memos.length).toBe(0)
    expect(memoStore.currentMemo).toBeNull()
    expect(memoStore.searchQuery).toBe('')
    expect(memoStore.selectedTags.length).toBe(0)
    expect(memoStore.error).toBeNull()
  })
})
