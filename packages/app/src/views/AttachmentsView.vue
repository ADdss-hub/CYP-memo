<!--
  文件库界面（全格式存储与管理）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <template #sidebar>
      <el-menu :default-active="activeFilter" class="sidebar-menu">
        <el-menu-item index="all" @click="filterByType('all')">
          <el-icon><Files /></el-icon>
          <span>全部文件</span>
        </el-menu-item>
        <el-menu-item index="image" @click="filterByType('image')">
          <el-icon><Picture /></el-icon>
          <span>图片</span>
        </el-menu-item>
        <el-menu-item index="text" @click="filterByType('text')">
          <el-icon><Document /></el-icon>
          <span>文本</span>
        </el-menu-item>
        <el-menu-item index="video" @click="filterByType('video')">
          <el-icon><Folder /></el-icon>
          <span>视频</span>
        </el-menu-item>
        <el-menu-item index="audio" @click="filterByType('audio')">
          <el-icon><Folder /></el-icon>
          <span>音频</span>
        </el-menu-item>
        <el-menu-item index="other" @click="filterByType('other')">
          <el-icon><Folder /></el-icon>
          <span>其他格式</span>
        </el-menu-item>
      </el-menu>
    </template>

    <div class="attachments-view">
      <div class="header">
        <div class="header-left">
          <Button type="text" @click="handleBack">
            <span class="back-icon">←</span> 返回
          </Button>
          <div class="title-block">
            <h1 class="page-title">文件库</h1>
            <p class="page-subtitle">同一文件可同时关联多条备忘录，取消某一条关联不会影响其它备忘录</p>
          </div>
        </div>

        <!-- 系统存储空间 vs 文件库存储空间（R-010：同 dataDir 根，两项指标分称，禁止混用数字） -->
        <el-card class="storage-card" shadow="hover">
          <div class="storage-info">
            <div class="storage-icon">
              <el-icon><FolderOpened /></el-icon>
            </div>
            <div class="storage-details">
              <div class="storage-label">文件库存储空间</div>
              <div class="storage-value">
                本范围占用 {{ formatFileSize(storageInfo.accountUsed) }}
              </div>
              <div class="storage-account">
                主账号与子账号合计（开启子账号隔离时仅本人）· 附件文件体积，非整卷已用
              </div>
              <div class="storage-system-label">系统存储空间</div>
              <div class="storage-account">
                已用 {{ formatFileSize(storageInfo.used) }} / 总量
                {{ formatFileSize(storageInfo.total) }} · 可用
                {{ formatFileSize(storageInfo.available) }}
              </div>
              <el-progress
                :percentage="storagePercentage"
                :color="getStorageColor(storagePercentage)"
                :stroke-width="8"
                :aria-label="`系统存储空间已用 ${storagePercentage}%`"
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
          <span v-if="selectedFiles.length > 0" class="selection-impact">
            已选 {{ selectedFiles.length }}
            <template v-if="selectedLinkedFileCount > 0">
              · {{ selectedLinkedFileCount }} 个正被备忘录使用
            </template>
          </span>
          <el-button type="primary" :icon="Upload" :loading="uploading" @click="triggerUpload">
            上传文件
          </el-button>
          <el-button
            v-if="selectedFiles.length > 0"
            type="danger"
            :icon="Delete"
            @click="handleBatchDelete"
          >
            删除选中 ({{ selectedFiles.length }})
          </el-button>
          <input
            ref="uploadInputRef"
            type="file"
            accept="*/*"
            multiple
            class="hidden-upload"
            @change="handleUploadChange"
          />
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
        <el-empty description="暂无文件（支持全部格式上传）" />
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
              v-if="file.type.startsWith('image/') && thumbUrl(file.id)"
              :src="thumbUrl(file.id)"
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
            <div v-if="file.uploaderUsername" class="attachment-uploader">
              上传者：{{ file.uploaderUsername }}
            </div>
            <div class="attachment-memo">
              <template v-if="linkedMemosOf(file).length === 0">
                <span class="memo-empty">未关联备忘录</span>
              </template>
              <template v-else>
                <div class="memo-usage">
                  已被 {{ linkedMemosOf(file).length }} 条备忘录使用
                </div>
                <div class="memo-chip-list">
                  <button
                    v-for="memo in linkedMemosOf(file).slice(0, 3)"
                    :key="memo.id"
                    type="button"
                    class="memo-chip"
                    :title="memo.title || '无标题备忘录'"
                    @click="openMemo(memo.id)"
                  >
                    {{ memo.title || '无标题备忘录' }}
                  </button>
                  <span
                    v-if="linkedMemosOf(file).length > 3"
                    class="memo-more"
                    :title="linkedMemosOf(file).slice(3).map((m) => m.title || '无标题备忘录').join('、')"
                  >
                    +{{ linkedMemosOf(file).length - 3 }}
                  </span>
                </div>
              </template>
            </div>
            <div v-if="tagsOf(file).length > 0" class="attachment-tags" title="来自关联备忘录的标签">
              <el-tag
                v-for="tag in tagsOf(file).slice(0, 3)"
                :key="tag"
                size="small"
                type="info"
              >
                {{ tag }}
              </el-tag>
              <el-tag v-if="tagsOf(file).length > 3" size="small" type="info">
                +{{ tagsOf(file).length - 3 }}
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
            <label class="mcp-option" @click.stop>
              <input
                type="checkbox"
                :checked="Boolean(file.mcpPublic)"
                :disabled="mcpPublicBusyId === file.id"
                @change="toggleMcpPublic(file, ($event.target as HTMLInputElement).checked)"
              />
              <span>允许 MCP 公开</span>
            </label>
          </div>

            <div class="attachment-actions">
            <el-button type="primary" :icon="Download" size="small" @click="handleDownload(file)">
              下载
            </el-button>
            <el-button type="success" size="small" @click="openLinkMemoDialog(file)">
              {{ linkedMemosOf(file).length > 0 ? '管理关联' : '关联备忘录' }}
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
            :src="thumbUrl(previewFile.id)"
            :alt="previewFile.filename"
            class="preview-full-image"
          />
          <div v-else class="preview-text">
            <p>此文件类型不支持预览，请下载后查看。</p>
            <el-button type="primary" @click="handleDownload(previewFile!)"> 下载文件 </el-button>
          </div>
        </div>
      </el-dialog>

      <!-- 关联备忘录 -->
      <el-dialog v-model="linkMemoVisible" title="管理备忘录关联" width="480px">
        <p class="link-memo-hint">
          可同时勾选多条备忘录。取消勾选只解除这一条，文件仍留在文件库，其它备忘录不受影响。
        </p>
        <el-input
          v-model="linkMemoFilter"
          placeholder="搜索备忘录标题..."
          clearable
          style="margin-bottom: 12px"
        />
        <div v-if="linkMemoCandidates.length === 0" class="link-memo-empty">暂无匹配的备忘录</div>
        <el-checkbox-group v-else v-model="linkTargetMemoIds" class="link-memo-list">
          <el-checkbox
            v-for="memo in linkMemoCandidates"
            :key="memo.id"
            :label="memo.id"
            class="link-memo-item"
          >
            {{ memo.title || '无标题备忘录' }}
          </el-checkbox>
        </el-checkbox-group>
        <template #footer>
          <el-button @click="linkMemoVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmLinkMemo">保存关联</el-button>
        </template>
      </el-dialog>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMemoStore } from '../stores/memo'
