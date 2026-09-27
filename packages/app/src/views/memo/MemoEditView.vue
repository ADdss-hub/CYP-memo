<!--
  备忘录编辑页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="memo-edit-view">
      <!-- 顶部操作栏 -->
      <div class="action-bar">
        <div class="left-actions">
          <Button type="text" @click="handleCancel"> ← 返回 </Button>
          <div v-if="lastSaved" class="save-status">
            <span class="save-icon"></span>
            <span class="save-text">{{ lastSaved }}</span>
          </div>
        </div>
        <div class="right-actions">
          <Button type="default" @click="handleCancel"> 取消 </Button>
          <Button type="primary" :loading="isSaving" @click="handleSave">
            {{ isSaving ? '保存中...' : '保存' }}
          </Button>
        </div>
      </div>

      <!-- 编辑表单 -->
      <div class="edit-form">
        <Loading v-if="isLoading" />

        <div v-else class="form-content">
          <!-- 标题输入 -->
          <div class="form-group">
            <input
              v-model="title"
              type="text"
              class="title-input"
              placeholder="输入标题..."
              @input="handleTitleChange"
            />
          </div>

          <!-- 标签管理 -->
          <div class="form-group">
            <div class="tags-section">
              <div class="tags-label">标签:</div>
              <div class="tags-container">
                <div class="tag-chips">
                  <span v-for="(tag, index) in tags" :key="index" class="tag-chip">
                    {{ tag }}
                    <button class="tag-remove" @click="removeTag(index)">×</button>
                  </span>
                  <div class="tag-input-wrapper">
                    <input
                      ref="tagInputRef"
                      v-model="newTag"
                      type="text"
                      class="tag-input"
                      placeholder="添加标签..."
                      @keydown.enter="addTag"
                      @keydown.space="addTag"
                      @input="handleTagInput"
                      @focus="showTagDropdown = true"
                      @blur="handleTagInputBlur"
                      @keydown.down.prevent="navigateDropdown('down')"
                      @keydown.up.prevent="navigateDropdown('up')"
                      @keydown.escape="showTagDropdown = false"
                    />
                    <!-- 标签自动完成下拉框 -->
                    <div v-if="showTagDropdown && filteredDatabaseTags.length > 0" class="tag-dropdown">
                      <div
                        v-for="(tag, index) in filteredDatabaseTags"
                        :key="tag"
                        :class="['tag-dropdown-item', { active: dropdownIndex === index }]"
                        @mousedown.prevent="selectDropdownTag(tag)"
                        @mouseenter="dropdownIndex = index"
                      >
                        {{ tag }}
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="suggestedTags.length > 0" class="tag-suggestions">
                  <span class="suggestions-label">建议:</span>
                  <button
                    v-for="tag in suggestedTags"
                    :key="tag"
                    class="suggested-tag"
                    @click="addSuggestedTag(tag)"
                  >
                    + {{ tag }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 编辑器 -->
          <div class="form-group editor-group">
            <MemoEditor
              v-model="content"
              placeholder="开始写点什么..."
              :autosave="true"
              :autosave-delay="2000"
              @autosave="handleAutosave"
              @file-upload="handleFileUpload"
            />
          </div>

          <!-- 附件列表 -->
          <div class="form-group">
            <div class="attachments-section">
              <div class="attachments-header">
                <div class="attachments-label">
                  文件 ({{ linkedAttachments.length + pendingFiles.length }})
                </div>
                <div class="attachments-actions">
                  <Button type="default" @click="openLibraryPicker">从文件库选择</Button>
                </div>
              </div>

              <div
                v-if="linkedAttachments.length === 0 && pendingFiles.length === 0"
                class="attachments-empty"
              >
                暂无文件。可从编辑器插入任意格式，或从文件库选择已有文件。
              </div>

              <div v-else class="attachments-list">
                <div
                  v-for="file in linkedAttachments"
                  :key="file.id"
                  class="attachment-item"
                >
                  <span class="attachment-icon"></span>
                  <span class="attachment-name" :title="file.filename">{{ file.filename }}</span>
                  <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
                  <span class="attachment-badge">已入库</span>
                  <button
                    class="attachment-remove"
                    title="取消关联（保留在文件库）"
                    @click="unlinkLinkedAttachment(file.id)"
                  >
                    ×
                  </button>
                </div>
                <div
                  v-for="(file, index) in pendingFiles"
                  :key="'pending-' + index + '-' + file.name"
                  class="attachment-item pending"
                >
                  <span class="attachment-icon"></span>
                  <span class="attachment-name" :title="file.name">{{ file.name }}</span>
                  <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
                  <span class="attachment-badge pending-badge">待上传</span>
                  <button class="attachment-remove" @click="removePendingFile(index)">×</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        v-model="showLibraryPicker"
        title="从文件库选择"
        width="560px"
        confirm-text="添加所选"
        @confirm="confirmLibraryPick"
        @cancel="showLibraryPicker = false"
      >
        <div class="library-picker">
          <input
            v-model="libraryFilter"
            type="search"
            class="library-filter"
            placeholder="按文件名筛选..."
          />
          <div v-if="libraryLoading" class="library-loading">加载中...</div>
          <div v-else-if="filteredLibraryFiles.length === 0" class="library-empty">
            文件库暂无可用文件（支持全部格式）
          </div>
          <div v-else class="library-list">
            <label
              v-for="file in filteredLibraryFiles"
              :key="file.id"
              class="library-item"
              :class="{ selected: librarySelectedIds.includes(file.id) }"
            >
              <input
                type="checkbox"
                :checked="librarySelectedIds.includes(file.id)"
                @change="toggleLibrarySelect(file.id)"
              />
              <span class="library-name" :title="file.filename">{{ file.filename }}</span>
              <span v-if="libraryUsageCount(file) > 0" class="library-used">
                已被 {{ libraryUsageCount(file) }} 条备忘录使用
              </span>
              <span class="library-meta">{{ formatFileSize(file.size) }}</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMemoStore } from '../../stores/memo'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading, MemoEditor, Modal } from '../../components'
