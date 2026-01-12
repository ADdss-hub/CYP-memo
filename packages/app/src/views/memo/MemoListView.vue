<!--
  备忘录列表页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="memo-list-view">
      <!-- 顶部搜索栏 -->
      <div class="search-bar">
        <div class="search-input-wrapper">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索备忘录..."
            @input="handleSearch"
          />
          <span class="search-icon">🔍</span>
        </div>
        <div class="sort-wrapper">
          <select v-model="sortBy" class="sort-select">
            <option value="updatedAt">按更新时间</option>
            <option value="createdAt">按创建时间</option>
            <option value="title">按标题</option>
          </select>
          <button class="sort-order-btn" @click="toggleSortOrder" :title="sortOrder === 'desc' ? '降序' : '升序'">
            {{ sortOrder === 'desc' ? '↓' : '↑' }}
          </button>
        </div>
        <Button type="primary" @click="handleCreate"> ✏️ 新建备忘录 </Button>
      </div>

      <!-- 主内容区 -->
      <div class="content-wrapper">
        <!-- 侧边栏 - 标签筛选 -->
        <aside class="sidebar">
          <div class="sidebar-section">
            <h3 class="sidebar-title">标签筛选</h3>
            <div class="tag-list">
              <button
                v-for="tag in allTags"
                :key="tag"
                :class="['tag-item', { active: selectedTags.includes(tag) }]"
                @click="toggleTag(tag)"
              >
                {{ tag }}
                <span class="tag-count">{{ getTagCount(tag) }}</span>
              </button>
              <div v-if="allTags.length === 0" class="empty-tags">暂无标签</div>
            </div>
            <Button
              v-if="selectedTags.length > 0"
              type="text"
              class="clear-filter-btn"
              @click="clearFilters"
            >
              清除筛选
            </Button>
          </div>
        </aside>

        <!-- 备忘录列表 -->
        <main class="main-content">
          <Loading v-if="isLoading" />

          <div v-else-if="error" class="error-message">
            <p>{{ error }}</p>
            <Button type="primary" @click="loadData"> 重试 </Button>
          </div>

          <div v-else-if="displayedMemos.length === 0" class="empty-state">
            <div class="empty-icon">📝</div>
            <p class="empty-text">
              {{
                searchQuery || selectedTags.length > 0
                  ? '没有找到匹配的备忘录'
                  : '还没有备忘录，点击上方按钮创建第一个吧！'
              }}
            </p>
          </div>

          <div v-else class="memo-grid">
            <!-- 虚拟滚动容器 -->
            <div ref="scrollContainer" class="scroll-container" @scroll="handleScroll">
              <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
                <div
                  v-for="memo in visibleMemos"
                  :key="memo.id"
                  :style="{
                    position: 'absolute',
                    top: `${memo.top}px`,
                    left: 0,
                    right: 0,
                  }"
                  class="memo-card-wrapper"
                >
                  <div class="memo-card" @click="handleView(memo.id)">
                    <div class="memo-header">
                      <h3 class="memo-title">
                        {{ memo.title || '无标题' }}
                      </h3>
                      <div class="memo-actions">
                        <button class="action-btn" title="编辑" @click.stop="handleEdit(memo.id)">
                          ✏️
                        </button>
                        <button class="action-btn" title="删除" @click.stop="handleDelete(memo.id)">
                          🗑️
                        </button>
                      </div>
                    </div>

                    <div class="memo-content">
                      {{ getExcerpt(memo.content) }}
                    </div>

                    <div class="memo-footer">
                      <div class="memo-tags">
                        <span v-for="tag in memo.tags" :key="tag" class="tag">
                          {{ tag }}
                        </span>
                      </div>
                      <div class="memo-meta">
                        <span v-if="memo.creatorName" class="memo-creator">
                          {{ memo.creatorName }}
                        </span>
                        <span class="memo-date">
                          {{ formatDate(memo.updatedAt) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMemoStore } from '../../stores/memo'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading } from '../../components'
import type { Memo } from '@cyp-memo/shared'

const router = useRouter()
const memoStore = useMemoStore()
const authStore = useAuthStore()
const toast = useToast()