import { fileManager, formatFileSize } from '@cyp-memo/shared'
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
  Upload,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const memoStore = useMemoStore()
const toast = useToast()

// 状态
const loading = ref(false)
const uploading = ref(false)
const uploadInputRef = ref<HTMLInputElement | null>(null)
const allFiles = ref<FileMetadata[]>([])
const activeFilter = ref('all')
const sortOrder = ref<'asc' | 'desc'>('desc')
const selectedFiles = ref<string[]>([])
const previewVisible = ref(false)
const previewFile = ref<FileMetadata | null>(null)
const mcpPublicBusyId = ref<string | null>(null)

// 关联备忘录对话框
const linkMemoVisible = ref(false)
const linkMemoFile = ref<FileMetadata | null>(null)
const linkTargetMemoIds = ref<string[]>([])
const linkMemoFilter = ref('')
const linkMemoOptions = ref<Memo[]>([])

const linkMemoCandidates = computed(() => {
  const q = linkMemoFilter.value.trim().toLowerCase()
  if (!q) return linkMemoOptions.value
  return linkMemoOptions.value.filter((m) => (m.title || '').toLowerCase().includes(q))
})

// 备忘录信息缓存（用于显示标题和标签）
const memoCache = ref<Map<string, Memo>>(new Map())

// 存储信息
const storageInfo = ref({
  used: 0,
  total: 0,
  available: 0,
  accountUsed: 0,
})

// 文件预览 URL 缓存
const previewUrls = ref<Record<string, string>>({})

