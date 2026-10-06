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
          <el-icon class="search-icon" :size="16"><Search /></el-icon>
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
        <Button type="primary" @click="handleCreate">
          <el-icon class="btn-leading-icon"><Plus /></el-icon>
          新建备忘录
        </Button>
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
            <div class="empty-icon"></div>
            <p class="empty-text">
              {{
                searchQuery || selectedTags.length > 0
                  ? '没有找到匹配的备忘录'
                  : '还没有备忘录，点击上方按钮创建第一个吧！'
              }}
            </p>
          </div>

          <div v-else class="memo-list">
            <article
              v-for="memo in displayedMemos"
              :key="memo.id"
              class="memo-card"
              @click="handleView(memo.id)"
            >
              <header class="memo-header">
                <h3 class="memo-title">{{ memo.title || '无标题' }}</h3>
                <div class="memo-actions" @click.stop>
                  <button
                    type="button"
                    class="action-btn"
                    title="编辑备忘录"
                    @click="handleEdit(memo.id)"
                  >
                    <el-icon :size="14"><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button
                    type="button"
                    class="action-btn action-btn-danger"
                    title="删除备忘录"
                    @click="handleDelete(memo.id)"
                  >
                    <el-icon :size="14"><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </div>
              </header>

              <p class="memo-content">{{ getExcerpt(memo.content) }}</p>

              <footer class="memo-footer">
                <div class="memo-tags">
                  <span v-for="tag in memo.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
                <div class="memo-meta">
                  <span class="memo-creator" :title="`创建人：${memo.creatorName || '未知用户'}`">
                    {{ memo.creatorName || '未知用户' }}
                  </span>
                  <span class="memo-date" :title="formatFullDate(memo.createdAt)">
                    创建 {{ formatDate(memo.createdAt) }}
                  </span>
                  <span
                    v-if="hasBeenUpdated(memo)"
                    class="memo-date"
                    :title="formatFullDate(memo.updatedAt)"
                  >
                    更新 {{ formatDate(memo.updatedAt) }}
                  </span>
                </div>
              </footer>
            </article>
            <div v-if="filteredTotal > 0" class="list-pager">
              <p class="list-pager-meta">已显示 {{ displayedMemos.length }} / {{ filteredTotal }}</p>
              <Button
                v-if="hasMoreMemos"
                type="secondary"
                class="load-more-btn"
                @click="loadMoreMemos"
              >
                加载更多
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useMemoStore } from '../../stores/memo'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading } from '../../components'
import { Plus, EditPen, Delete, Search } from '@element-plus/icons-vue'
import type { Memo } from '@cyp-memo/shared'

const router = useRouter()
const memoStore = useMemoStore()
const authStore = useAuthStore()
const toast = useToast()

// 状态
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const sortBy = ref<'updatedAt' | 'createdAt' | 'title'>('updatedAt')
const sortOrder = ref<'asc' | 'desc'>('desc')
/** 列表窗口分页：避免大库一次挂满 DOM（R-008 体感） */
const LIST_PAGE_SIZE = 50
const visibleCount = ref(LIST_PAGE_SIZE)

// 必须用 storeToRefs：直接解构会丢掉响应式，登录后 loadMemos 写库不刷新列表
const { isLoading, error, memos, allTags } = storeToRefs(memoStore)

const filteredSortedMemos = computed(() => {
  let result = [...memos.value]

  // 按搜索查询过滤（列表正文已投影截断；深搜请用服务端 search，此处匹配标题/标签/摘要）
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (memo) =>
        memo.title.toLowerCase().includes(query) ||
        memo.content.toLowerCase().includes(query) ||
        memo.tags.some((t) => t.toLowerCase().includes(query))
    )
  }

  // 按标签过滤
  if (selectedTags.value.length > 0) {
    result = result.filter((memo) => selectedTags.value.every((tag) => memo.tags.includes(tag)))
  }

  // 排序（拷贝后再 sort，避免原地改写 store 数组）
  return result.sort((a, b) => {
    let comparison = 0
    if (sortBy.value === 'title') {
      comparison = a.title.localeCompare(b.title, 'zh-CN')
    } else if (sortBy.value === 'createdAt') {
      const at = typeof a.createdAt === 'number' ? a.createdAt : +new Date(a.createdAt)
      const bt = typeof b.createdAt === 'number' ? b.createdAt : +new Date(b.createdAt)
      comparison = at - bt
    } else {
      const at = typeof a.updatedAt === 'number' ? a.updatedAt : +new Date(a.updatedAt)
      const bt = typeof b.updatedAt === 'number' ? b.updatedAt : +new Date(b.updatedAt)
      comparison = at - bt
    }
    return sortOrder.value === 'desc' ? -comparison : comparison
  })
})

const filteredTotal = computed(() => filteredSortedMemos.value.length)
const displayedMemos = computed(() => filteredSortedMemos.value.slice(0, visibleCount.value))
const hasMoreMemos = computed(() => filteredTotal.value > visibleCount.value)

watch([searchQuery, selectedTags, sortBy, sortOrder], () => {
  visibleCount.value = LIST_PAGE_SIZE
})

const loadMoreMemos = () => {
  visibleCount.value = Math.min(visibleCount.value + LIST_PAGE_SIZE, filteredTotal.value)
}

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
  visibleCount.value = LIST_PAGE_SIZE
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

const tagCountMap = computed(() => {
  const map = new Map<string, number>()
  for (const memo of memos.value) {
    for (const tag of memo.tags) {
      map.set(tag, (map.get(tag) || 0) + 1)
    }
  }
  return map
})

const getTagCount = (tag: string) => tagCountMap.value.get(tag) || 0