import { fileManager, generateUUID } from '@cyp-memo/shared'
import type { FileMetadata } from '@cyp-memo/shared'

const router = useRouter()
const route = useRoute()
const memoStore = useMemoStore()
const authStore = useAuthStore()
const toast = useToast()

// 状态
const isLoading = ref(false)
const isSaving = ref(false)
const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const newTag = ref('')
/** 已关联文件库的文件（编辑加载 / 库内选用） */
const linkedAttachments = ref<FileMetadata[]>([])
/** 本次待上传的本地文件（任意格式） */
const pendingFiles = ref<File[]>([])
const lastSaved = ref('')
const hasUnsavedChanges = ref(false)

// 文件库选择器
const showLibraryPicker = ref(false)
const libraryLoading = ref(false)
const libraryFiles = ref<FileMetadata[]>([])
const librarySelectedIds = ref<string[]>([])
const libraryFilter = ref('')

// 标签自动完成相关状态
const tagInputRef = ref<HTMLInputElement>()
const showTagDropdown = ref(false)
const dropdownIndex = ref(-1)
const databaseTags = ref<string[]>([])

// 计算属性
const isEditMode = computed(() => !!route.params.id)
const memoId = computed(() => route.params.id as string)

const filteredLibraryFiles = computed(() => {
  const linkedIds = new Set(linkedAttachments.value.map((f) => f.id))
  const q = libraryFilter.value.trim().toLowerCase()
  return libraryFiles.value.filter((f) => {
    if (linkedIds.has(f.id)) return false
    if (!q) return true
    return f.filename.toLowerCase().includes(q)
  })
})

function libraryUsageCount(file: FileMetadata): number {
  const ids = new Set<string>(file.linkedMemoIds || [])
  if (file.memoId) ids.add(file.memoId)
  for (const memo of memoStore.memos) {
    if (memo.deletedAt) continue
    if ((memo.attachments || []).includes(file.id)) ids.add(memo.id)
  }
  if (memoId.value) ids.delete(memoId.value)
  return ids.size
}

// 从数据库加载的标签中过滤出匹配输入的标签
const filteredDatabaseTags = computed(() => {
  const input = newTag.value.trim().toLowerCase()
  if (!input) {
    return databaseTags.value.filter((tag) => !tags.value.includes(tag)).slice(0, 10)
  }
  return databaseTags.value
    .filter((tag) => tag.toLowerCase().includes(input) && !tags.value.includes(tag))
    .slice(0, 10)
})

const suggestedTags = computed(() => {
  const allTags = memoStore.allTags
  return allTags
    .filter((tag) => !tags.value.includes(tag))
    .filter((tag) => !filteredDatabaseTags.value.includes(tag))
    .slice(0, 5)
})

