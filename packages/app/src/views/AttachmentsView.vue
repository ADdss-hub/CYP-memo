<!--
  附件管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <template #sidebar>
      <el-menu :default-active="activeFilter" class="sidebar-menu">
        <el-menu-item index="all" @click="filterByType('all')">
          <el-icon><Files /></el-icon>
          <span>全部附件</span>
        </el-menu-item>
        <el-menu-item index="image" @click="filterByType('image')">
          <el-icon><Picture /></el-icon>
          <span>图片</span>
        </el-menu-item>
        <el-menu-item index="text" @click="filterByType('text')">
          <el-icon><Document /></el-icon>
          <span>文本</span>
        </el-menu-item>
        <el-menu-item index="application" @click="filterByType('application')">
          <el-icon><Folder /></el-icon>
          <span>其他</span>
        </el-menu-item>
      </el-menu>
    </template>

    <div class="attachments-view">
      <div class="header">
        <div class="header-left">
          <Button type="text" @click="handleBack">
            <span class="back-icon">←</span> 返回
          </Button>
          <h1 class="page-title">附件管理</h1>
        </div>

        <!-- 存储空间信息 -->
        <el-card class="storage-card" shadow="hover">
          <div class="storage-info">
            <div class="storage-icon">
              <el-icon><FolderOpened /></el-icon>
            </div>
            <div class="storage-details">
              <div class="storage-label">存储空间使用情况</div>
              <div class="storage-value">
                {{ formatFileSize(storageInfo.used) }} / {{ formatFileSize(storageInfo.total) }}
              </div>
              <el-progress
                :percentage="storagePercentage"
                :color="getStorageColor(storagePercentage)"
                :stroke-width="8"
              />
            </div>
          </div>
        </el-card>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-checkbox
            v-model="selectAll"
            :indeterminate="isIndeterminate"
            @change="handleSelectAll"
          >
            全选
          </el-checkbox>
          <el-button
            v-if="selectedFiles.length > 0"
            type="danger"
            :icon="Delete"
            @click="handleBatchDelete"
          >
            删除选中 ({{ selectedFiles.length }})
          </el-button>
        </div>

        <div class="toolbar-right">
          <el-select v-model="sortOrder" placeholder="排序方式" style="width: 150px">
            <el-option label="最新上传" value="desc" />
            <el-option label="最早上传" value="asc" />
          </el-select>
        </div>
      </div>

      <!-- 附件列表 -->
      <div v-if="loading" class="loading-container">
        <Loading />
      </div>

      <div v-else-if="filteredFiles.length === 0" class="empty-container">
        <el-empty description="暂无附件" />
      </div>

      <div v-else class="attachments-grid">
        <el-card
          v-for="file in filteredFiles"
          :key="file.id"
          class="attachment-card"
          :class="{ selected: selectedFiles.includes(file.id) }"
          shadow="hover"
        >
          <div class="attachment-checkbox">
            <el-checkbox
              :model-value="selectedFiles.includes(file.id)"
              @change="toggleFileSelection(file.id)"
            />
          </div>

          <div class="attachment-preview" @click="handlePreview(file)">
            <!-- 图片预览 -->
            <img
              v-if="file.type.startsWith('image/')"
              :src="getFilePreviewUrl(file.id)"
              :alt="file.filename"
              class="preview-image"
            />
            <!-- 文件图标 -->
            <div v-else class="preview-icon">
              <el-icon :size="48">
                <Document v-if="file.type.startsWith('text/')" />
                <Folder v-else />
              </el-icon>
            </div>
          </div>

          <div class="attachment-info">
            <div class="attachment-name" :title="file.filename">
              {{ file.filename }}
            </div>
            <div class="attachment-memo" :title="getMemoTitle(file.memoId)">
              <el-icon><Document /></el-icon>
              {{ getMemoTitle(file.memoId) }}
            </div>
            <div v-if="getMemoTags(file.memoId).length > 0" class="attachment-tags">
              <el-tag
                v-for="tag in getMemoTags(file.memoId).slice(0, 3)"
                :key="tag"
                size="small"
                type="info"
              >
                {{ tag }}
              </el-tag>
              <el-tag v-if="getMemoTags(file.memoId).length > 3" size="small" type="info">
                +{{ getMemoTags(file.memoId).length - 3 }}
              </el-tag>
            </div>
            <div class="attachment-meta">
              <span class="meta-item">
                <el-icon><Clock /></el-icon>
                {{ formatDate(file.uploadedAt) }}
              </span>
              <span class="meta-item">
                <el-icon><Document /></el-icon>
                {{ formatFileSize(file.size) }}
              </span>
            </div>
          </div>

          <div class="attachment-actions">
            <el-button type="primary" :icon="Download" size="small" @click="handleDownload(file)">
              下载
            </el-button>
            <el-button type="danger" :icon="Delete" size="small" @click="handleDelete(file)">
              删除
            </el-button>
          </div>
        </el-card>
      </div>

      <!-- 预览对话框 -->
      <el-dialog v-model="previewVisible" :title="previewFile?.filename" width="80%" center>
        <div class="preview-container">
          <img
            v-if="previewFile && previewFile.type.startsWith('image/')"
            :src="getFilePreviewUrl(previewFile.id)"
            :alt="previewFile.filename"
            class="preview-full-image"
          />
          <div v-else class="preview-text">
            <p>此文件类型不支持预览，请下载后查看。</p>
            <el-button type="primary" @click="handleDownload(previewFile!)"> 下载文件 </el-button>
          </div>
        </div>
      </el-dialog>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { fileManager, formatFileSize, memoManager } from '@cyp-memo/shared'