// 状态
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const scrollContainer = ref<HTMLElement>()
const sortBy = ref<'updatedAt' | 'createdAt' | 'title'>('updatedAt')
const sortOrder = ref<'asc' | 'desc'>('desc')

// 虚拟滚动相关
const CARD_HEIGHT = 216 // 每个卡片的高度（包括间距）
const BUFFER_SIZE = 3 // 缓冲区大小（上下各显示几个额外的项）
const scrollTop = ref(0)

// 计算属性
const { isLoading, error, memos, allTags } = memoStore

const displayedMemos = computed(() => {
  let result = memos

  // 按搜索查询过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (memo) =>
        memo.title.toLowerCase().includes(query) || memo.content.toLowerCase().includes(query)
    )
  }

  // 按标签过滤
  if (selectedTags.value.length > 0) {
    result = result.filter((memo) => selectedTags.value.every((tag) => memo.tags.includes(tag)))
  }

  // 排序
  return result.sort((a, b) => {
    let comparison = 0
    if (sortBy.value === 'title') {
      comparison = a.title.localeCompare(b.title, 'zh-CN')
    } else if (sortBy.value === 'createdAt') {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    } else {
      comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    }
    return sortOrder.value === 'desc' ? -comparison : comparison
  })
})

// 虚拟滚动计算
const totalHeight = computed(() => displayedMemos.value.length * CARD_HEIGHT)

const visibleRange = computed(() => {
  const containerHeight = scrollContainer.value?.clientHeight || 600
  const startIndex = Math.max(0, Math.floor(scrollTop.value / CARD_HEIGHT) - BUFFER_SIZE)
  const endIndex = Math.min(
    displayedMemos.value.length,
    Math.ceil((scrollTop.value + containerHeight) / CARD_HEIGHT) + BUFFER_SIZE
  )
  return { startIndex, endIndex }
})

const visibleMemos = computed(() => {
  const { startIndex, endIndex } = visibleRange.value
  return displayedMemos.value.slice(startIndex, endIndex).map((memo, index) => ({
    ...memo,
    top: (startIndex + index) * CARD_HEIGHT,
  }))
})

// 方法
const loadData = async () => {
  try {
    if (!authStore.currentUser) {
      toast.error('请先登录')
      router.push('/login')
      return
    }
    await memoStore.loadMemos(authStore.currentUser.id)
  } catch (err) {
    console.error('加载备忘录失败:', err)
    toast.error('加载备忘录失败')
  }
}

const handleSearch = () => {
  // 搜索已通过 computed 自动处理
}

const toggleTag = (tag: string) => {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedTags.value = []
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

const getTagCount = (tag: string) => {
  return memos.filter((memo) => memo.tags.includes(tag)).length
}

const getExcerpt = (content: string): string => {
  // 移除 HTML 标签，但保留换行
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')  // 将 <br> 转换为换行
    .replace(/<\/p>/gi, '\n')        // 将 </p> 转换为换行
    .replace(/<\/div>/gi, '\n')      // 将 </div> 转换为换行
    .replace(/<[^>]*>/g, '')         // 移除其他 HTML 标签
  
  // 解码 HTML 实体
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  text = textarea.value
  
  // 清理多余的连续换行，但保留单个换行
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  
  // 限制长度
  return text.length > 150 ? text.substring(0, 150) + '...' : text
}

const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  // 小于 1 分钟
  if (diff < 60000) {
    return '刚刚'
  }
  // 小于 1 小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`
  }
  // 小于 1 天
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`
  }
  // 小于 7 天
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)} 天前`
  }

  // 格式化为日期
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const handleCreate = () => {
  router.push('/memos/new')
}

const handleView = (id: string) => {
  router.push(`/memos/${id}`)
}

const handleEdit = (id: string) => {
  router.push(`/memos/${id}/edit`)
}

const handleDelete = async (id: string) => {
  if (!confirm('确定要删除这个备忘录吗？')) {
    return
  }

  try {
    await memoStore.deleteMemo(id)
    toast.success('删除成功')
  } catch (err) {
    console.error('删除备忘录失败:', err)
    toast.error('删除失败')
  }
}