const loadMemo = async () => {
  if (!isEditMode.value) {
    const draft = await memoStore.getDraft()
    if (draft) {
      content.value = draft
      toast.info('已恢复草稿')
    }
    return
  }

  isLoading.value = true
  try {
    const memo = await memoStore.getMemo(memoId.value)
    if (memo) {
      title.value = memo.title
      content.value = memo.content
      tags.value = [...memo.tags]
      try {
        const files = await fileManager.getMemoAttachments(memoId.value)
        // 合并 memo.attachments 中有但 getByMemoId 漏掉的（历史不一致）
        const byId = new Map(files.map((f) => [f.id, f]))
        for (const id of memo.attachments || []) {
          if (!byId.has(id)) {
            try {
              const meta = await fileManager.getFileMetadata(id)
              byId.set(id, meta)
            } catch {
              /* 附件已删 */
            }
          }
        }
        linkedAttachments.value = Array.from(byId.values())
      } catch (attachErr) {
        console.warn('加载附件失败:', attachErr)
        linkedAttachments.value = []
      }
    } else {
      toast.error('备忘录不存在')
      router.push('/memos')
    }
  } catch (err) {
    console.error('加载备忘录失败:', err)
    toast.error('加载失败')
  } finally {
    isLoading.value = false
  }
}

const loadDatabaseTags = async () => {
  try {
    if (!authStore.currentUser) return
    // 已有列表则复用标签，避免编辑页再拉整租户备忘录
    if (memoStore.memos.length === 0) {
      await memoStore.loadMemos(authStore.currentUser.id)
    }
    databaseTags.value = [...memoStore.allTags]
  } catch (err) {
    console.error('加载数据库标签失败:', err)
  }
}

const handleTitleChange = () => {
  hasUnsavedChanges.value = true
}

const handleTagInput = () => {
  showTagDropdown.value = true
  dropdownIndex.value = -1
}

const handleTagInputBlur = () => {
  setTimeout(() => {
    showTagDropdown.value = false
    dropdownIndex.value = -1
  }, 200)
}

const navigateDropdown = (direction: 'up' | 'down') => {
  if (!showTagDropdown.value || filteredDatabaseTags.value.length === 0) return
  if (direction === 'down') {
    dropdownIndex.value = (dropdownIndex.value + 1) % filteredDatabaseTags.value.length
  } else {
    dropdownIndex.value =
      dropdownIndex.value <= 0
        ? filteredDatabaseTags.value.length - 1
        : dropdownIndex.value - 1
  }
}

const selectDropdownTag = (tag: string) => {
  if (!tags.value.includes(tag)) {
    tags.value.push(tag)
    hasUnsavedChanges.value = true
  }
  newTag.value = ''
  showTagDropdown.value = false
  dropdownIndex.value = -1
  tagInputRef.value?.focus()
}

const addTag = (event?: KeyboardEvent) => {
  if (event) event.preventDefault()
  if (
    showTagDropdown.value &&
    dropdownIndex.value >= 0 &&
    dropdownIndex.value < filteredDatabaseTags.value.length
  ) {
    selectDropdownTag(filteredDatabaseTags.value[dropdownIndex.value])
    return
  }
  const tag = newTag.value.trim()
  if (!tag) return
  if (tag.length > 20) {
    toast.error('标签名称不能超过 20 个字符')
    return
  }
  if (tags.value.includes(tag)) {
    toast.warning('标签已存在')
    newTag.value = ''
    return
  }
  tags.value.push(tag)
  newTag.value = ''
  showTagDropdown.value = false
  dropdownIndex.value = -1
  hasUnsavedChanges.value = true
}

const addSuggestedTag = (tag: string) => {
  if (!tags.value.includes(tag)) {
    tags.value.push(tag)
    hasUnsavedChanges.value = true
  }
}

const removeTag = (index: number) => {
  tags.value.splice(index, 1)
  hasUnsavedChanges.value = true
}

const handleFileUpload = async (file: File) => {
  try {
    const maxSize = 10 * 1024 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('文件大小不能超过 10GB')
      return
    }
    pendingFiles.value.push(file)
    hasUnsavedChanges.value = true
    toast.success(`已添加文件: ${file.name}`)
  } catch (err) {
    console.error('添加文件失败:', err)
    toast.error('添加文件失败')
  }
}

const unlinkLinkedAttachment = (fileId: string) => {
  linkedAttachments.value = linkedAttachments.value.filter((f) => f.id !== fileId)
  hasUnsavedChanges.value = true
}

const removePendingFile = (index: number) => {
  pendingFiles.value.splice(index, 1)
  hasUnsavedChanges.value = true
}

const openLibraryPicker = async () => {
  if (!authStore.currentUser) {
    toast.error('请先登录')
    return
  }
  showLibraryPicker.value = true
  librarySelectedIds.value = []
  libraryFilter.value = ''
  libraryLoading.value = true
  try {
    libraryFiles.value = await fileManager.getFilesByUploadTime(authStore.currentUser.id, false)
  } catch (err) {
    console.error('加载文件库失败:', err)
    toast.error('加载文件库失败')
    libraryFiles.value = []
  } finally {
    libraryLoading.value = false
  }
}