function thumbUrl(fileId: string): string {
  return previewUrls.value[fileId] || ''
}

async function rememberThumb(fileId: string, blob: Blob): Promise<void> {
  const prev = previewUrls.value[fileId]
  if (prev) URL.revokeObjectURL(prev)
  previewUrls.value = { ...previewUrls.value, [fileId]: URL.createObjectURL(blob) }
}

async function loadImageThumbs(files: FileMetadata[]): Promise<void> {
  const images = files.filter(
    (file) => (file.type || '').startsWith('image/') && file.size < 2 * 1024 * 1024
  )
  for (const file of images) {
    if (previewUrls.value[file.id]) continue
    try {
      const blob = await fileManager.getFile(file.id)
      await rememberThumb(file.id, blob)
    } catch {
      /* 缩略图失败不挡住列表 */
    }
  }
}

// 计算属性
const filteredFiles = computed(() => {
  let files = allFiles.value

  if (activeFilter.value === 'image') {
    files = files.filter((file) => (file.type || '').startsWith('image/'))
  } else if (activeFilter.value === 'text') {
    files = files.filter((file) => (file.type || '').startsWith('text/'))
  } else if (activeFilter.value === 'video') {
    files = files.filter((file) => (file.type || '').startsWith('video/'))
  } else if (activeFilter.value === 'audio') {
    files = files.filter((file) => (file.type || '').startsWith('audio/'))
  } else if (activeFilter.value === 'other') {
    files = files.filter((file) => {
      const t = (file.type || '').toLowerCase()
      return (
        !t.startsWith('image/') &&
        !t.startsWith('text/') &&
        !t.startsWith('video/') &&
        !t.startsWith('audio/')
      )
    })
  }

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

const selectedLinkedFileCount = computed(() => {
  const selected = new Set(selectedFiles.value)
  return allFiles.value.filter((file) => selected.has(file.id) && linkedMemosOf(file).length > 0)
    .length
})

const storagePercentage = computed(() => {
  if (storageInfo.value.total === 0) return 0
  return Math.round((storageInfo.value.used / storageInfo.value.total) * 100)
})

/**
 * 加载文件库列表
 */
async function loadAttachments() {
  if (!authStore.currentUser) return

  loading.value = true
  try {
    const userId = authStore.currentUser.id
    const ascending = sortOrder.value === 'asc'
    const [files, storage] = await Promise.all([
      fileManager.getFilesByUploadTime(userId, ascending),
      fileManager.getStorageUsage(userId),
      loadMemoInfo(),
    ])
    allFiles.value = files
    storageInfo.value = storage
    void loadImageThumbs(files)
  } catch (error) {
    console.error('加载文件库失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    toast.error(`加载文件库失败: ${errorMessage}，如有问题请联系系统管理员`)
  } finally {
    loading.value = false
  }
}

function triggerUpload() {
  uploadInputRef.value?.click()
}

async function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length || !authStore.currentUser) return

  const maxSize = 10 * 1024 * 1024 * 1024
  uploading.value = true
  let ok = 0
  try {
    const results = await Promise.allSettled(
      files.map(async (file) => {
        if (file.size > maxSize) {
          throw new Error(`${file.name} 超过 10GB`)
        }
        // 无 memoId：入库为独立文件，可稍后关联备忘录；accept=*/* 全格式
        return fileManager.uploadFile(authStore.currentUser!.id, file)
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') ok++
      else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        toast.warning(msg || '上传失败')
      }
    }
    if (ok > 0) {
      toast.success(`已上传 ${ok} 个文件到文件库`)
      await loadAttachments()
    }
  } finally {
    uploading.value = false
  }
}

/**
 * 加载备忘录，用于汇总一个文件被哪些备忘录使用
 */
async function loadMemoInfo() {
  if (!authStore.currentUser) return
  try {
    await memoStore.loadMemos(authStore.currentUser.id)
    memoCache.value = new Map(memoStore.memos.map((memo) => [memo.id, memo]))
  } catch (error) {
    console.warn('加载备忘录信息失败:', error)
  }
}

function linkedMemosOf(file: FileMetadata): Memo[] {
  const ids = new Set<string>()
  for (const memo of memoStore.memos) {
    if (memo.deletedAt) continue
    if ((memo.attachments || []).includes(file.id)) ids.add(memo.id)
  }
  if (file.memoId) ids.add(file.memoId)
  for (const id of file.linkedMemoIds || []) ids.add(id)

  const ordered = [...ids]
  if (file.memoId) {
    ordered.sort((a, b) => (a === file.memoId ? -1 : b === file.memoId ? 1 : 0))
  }

  const result: Memo[] = []
  for (const id of ordered) {
    const memo = memoCache.value.get(id) || memoStore.memos.find((item) => item.id === id)
    if (memo && !memo.deletedAt) result.push(memo)
  }
  return result
}

function tagsOf(file: FileMetadata): string[] {
  const tags = new Set<string>()
  for (const memo of linkedMemosOf(file)) {
    for (const tag of memo.tags || []) {
      if (tag) tags.add(tag)
    }
  }
  return [...tags]
}

function openMemo(memoId: string) {
  router.push(`/memos/${memoId}`)
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
 * 预览文件
 */
function handlePreview(file: FileMetadata) {
  previewFile.value = file
  previewVisible.value = true
  if ((file.type || '').startsWith('image/') && !previewUrls.value[file.id]) {
    void fileManager.getFile(file.id).then((blob) => rememberThumb(file.id, blob)).catch(() => undefined)
  }
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
    const usage = linkedMemosOf(file)
    const usageText =
      usage.length > 0
        ? `该文件正被 ${usage.length} 条备忘录使用（${usage
            .map((memo) => memo.title || '无标题备忘录')
            .join('、')}）。删除后会从这些备忘录中去掉该文件，不会删除备忘录本身。`
        : '此操作不可恢复。'
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.filename}" 吗？${usageText}`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await fileManager.deleteFile(file.id)

    // 同步前端备忘录缓存中的附件列表
    syncMemoStoreAfterFileDelete([file.id], file.memoId)

    // 清理预览 URL
    if (previewUrls.value[file.id]) {
      URL.revokeObjectURL(previewUrls.value[file.id])
      const next = { ...previewUrls.value }
      delete next[file.id]
      previewUrls.value = next
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
    const affected = allFiles.value.filter(
      (file) => selectedFiles.value.includes(file.id) && linkedMemosOf(file).length > 0
    )
    const usageText =
      affected.length > 0
        ? `其中 ${affected.length} 个文件正被备忘录使用；删除后只会从备忘录中去掉这些文件，不会删除备忘录。`
        : '此操作不可恢复。'
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedFiles.value.length} 个文件吗？${usageText}`,
      '确认批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await fileManager.deleteFiles(selectedFiles.value)

    const deletedIds = [...selectedFiles.value]
    const memoIds = deletedIds
      .map((id) => allFiles.value.find((f) => f.id === id)?.memoId)
      .filter((id): id is string => !!id)
    syncMemoStoreAfterFileDelete(deletedIds, ...memoIds)

    // 清理预览 URL
    selectedFiles.value.forEach((fileId) => {
      if (previewUrls.value[fileId]) {
        URL.revokeObjectURL(previewUrls.value[fileId])
        const next = { ...previewUrls.value }
        delete next[fileId]
        previewUrls.value = next
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
 * 删除附件后同步前端备忘录缓存（列表 + 当前详情）
 */
function syncMemoStoreAfterFileDelete(fileIds: string[], ...hintMemoIds: Array<string | undefined>) {
  const remove = new Set(fileIds)
  const strip = (memo: { attachments?: string[] }) => {
    if (!memo.attachments?.length) return
    memo.attachments = memo.attachments.filter((id) => !remove.has(id))
  }

  for (const memo of memoStore.memos) {
    strip(memo)
  }
  if (memoStore.currentMemo) {
    strip(memoStore.currentMemo)
  }

  // hint 仅用于触发相关 memo 的本地一致性；服务端已权威更新
  void hintMemoIds
}

/**
 * 打开「关联到备忘录」对话框
 */
async function openLinkMemoDialog(file: FileMetadata) {
  if (!authStore.currentUser) return
  linkMemoFile.value = file
  linkMemoFilter.value = ''
  linkMemoVisible.value = true
  try {
    await memoStore.loadMemos(authStore.currentUser.id)
    memoCache.value = new Map(memoStore.memos.map((memo) => [memo.id, memo]))
    linkMemoOptions.value = memoStore.memos.filter((memo) => !memo.deletedAt)
    linkTargetMemoIds.value = linkedMemosOf(file).map((memo) => memo.id)
  } catch (err) {
    console.error('加载备忘录列表失败:', err)
    toast.error('加载备忘录列表失败')
    linkMemoOptions.value = []
    linkTargetMemoIds.value = []
  }
}

/**
 * 保存多备忘录关联（一次 PATCH）
 */
async function confirmLinkMemo() {
  if (!linkMemoFile.value) return
  const fileId = linkMemoFile.value.id
  const nextIds = [...linkTargetMemoIds.value]
  try {
    await fileManager.setFileMemoLinks(fileId, nextIds)
    const next = new Set(nextIds)
    for (const memo of memoStore.memos) {
      const has = (memo.attachments || []).includes(fileId)
      const want = next.has(memo.id)
      if (has && !want) {
        memo.attachments = (memo.attachments || []).filter((id) => id !== fileId)
      } else if (!has && want) {
        memo.attachments = [...(memo.attachments || []), fileId]
      }
      memoCache.value.set(memo.id, memo)
    }
    toast.success(nextIds.length > 0 ? `已关联 ${nextIds.length} 条备忘录` : '已解除全部关联')
    linkMemoVisible.value = false
    await loadAttachments()
  } catch (err) {
    console.error('更新备忘录关联失败:', err)
    toast.error('更新备忘录关联失败')
  }
}

/**
 * 切换文件 MCP 公开标记（O7 flag；对齐设计 10.3）
 */
async function toggleMcpPublic(file: FileMetadata, next: boolean) {
  if (mcpPublicBusyId.value) return
  const prev = Boolean(file.mcpPublic)
  if (prev === next) return
  mcpPublicBusyId.value = file.id
  file.mcpPublic = next
  try {
    await fileManager.updateFile(file.id, { mcpPublic: next })
    toast.success(next ? '已允许 MCP 公开' : '已取消 MCP 公开')
  } catch (err) {
    file.mcpPublic = prev
    console.error('更新 MCP 公开标记失败:', err)
    toast.error('更新 MCP 公开标记失败')
  } finally {
    mcpPublicBusyId.value = null
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
  if (percentage < 50) return 'var(--cyp-success)'
  if (percentage < 80) return 'var(--cyp-warning)'
  return 'var(--cyp-danger)'
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
onUnmounted(() => {
  for (const url of Object.values(previewUrls.value)) URL.revokeObjectURL(url)
  previewUrls.value = {}
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
  color: var(--cyp-text);
  margin: 0;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--cyp-text-muted);
}

.hidden-upload {
  display: none;
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
  background: var(--cyp-success);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--cyp-text);
  flex-shrink: 0;
}

.storage-details {
  flex: 1;
}

.storage-label {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin-bottom: 4px;
}

.storage-system-label {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 12px 0 4px;
  font-weight: 600;
}

.storage-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--cyp-text);
  margin-bottom: 4px;
}

.storage-account {
  font-size: 12px;
  color: var(--cyp-text-muted);
  margin-bottom: 10px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 8px;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
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
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 2px var(--cyp-brand-tint);
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
  background: var(--cyp-chrome-bg-panel);
  border-radius: 4px;
  padding: 4px;
  box-shadow: var(--cyp-chrome-shadow);
}

/* 预览区域 */
.attachment-preview {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cyp-bg-muted);
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-icon {
  color: var(--cyp-text-muted);
}

/* 附件信息 */
.attachment-info {
  padding: 16px;
}

.attachment-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--cyp-text);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-uploader {
  font-size: 12px;
  color: var(--cyp-text-secondary);
  margin-bottom: 6px;
}

.selection-impact {
  font-size: 13px;
  color: var(--cyp-text-secondary);
}

.attachment-memo {
  margin-bottom: 8px;
}

.memo-empty {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.memo-usage {
  font-size: 12px;
  color: var(--cyp-brand);
  margin-bottom: 6px;
}

.memo-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.memo-chip,
.memo-more {
  max-width: 100%;
  border: 1px solid var(--cyp-brand-tint-strong);
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memo-chip {
  cursor: pointer;
}

.memo-chip:hover {
  background: var(--cyp-brand-tint-strong);
}

.memo-more {
  color: var(--cyp-text-secondary);
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

.mcp-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  padding: 2px 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  user-select: none;
}

.mcp-option input {
  margin: 0;
  accent-color: var(--cyp-brand);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cyp-text-muted);
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
  color: var(--cyp-text-secondary);
}

.link-memo-hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cyp-text-secondary);
}

.link-memo-empty {
  padding: 24px;
  text-align: center;
  color: var(--cyp-text-muted);
}

.link-memo-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  width: 100%;
}

.link-memo-item {
  margin: 0 !important;
  height: auto !important;
  padding: 8px 4px;
  white-space: normal;
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

</style>
