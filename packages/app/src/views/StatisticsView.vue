<!--
  数据统计界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <template #sidebar>
      <el-menu :default-active="activeMenu" class="sidebar-menu">
        <el-menu-item index="overview" @click="scrollToSection('overview')">
          <el-icon><DataAnalysis /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="trends" @click="scrollToSection('trends')">
          <el-icon><TrendCharts /></el-icon>
          <span>趋势图</span>
        </el-menu-item>
        <el-menu-item index="tags" @click="scrollToSection('tags')">
          <el-icon><CollectionTag /></el-icon>
          <span>标签排行</span>
        </el-menu-item>
        <el-menu-item index="storage" @click="scrollToSection('storage')">
          <el-icon><FolderOpened /></el-icon>
          <span>存储使用</span>
        </el-menu-item>
      </el-menu>
    </template>

    <div class="statistics-view">
      <div class="page-header">
        <Button type="text" @click="handleBack">
          <span class="back-icon">←</span> 返回
        </Button>
        <h1 class="page-title">数据统计</h1>
      </div>

      <!-- 概览统计卡片 -->
      <section id="overview" class="stats-section">
        <h2 class="section-title">概览</h2>
        <div class="stats-cards">
          <el-card class="stat-card" shadow="hover" @click="goToMemos">
            <div class="stat-icon memo-icon">
              <el-icon><Document /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">备忘录总数</div>
              <div class="stat-value">
                {{ statistics.memoCount }}
              </div>
            </div>
          </el-card>

          <el-card class="stat-card" shadow="hover" @click="goToMemos">
            <div class="stat-icon tag-icon">
              <el-icon><CollectionTag /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">标签总数</div>
              <div class="stat-value">
                {{ statistics.tagCount }}
              </div>
            </div>
          </el-card>

          <el-card class="stat-card" shadow="hover" @click="goToAttachments">
            <div class="stat-icon file-icon">
              <el-icon><Paperclip /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">文件总数</div>
              <div class="stat-value">
                {{ statistics.attachmentCount }}
              </div>
            </div>
          </el-card>

          <el-card class="stat-card" shadow="hover" @click="goToAttachments">
            <div class="stat-icon storage-icon">
              <el-icon><FolderOpened /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-label">文件库存储空间</div>
              <div class="stat-value">
                {{ formatFileSize(statistics.attachmentSize) }}
              </div>
            </div>
          </el-card>
        </div>
      </section>

      <!-- 趋势图 -->
      <section id="trends" class="stats-section">
        <h2 class="section-title">最近 7 天创建趋势</h2>
        <el-card shadow="hover">
          <div class="chart-container">
            <Line :data="trendChartData" :options="trendChartOptions" />
          </div>
        </el-card>
      </section>

      <!-- 标签排行 -->
      <section id="tags" class="stats-section">
        <h2 class="section-title">标签使用排行</h2>
        <el-card shadow="hover">
          <div v-if="statistics.tagRanking.length > 0" class="tag-ranking">
            <div
              v-for="(item, index) in statistics.tagRanking"
              :key="item.tag"
              class="tag-rank-item"
              @click="goToMemosWithTag(item.tag)"
            >
              <div class="rank-number" :class="getRankClass(index)">
                {{ index + 1 }}
              </div>
              <div class="tag-info">
                <div class="tag-name">
                  {{ item.tag }}
                </div>
                <div class="tag-count">{{ item.count }} 个备忘录</div>
              </div>
              <div class="tag-bar">
                <div class="tag-bar-fill" :style="{ width: getTagBarWidth(item.count) }" />
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无标签数据" />
        </el-card>
      </section>

      <!-- 系统存储空间 + 文件库存储空间（R-010 分称） -->
      <section id="storage" class="stats-section">
        <h2 class="section-title">存储使用情况</h2>
        <el-card shadow="hover">
          <div class="storage-info">
            <div class="storage-chart">
              <Doughnut :data="storageChartData" :options="storageChartOptions" />
            </div>
            <div class="storage-details">
              <div class="storage-item">
                <span class="storage-label">文件库存储空间:</span>
                <span class="storage-value">{{ formatFileSize(statistics.attachmentSize) }}</span>
              </div>
              <div class="storage-item">
                <span class="storage-label">系统存储空间已用:</span>
                <span class="storage-value">{{ formatFileSize(statistics.storageUsed) }}</span>
              </div>
              <div class="storage-item">
                <span class="storage-label">系统存储空间可用:</span>
                <span class="storage-value">{{ formatFileSize(statistics.storageAvailable) }}</span>
              </div>
              <div class="storage-item">
                <span class="storage-label">系统存储空间总量:</span>
                <span class="storage-value">{{ formatFileSize(statistics.storageTotal) }}</span>
              </div>
              <div class="storage-progress">
                <el-progress
                  :percentage="storagePercentage"
                  :color="getStorageColor(storagePercentage)"
                  :stroke-width="12"
                  :aria-label="`系统存储空间已用 ${storagePercentage}%`"
                />
              </div>
            </div>
          </div>
        </el-card>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { memoManager, fileManager } from '@cyp-memo/shared'