const toggleLibrarySelect = (fileId: string) => {
  const idx = librarySelectedIds.value.indexOf(fileId)
  if (idx >= 0) librarySelectedIds.value.splice(idx, 1)
  else librarySelectedIds.value.push(fileId)
}

const confirmLibraryPick = () => {
  const picked = libraryFiles.value.filter((f) => librarySelectedIds.value.includes(f.id))
  const existing = new Set(linkedAttachments.value.map((f) => f.id))
  let added = 0
  for (const file of picked) {
    if (existing.has(file.id)) continue
    linkedAttachments.value.push(file)
    existing.add(file.id)
    added++
  }
  showLibraryPicker.value = false
  if (added > 0) {
    hasUnsavedChanges.value = true
    toast.success(`已选择 ${added} 个文件库文件`)
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const handleAutosave = async (html: string) => {
  if (!isEditMode.value) {
    memoStore.saveDraft(html)
    lastSaved.value = '草稿已保存'
    setTimeout(() => {
      lastSaved.value = ''
    }, 3000)
  } else {
    lastSaved.value = '自动保存中...'
    setTimeout(() => {
      lastSaved.value = '已自动保存'
      setTimeout(() => {
        lastSaved.value = ''
      }, 3000)
    }, 500)
  }
}

/** 上传待传文件；返回成功的 fileId 列表。新建时可不传 memoId，由随后单次 create 挂接。 */
const uploadPendingFiles = async (targetMemoId?: string): Promise<string[]> => {
  if (!authStore.currentUser || pendingFiles.value.length === 0) return []
  const uploaded: string[] = []
  // 并行上传，缩短保存串行总耗时（R-008）
  const results = await Promise.allSettled(
    pendingFiles.value.map((file) =>
      fileManager.uploadFile(
        authStore.currentUser!.id,
        file,
        targetMemoId || undefined
      )
    )
  )
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      uploaded.push(r.value.id)
    } else {
      const name = pendingFiles.value[i]?.name || '未知'
      console.error('上传文件失败:', name, r.reason)
      toast.warning(`文件 ${name} 上传失败`)
    }
  })
  return uploaded
}

const handleSave = async () => {
  if (!authStore.currentUser) {
    toast.error('请先登录')
    return
  }
  if (!title.value.trim()) {
    toast.error('请输入标题')
    return
  }
  if (!content.value.trim()) {
    toast.error('请输入内容')
    return
  }

  isSaving.value = true
  await nextTick()
  try {
    if (isEditMode.value) {
      const uploadedIds = await uploadPendingFiles(memoId.value)
      // 一次 updateMemo 写 attachments；服务端反写 files.memoId（含库内选用/解绑）
      const finalIds = [
        ...linkedAttachments.value.map((f) => f.id),
        ...uploadedIds,
      ]
      await memoStore.updateMemo(
        memoId.value,
        title.value,
        content.value,
        tags.value,
        finalIds
      )
      toast.success('保存成功')
    } else {
      // 先并行上传（不绑 memo，避免预分配 id 触发 guardMemoAccess 404）
      // → 单次 create（含 attachments）挂接，避免 create+PATCH 双写放大
      const newId = generateUUID()
      const uploadedIds = await uploadPendingFiles()
      const libraryIds = linkedAttachments.value.map((f) => f.id)
      const finalIds = [...libraryIds, ...uploadedIds]
      const newMemo = await memoStore.createMemo(
        authStore.currentUser.id,
        title.value,
        content.value,
        tags.value,
        { id: newId, attachments: finalIds }
      )
      if (!newMemo) {
        throw new Error('创建失败')
      }
      memoStore.clearDraft()
      toast.success('创建成功')
    }

    hasUnsavedChanges.value = false
    router.push('/memos')
  } catch (err) {
    console.error('保存备忘录失败:', err)
    toast.error('保存失败')
  } finally {
    isSaving.value = false
  }
}

const handleCancel = () => {
  if (hasUnsavedChanges.value) {
    if (!confirm('有未保存的更改，确定要离开吗？')) return
  }
  router.push('/memos')
}

watch(
  [title, content, tags],
  () => {
    hasUnsavedChanges.value = true
  },
  { deep: true }
)

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(async () => {
  await loadDatabaseTags()
  await loadMemo()
  hasUnsavedChanges.value = false
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.memo-edit-view {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--cyp-bg-muted);
}

.memo-edit-view *,
.memo-edit-view *::before,
.memo-edit-view *::after {
  box-sizing: border-box;
}

.action-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 12px;
  flex-shrink: 0;
  width: 100%;
  padding: 12px 16px;
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 10px;
  margin-bottom: 12px;
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--cyp-success);
}