import type { FileMetadata, Memo } from '@cyp-memo/shared'
import { useToast } from '../composables/useToast'
import AppLayout from '../components/AppLayout.vue'
import Loading from '../components/Loading.vue'
import Button from '../components/Button.vue'
import {
  Files,
  Picture,
  Document,
  Folder,
  FolderOpened,
  Delete,
  Download,
  Clock,
  PriceTag,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

// 状态
const loading = ref(false)
const allFiles = ref<FileMetadata[]>([])
const activeFilter = ref('all')
const sortOrder = ref<'asc' | 'desc'>('desc')
const selectedFiles = ref<string[]>([])
const previewVisible = ref(false)
const previewFile = ref<FileMetadata | null>(null)

// 备忘录信息缓存（用于显示标题和标签）
const memoCache = ref<Map<string, Memo>>(new Map())

// 存储信息
const storageInfo = ref({
  used: 0,
  total: 0,
  available: 0,
})

// 文件预览 URL 缓存
const previewUrls = new Map<string, string>()

// 计算属性
const filteredFiles = computed(() => {
  let files = allFiles.value

  // 按类型筛选
  if (activeFilter.value !== 'all') {
    files = files.filter((file) => file.type.startsWith(activeFilter.value + '/'))
  }

  // 按时间排序
  files = [...files].sort((a, b) => {
    const timeA = new Date(a.uploadedAt).getTime()
    const timeB = new Date(b.uploadedAt).getTime()
    return sortOrder.value === 'desc' ? timeB - timeA : timeA - timeB
  })

  return files
})

const selectAll = computed({
  get: () => {
    return (
      filteredFiles.value.length > 0 && selectedFiles.value.length === filteredFiles.value.length
    )
  },
  set: (value: boolean) => {
    if (value) {
      selectedFiles.value = filteredFiles.value.map((f) => f.id)
    } else {
      selectedFiles.value = []
    }
  },
})

const isIndeterminate = computed(() => {
  return selectedFiles.value.length > 0 && selectedFiles.value.length < filteredFiles.value.length
})

const storagePercentage = computed(() => {
  if (storageInfo.value.total === 0) return 0
  return Math.round((storageInfo.value.used / storageInfo.value.total) * 100)
})

/**
 * 加载附件列表
 */
async function loadAttachments() {
  if (!authStore.currentUser) return

  loading.value = true
  try {
    // 根据排序方式加载文件
    const ascending = sortOrder.value === 'asc'
    allFiles.value = await fileManager.getFilesByUploadTime(authStore.currentUser.id, ascending)

    // 加载存储信息
    storageInfo.value = await fileManager.getStorageUsage(authStore.currentUser.id)

    // 加载关联的备忘录信息
    await loadMemoInfo()
  } catch (error) {
    console.error('加载附件列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    toast.error(`加载附件列表失败: ${errorMessage}，如有问题请联系系统管理员`)
  } finally {
    loading.value = false
  }
}

/**
 * 加载备忘录信息（用于显示标题和标签）
 */
async function loadMemoInfo() {
  if (!authStore.currentUser) return

  // 获取所有有关联备忘录的文件的 memoId
  const memoIds = new Set<string>()
  allFiles.value.forEach(file => {
    if (file.memoId) {
      memoIds.add(file.memoId)
    }
  })

  // 加载每个备忘录的信息
  for (const memoId of memoIds) {
    if (!memoCache.value.has(memoId)) {
      try {
        const memo = await memoManager.getMemo(memoId)
        if (memo) {
          memoCache.value.set(memoId, memo)
        }
      } catch (error) {
        console.warn(`加载备忘录 ${memoId} 信息失败:`, error)
      }
    }
  }
}

/**
 * 获取文件关联的备忘录标题
 */
function getMemoTitle(memoId: string | undefined): string {
  if (!memoId) return '未关联备忘录'
  const memo = memoCache.value.get(memoId)
  return memo?.title || '无标题备忘录'
}

/**
 * 获取文件关联的备忘录标签
 */
function getMemoTags(memoId: string | undefined): string[] {
  if (!memoId) return []
  const memo = memoCache.value.get(memoId)
  return memo?.tags || []
}

/**
 * 按类型筛选
 */
function filterByType(type: string) {
  activeFilter.value = type
  selectedFiles.value = []
}

/**
 * 切换文件选择
 */
function toggleFileSelection(fileId: string) {
  const index = selectedFiles.value.indexOf(fileId)
  if (index > -1) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(fileId)
  }
}

/**
 * 全选/取消全选
 */
function handleSelectAll(value: boolean) {
  if (value) {
    selectedFiles.value = filteredFiles.value.map((f) => f.id)
  } else {
    selectedFiles.value = []
  }
}

/**
 * 获取文件预览 URL
 */
function getFilePreviewUrl(fileId: string): string {
  if (previewUrls.has(fileId)) {
    return previewUrls.get(fileId)!
  }

  // 异步加载文件并创建 URL
  fileManager.getFile(fileId).then((blob) => {
    const url = URL.createObjectURL(blob)
    previewUrls.set(fileId, url)
  })

  return ''
}

/**
 * 预览文件
 */
function handlePreview(file: FileMetadata) {
  previewFile.value = file
  previewVisible.value = true
}

/**
 * 下载文件
 */
async function handleDownload(file: FileMetadata) {
  try {
    const blob = await fileManager.getFile(file.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('文件下载成功')
  } catch (error) {
    console.error('下载文件失败:', error)
    toast.error('下载文件失败')
  }
}

/**
 * 删除单个文件
 */
async function handleDelete(file: FileMetadata) {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.filename}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await fileManager.deleteFile(file.id)

    // 清理预览 URL
    if (previewUrls.has(file.id)) {
      URL.revokeObjectURL(previewUrls.get(file.id)!)
      previewUrls.delete(file.id)
    }

    toast.success('文件删除成功')
    await loadAttachments()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除文件失败:', error)
      toast.error('删除文件失败')
    }
  }
}