import { formatFileSize } from '@cyp-memo/shared'
import AppLayout from '../components/AppLayout.vue'
import Button from '../components/Button.vue'
import {
  Document,
  CollectionTag,
  Paperclip,
  FolderOpened,
  DataAnalysis,
  TrendCharts,
} from '@element-plus/icons-vue'
import { Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const router = useRouter()
const authStore = useAuthStore()
const activeMenu = ref('overview')

// 统计数据
interface Statistics {
  memoCount: number
  tagCount: number
  attachmentCount: number
  attachmentSize: number
  storageUsed: number
  storageAvailable: number
  storageTotal: number
  tagRanking: Array<{ tag: string; count: number }>
  trendData: Array<{ date: string; count: number }>
}

const statistics = ref<Statistics>({
  memoCount: 0,
  tagCount: 0,
  attachmentCount: 0,
  attachmentSize: 0,
  storageUsed: 0,
  storageAvailable: 0,
  storageTotal: 0,
  tagRanking: [],
  trendData: [],
})

// 存储使用百分比
const storagePercentage = computed(() => {
  if (statistics.value.storageTotal === 0) return 0
  return Math.round((statistics.value.storageUsed / statistics.value.storageTotal) * 100)
})

// 趋势图数据
const trendChartData = computed(() => {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  const brand = root
    ? getComputedStyle(root).getPropertyValue('--cyp-brand').trim() || 'var(--cyp-brand)'
    : 'var(--cyp-brand)'
  const tint = root
    ? getComputedStyle(root).getPropertyValue('--cyp-brand-tint').trim() || 'rgba(0, 153, 255, 0.16)'
    : 'rgba(0, 153, 255, 0.16)'
  return {
    labels: statistics.value.trendData.map((item) => item.date),
    datasets: [
      {
        label: '创建数量',
        data: statistics.value.trendData.map((item) => item.count),
        borderColor: brand,
        backgroundColor: tint,
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

// 趋势图配置
const trendChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        stepSize: 1,
      },
    },
  },
}

// 存储空间图表数据
const storageChartData = computed(() => {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  const brand = root
    ? getComputedStyle(root).getPropertyValue('--cyp-brand').trim() || 'var(--cyp-brand)'
    : 'var(--cyp-brand)'
  const muted = root
    ? getComputedStyle(root).getPropertyValue('--cyp-border').trim() || '#3a3a3a'
    : '#3a3a3a'
  return {
    labels: ['系统已用', '系统可用'],
    datasets: [
      {
        data: [statistics.value.storageUsed, statistics.value.storageAvailable],
        backgroundColor: [brand, muted],
        borderWidth: 0,
      },
    ],
  }
})

// 系统存储空间图表配置
const storageChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const label = context.label || ''
          const value = formatFileSize(context.parsed)
          return `${label}: ${value}`
        },
      },
    },
  },
}

/**
 * 加载统计数据
 */