.save-icon {
  font-size: 16px;
}

.save-text {
  font-size: 13px;
}

.right-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.edit-form {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.form-content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(280px, 1fr) auto;
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 10px;
  overflow: hidden;
}

.form-group {
  margin: 0;
  width: 100%;
  min-width: 0;
}

.form-group.editor-group {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}

.title-input {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 14px 16px 10px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--cyp-text);
  box-shadow: none;
}

.title-input:focus {
  outline: none;
  box-shadow: inset 0 -2px 0 var(--cyp-brand);
}

.title-input::placeholder {
  color: var(--cyp-text-muted);
  font-weight: 500;
}

.tags-section {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  width: auto;
  max-width: 100%;
  margin: 0 12px 10px;
  padding: 8px 10px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
}

.tags-label {
  flex-shrink: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.tags-container {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 153, 255, 0.12);
  color: var(--cyp-brand);
  border-radius: 16px;
  font-size: 14px;
}

.tag-remove {
  background: none;
  border: none;
  color: var(--cyp-brand);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.tag-remove:hover {
  background: rgba(0, 153, 255, 0.2);
}

.tag-input {
  flex: 1;
  min-width: 120px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 16px;
  font-size: 14px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
}

.tag-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.tag-input-wrapper {
  position: relative;
  flex: 0 1 180px;
  min-width: 120px;
}

.tag-input-wrapper .tag-input {
  width: 100%;
}

.tag-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.tag-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--cyp-text-secondary);
  transition: all 0.2s;
}

.tag-dropdown-item:hover,
.tag-dropdown-item.active {
  background: rgba(0, 153, 255, 0.12);
  color: var(--cyp-brand);
}

.tag-dropdown-item:first-child {
  border-radius: 8px 8px 0 0;
}

.tag-dropdown-item:last-child {
  border-radius: 0 0 8px 8px;
}

.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.suggestions-label {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.suggested-tag {
  padding: 4px 10px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  border-radius: 12px;
  font-size: 12px;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.suggested-tag:hover {
  background: rgba(0, 153, 255, 0.12);
  border-color: var(--cyp-brand);
  color: var(--cyp-brand);
}

.form-content > .form-group:last-child {
  margin-bottom: 0;
}

.attachments-section {
  margin: 0 14px 14px;
  padding: 12px 14px;
  background: var(--cyp-bg-muted);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  box-shadow: none;
}

.attachments-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.attachments-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
}

.attachments-actions {
  display: flex;
  gap: 8px;
}

.attachments-empty {
  font-size: 13px;
  color: var(--cyp-text-muted);
  padding: 8px 0;
}

.attachments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  transition: all 0.2s;
}

.attachment-badge {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(0, 153, 255, 0.12);
  color: var(--cyp-brand);
}

.attachment-badge.pending-badge {
  background: rgba(230, 162, 60, 0.15);
  color: var(--cyp-warning);
}

.library-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: 420px;
}

.library-filter {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-size: 14px;
}

.library-filter:focus {
  outline: none;
  border-color: var(--cyp-brand);
}

.library-loading,
.library-empty {
  padding: 24px;
  text-align: center;
  color: var(--cyp-text-muted);
  font-size: 14px;
}

.library-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
}

.library-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.library-item:hover,
.library-item.selected {
  background: rgba(0, 153, 255, 0.08);
  border-color: rgba(0, 153, 255, 0.25);
}

.library-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-used {
  flex-shrink: 0;
  font-size: 12px;
  color: #0077cc;
}

.library-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.attachment-item:hover {
  background: rgba(0, 153, 255, 0.12);
}

.attachment-icon {
  font-size: 20px;
}

.attachment-name {
  flex: 1;
  font-size: 14px;
  color: var(--cyp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.attachment-remove {
  background: none;
  border: none;
  color: var(--cyp-danger);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.attachment-remove:hover {
  background: rgba(245, 108, 108, 0.1);
}

/* 移动端：保持横排，只收紧间距；禁止整栏改纵向把布局打散 */
@media (max-width: 768px) {
  .action-bar {
    padding: 10px 12px;
  }

  .title-input {
    font-size: 20px;
    padding: 12px 14px 8px;
  }

  .tags-section {
    margin: 0 10px 10px;
  }

  .form-content {
    grid-template-rows: auto auto minmax(220px, 1fr) auto;
  }
}

/* 深色主题支持 */
</style>