const getExcerpt = (content: string): string => {
  // 移除 HTML 标签，但保留换行
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')  // 将 <br> 转换为换行
    .replace(/<\/p>/gi, '\n')        // 将 </p> 转换为换行
    .replace(/<\/div>/gi, '\n')      // 将 </div> 转换为换行
    .replace(/<[^>]*>/g, '')         // 移除其他 HTML 标签
  
  // 解码 HTML 实体（禁 DOM 注入属性）
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
  
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

const formatFullDate = (date: Date | string): string => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

const hasBeenUpdated = (memo: Memo): boolean => {
  const created = new Date(memo.createdAt).getTime()
  const updated = new Date(memo.updatedAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(updated)) return false
  return Math.abs(updated - created) > 1000
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

// 生命周期
onMounted(async () => {
  await loadData()
})

// 监听路由变化，重新加载数据
watch(
  () => router.currentRoute.value.query.refresh,
  async (newVal, oldVal) => {
    // 当 refresh 参数变化时（包括从无到有），重新加载数据
    if (newVal && newVal !== oldVal) {
      await loadData()
      // 清除 URL 中的 refresh 参数，避免刷新页面时重复加载
      if (router.currentRoute.value.query.refresh) {
        router.replace({ path: router.currentRoute.value.path })
      }
    }
  },
  { immediate: true }
)

// 监听用户登录状态变化，登录后立即加载数据
watch(
  () => authStore.currentUser,
  async (newUser, oldUser) => {
    // 用户从未登录变为已登录时，立即加载备忘录
    if (newUser && !oldUser) {
      // 使用 nextTick 确保 DOM 更新后再加载数据
      await nextTick()
      await loadData()
    }
  }
)
</script>

<style scoped>
.memo-list-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.search-bar {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  background: var(--cyp-chrome-bg);
  border-bottom: 1px solid var(--cyp-chrome-border);
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
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
  border: 1px solid var(--cyp-border);
  border-radius: 4px;
  font-size: 14px;
  color: var(--cyp-text-secondary);
  background: var(--cyp-bg-input);
  cursor: pointer;
}

.sort-select:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.sort-order-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--cyp-border);
  border-radius: 4px;
  background: var(--cyp-bg-input);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-order-btn:hover {
  border-color: var(--cyp-brand);
  color: var(--cyp-brand);
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 40px 0 16px;
  border: 1px solid var(--cyp-border);
  border-radius: 20px;
  font-size: 14px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  transition: all 0.3s;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 2px rgba(0, 153, 255, 0.1);
}

.search-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--cyp-text-muted);
}

.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  background: var(--cyp-chrome-bg-soft);
  border-right: 1px solid var(--cyp-chrome-border);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  overflow-y: auto;
  padding: 20px;
  flex-shrink: 0;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-text);
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
  background: color-mix(in srgb, var(--cyp-bg-input) 70%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-border) 70%, transparent);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--cyp-text-secondary);
  transition: all 0.2s;
  text-align: left;
}

.tag-item:hover {
  background: rgba(0, 153, 255, 0.12);
  border-color: var(--cyp-brand);
  color: var(--cyp-brand);
}

.tag-item.active {
  background: var(--cyp-brand);
  color: #ffffff;
}

.tag-count {
  font-size: 12px;
  opacity: 0.7;
}

.empty-tags {
  padding: 20px;
  text-align: center;
  color: var(--cyp-text-muted);
  font-size: 14px;
}

.clear-filter-btn {
  width: 100%;
  margin-top: 12px;
}

.main-content {
  flex: 1;
  overflow: hidden;
  background: var(--cyp-chrome-bg-soft);
  backdrop-filter: blur(calc(var(--cyp-chrome-blur) - 4px));
  -webkit-backdrop-filter: blur(calc(var(--cyp-chrome-blur) - 4px));
}

.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--cyp-danger);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cyp-text-muted);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
}

.memo-list {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.list-pager {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0 4px;
}

.list-pager-meta {
  margin: 0;
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.load-more-btn {
  min-width: 140px;
}

.memo-card {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: var(--cyp-chrome-shadow), 0 6px 18px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}

.memo-card:hover {
  box-shadow: var(--cyp-chrome-shadow), 0 10px 28px rgba(0, 0, 0, 0.28);
  border-color: color-mix(in srgb, var(--cyp-brand) 45%, var(--cyp-border));
  transform: translateY(-1px);
}

.memo-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.memo-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.memo-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  height: 28px;
  padding: 0 10px;
  background: var(--cyp-bg-muted);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--cyp-text-secondary);
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.action-btn:hover {
  background: rgba(0, 153, 255, 0.12);
  color: var(--cyp-brand, var(--cyp-brand));
  border-color: rgba(0, 153, 255, 0.25);
}

.action-btn-danger:hover {
  background: rgba(245, 108, 108, 0.12);
  color: var(--cyp-danger);
  border-color: rgba(245, 108, 108, 0.25);
}

.btn-leading-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.memo-content {
  margin: 0;
  color: var(--cyp-text-secondary);
  font-size: 14px;
  line-height: 1.65;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
  white-space: pre-wrap;
}

.memo-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--cyp-border);
  gap: 12px;
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
  background: rgba(0, 153, 255, 0.12);
  color: var(--cyp-brand);
  border-radius: 4px;
  font-size: 12px;
}

.memo-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 60%;
}

.memo-creator {
  font-size: 12px;
  color: var(--cyp-brand);
  padding: 2px 8px;
  background: rgba(0, 153, 255, 0.12);
  border-radius: 4px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memo-date {
  font-size: 12px;
  color: var(--cyp-text-muted);
  white-space: nowrap;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .content-wrapper {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--cyp-border);
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
</style>