/**
 * 批量删除文件
 */
async function handleBatchDelete() {
  if (selectedFiles.value.length === 0) return

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedFiles.value.length} 个文件吗？此操作不可恢复。`,
      '确认批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await fileManager.deleteFiles(selectedFiles.value)

    // 清理预览 URL
    selectedFiles.value.forEach((fileId) => {
      if (previewUrls.has(fileId)) {
        URL.revokeObjectURL(previewUrls.get(fileId)!)
        previewUrls.delete(fileId)
      }
    })

    toast.success(`成功删除 ${selectedFiles.value.length} 个文件`)
    selectedFiles.value = []
    await loadAttachments()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量删除文件失败:', error)
      toast.error('批量删除文件失败')
    }
  }
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return '今天'
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return `${days} 天前`
  } else {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/**
 * 获取存储空间颜色
 */
function getStorageColor(percentage: number): string {
  if (percentage < 50) return '#67c23a'
  if (percentage < 80) return '#e6a23c'
  return '#f56c6c'
}

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

// 监听排序变化
watch(sortOrder, () => {
  loadAttachments()
})

// 组件挂载时加载数据
onMounted(() => {
  loadAttachments()
})

// 组件卸载时清理预览 URL
onMounted(() => {
  return () => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.clear()
  }
})
</script>

<style scoped>
.attachments-view {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

/* 存储空间卡片 */
.storage-card {
  margin-bottom: 24px;
}

.storage-card :deep(.el-card__body) {
  padding: 20px;
}

.storage-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.storage-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
  flex-shrink: 0;
}

.storage-details {
  flex: 1;
}

.storage-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 4px;
}

.storage-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 加载和空状态 */
.loading-container,
.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

/* 附件网格 */
.attachments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.attachment-card {
  position: relative;
  transition: all 0.3s;
  cursor: pointer;
}

.attachment-card.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.attachment-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.attachment-card :deep(.el-card__body) {
  padding: 0;
}

.attachment-checkbox {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  background: white;
  border-radius: 4px;
  padding: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 预览区域 */
.attachment-preview {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-icon {
  color: #909399;
}

/* 附件信息 */
.attachment-info {
  padding: 16px;
}

.attachment-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-memo {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #409eff;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-memo .el-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.attachment-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.attachment-tags .el-tag {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.meta-item .el-icon {
  font-size: 14px;
}

/* 操作按钮 */
.attachment-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}

.attachment-actions .el-button {
  flex: 1;
}

/* 预览对话框 */
.preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.preview-full-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.preview-text {
  text-align: center;
}

.preview-text p {
  margin-bottom: 16px;
  color: #606266;
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

  .attachments-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    width: 100%;
    justify-content: space-between;
  }

  .storage-info {
    flex-direction: column;
    text-align: center;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .page-title,
[data-theme='dark'] .attachment-name,
[data-theme='dark'] .storage-value {
  color: #e5eaf3;
}

[data-theme='dark'] .attachment-memo {
  color: #79bbff;
}

[data-theme='dark'] .storage-label,
[data-theme='dark'] .meta-item {
  color: #cfd3dc;
}

[data-theme='dark'] .toolbar,
[data-theme='dark'] .attachment-card {
  background: #1a1a1a;
}

[data-theme='dark'] .attachment-preview {
  background: #262727;
}

[data-theme='dark'] .attachment-checkbox {
  background: #1a1a1a;
}
</style>