const handleScroll = () => {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop
  }
}

// 生命周期
onMounted(async () => {
  await loadData()

  // 初始化滚动位置
  await nextTick()
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop
  }
})

// 监听路由变化，重新加载数据
watch(
  () => router.currentRoute.value.query.refresh,
  async (newVal) => {
    if (newVal) {
      await loadData()
    }
  }
)

// 监听用户登录状态变化，登录后立即加载数据
watch(
  () => authStore.currentUser,
  async (newUser, oldUser) => {
    // 用户从未登录变为已登录时，立即加载备忘录
    if (newUser && !oldUser) {
      await loadData()
    }
  },
  { immediate: false }
)
</script>

<style scoped>
.memo-list-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-bar {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
  align-items: center;
  flex-wrap: wrap;
}

.search-input-wrapper {
  flex: 1;
  position: relative;
  min-width: 200px;
  max-width: 600px;
}

.sort-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-select {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  color: #606266;
  background: white;
  cursor: pointer;
}

.sort-select:focus {
  outline: none;
  border-color: #409eff;
}

.sort-order-btn {
  width: 36px;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-order-btn:hover {
  border-color: #409eff;
  color: #409eff;
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 40px 0 16px;
  border: 1px solid #dcdfe6;
  border-radius: 20px;
  font-size: 14px;
  transition: all 0.3s;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.search-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #909399;
}

.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  background: white;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  padding: 20px;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f7fa;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #606266;
  transition: all 0.2s;
  text-align: left;
}

.tag-item:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.tag-item.active {
  background: #409eff;
  color: white;
}

.tag-count {
  font-size: 12px;
  opacity: 0.7;
}

.empty-tags {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

.clear-filter-btn {
  width: 100%;
  margin-top: 12px;
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: #f5f7fa;
}

.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: #f56c6c;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
}

.memo-grid {
  height: 100%;
  overflow: hidden;
}

.scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}

.memo-card-wrapper {
  padding-bottom: 16px;
}

.memo-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.3s;
  height: 200px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.memo-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.memo-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.memo-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: calc(100% - 80px);
}

.memo-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.memo-card:hover .memo-actions {
  opacity: 1;
}

.action-btn {
  width: 32px;
  height: 32px;
  background: #f5f7fa;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: #ecf5ff;
  transform: scale(1.1);
}

.memo-content {
  flex: 1;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  margin-bottom: 12px;
  word-break: break-word;
  white-space: pre-wrap;
  min-height: 0;
  max-height: 72px;
}

.memo-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.memo-tags {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  flex: 1;
  overflow: hidden;
  max-width: 55%;
}

.tag {
  padding: 2px 8px;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 4px;
  font-size: 12px;
}

.memo-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.memo-creator {
  font-size: 12px;
  color: #409eff;
  padding: 2px 8px;
  background: #ecf5ff;
  border-radius: 4px;
}

.memo-date {
  font-size: 12px;
  color: #909399;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .content-wrapper {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e4e7ed;
    max-height: 200px;
  }

  .search-bar {
    flex-direction: column;
  }

  .search-input-wrapper {
    max-width: 100%;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .search-bar,
[data-theme='dark'] .sidebar,
[data-theme='dark'] .memo-card {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] .main-content {
  background: #141414;
}

[data-theme='dark'] .search-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .sidebar-title,
[data-theme='dark'] .memo-title {
  color: #cfd3dc;
}

[data-theme='dark'] .tag-item {
  background: #262727;
  color: #cfd3dc;
}

[data-theme='dark'] .tag-item:hover {
  background: #337ecc;
}

[data-theme='dark'] .memo-content {
  color: #a8abb2;
}

[data-theme='dark'] .action-btn {
  background: #262727;
}

[data-theme='dark'] .action-btn:hover {
  background: #337ecc;
}

[data-theme='dark'] .memo-footer {
  border-top-color: #414243;
}

[data-theme='dark'] .tag {
  background: #337ecc;
  color: white;
}

[data-theme='dark'] .memo-creator {
  background: #337ecc;
  color: white;
}
</style>