async function loadStatistics() {
  if (!authStore.currentUser) return

  try {
    const userId = authStore.currentUser.id
    // 并行拉取，缩短统计页首屏墙钟（业界 Promise.all 独立请求）
    const [memos, allTags, files, storageInfo] = await Promise.all([
      memoManager.getAllMemos(userId),
      memoManager.getAllTags(userId),
      fileManager.getAllFiles(userId),
      fileManager.getStorageUsage(userId),
    ])
    statistics.value.memoCount = memos.length
    statistics.value.tagCount = allTags.length

    // 计算标签排行
    const tagCountMap = new Map<string, number>()
    memos.forEach((memo) => {
      memo.tags.forEach((tag) => {
        tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1)
      })
    })
    statistics.value.tagRanking = Array.from(tagCountMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // 只显示前 10 个

    // 计算最近 7 天的趋势数据
    const today = new Date()
    const trendData: Array<{ date: string; count: number }> = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`

      const count = memos.filter((memo) => {
        const memoDate = new Date(memo.createdAt)
        return (
          memoDate.getFullYear() === date.getFullYear() &&
          memoDate.getMonth() === date.getMonth() &&
          memoDate.getDate() === date.getDate()
        )
      }).length

      trendData.push({ date: dateStr, count })
    }
    statistics.value.trendData = trendData

    statistics.value.attachmentCount = files.length
    statistics.value.attachmentSize = files.reduce((sum, file) => sum + file.size, 0)

    // 系统存储空间 = used/total/available；文件库存储空间 = accountUsed（R-010 分称）
    statistics.value.storageUsed = storageInfo.used
    statistics.value.storageAvailable = storageInfo.available
    statistics.value.storageTotal = storageInfo.total
    if (typeof storageInfo.accountUsed === 'number') {
      statistics.value.attachmentSize = storageInfo.accountUsed
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

/**
 * 获取排名样式类
 */
function getRankClass(index: number): string {
  if (index === 0) return 'rank-gold'
  if (index === 1) return 'rank-silver'
  if (index === 2) return 'rank-bronze'
  return ''
}

/**
 * 获取标签条宽度
 */
function getTagBarWidth(count: number): string {
  const maxCount = Math.max(...statistics.value.tagRanking.map((item) => item.count))
  return `${(count / maxCount) * 100}%`
}

/**
 * 获取存储空间颜色
 */
function getStorageColor(percentage: number): string {
  if (percentage < 50) return 'var(--cyp-success)'
  if (percentage < 80) return 'var(--cyp-warning)'
  return 'var(--cyp-danger)'
}

/**
 * 滚动到指定区域
 */
function scrollToSection(section: string) {
  activeMenu.value = section
  const element = document.getElementById(section)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * 跳转到备忘录列表
 */
function goToMemos() {
  router.push('/memos')
}

/**
 * 跳转到附件管理
 */
function goToAttachments() {
  router.push('/attachments')
}

/**
 * 跳转到带标签筛选的备忘录列表
 */
function goToMemosWithTag(tag: string) {
  router.push({
    path: '/memos',
    query: { tag },
  })
}

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

onMounted(() => {
  loadStatistics()
})
</script>

<style scoped>
.statistics-view {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
}

.stats-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 16px 0;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--cyp-text);
}

.memo-icon {
  background: var(--cyp-bg-muted);
}

.tag-icon {
  background: var(--cyp-brand);
}

.file-icon {
  background: var(--cyp-brand-soft);
}

.storage-icon {
  background: var(--cyp-success);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--cyp-text);
}

/* 图表区域 */
.chart-container {
  height: 300px;
  padding: 16px;
}

/* 标签排行 */
.tag-ranking {
  padding: 8px 0;
}

.tag-rank-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-rank-item:hover {
  background: var(--cyp-bg-muted);
}

.rank-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  background: var(--cyp-border);
  color: var(--cyp-text-secondary);
  flex-shrink: 0;
}

.rank-gold {
  background: var(--cyp-brand);
  color: var(--cyp-text);
}

.rank-silver {
  background: var(--cyp-bg-elevated);
  color: var(--cyp-text-secondary);
}

.rank-bronze {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-muted);
}

.tag-info {
  flex: 1;
  min-width: 0;
}

.tag-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--cyp-text);
  margin-bottom: 4px;
}

.tag-count {
  font-size: 14px;
  color: var(--cyp-text-muted);
}

.tag-bar {
  flex: 2;
  height: 8px;
  background: var(--cyp-border);
  border-radius: 4px;
  overflow: hidden;
}

.tag-bar-fill {
  height: 100%;
  background: var(--cyp-brand);
  transition: width 0.3s;
}

/* 存储空间 */
.storage-info {
  display: flex;
  gap: 32px;
  align-items: center;
  padding: 16px;
}

.storage-chart {
  width: 200px;
  height: 200px;
  flex-shrink: 0;
}

.storage-details {
  flex: 1;
}

.storage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--cyp-border);
}

.storage-item:last-of-type {
  border-bottom: none;
}

.storage-label {
  font-size: 14px;
  color: var(--cyp-text-secondary);
}

.storage-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--cyp-text);
}

.storage-progress {
  margin-top: 16px;
}

/* 侧边栏菜单 */
.sidebar-menu {
  border-right: none;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .page-title {
    font-size: 24px;
  }

  .stats-cards {
    grid-template-columns: 1fr;
  }

  .storage-info {
    flex-direction: column;
  }

  .storage-chart {
    width: 180px;
    height: 180px;
  }

  .tag-rank-item {
    flex-wrap: wrap;
  }

  .tag-bar {
    flex: 1 1 100%;
    margin-top: 8px;
  }
}

</style>
