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
            <span class="save-icon">✓</span>
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
                  <input
                    v-model="newTag"
                    type="text"
                    class="tag-input"
                    placeholder="添加标签..."
                    @keydown.enter="addTag"
                    @keydown.space="addTag"
                  />
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
          <div v-if="attachments.length > 0" class="form-group">
            <div class="attachments-section">
              <div class="attachments-label">附件 ({{ attachments.length }}):</div>
              <div class="attachments-list">
                <div v-for="(file, index) in attachments" :key="index" class="attachment-item">
                  <span class="attachment-icon">📎</span>
                  <span class="attachment-name">{{ file.name }}</span>
                  <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
                  <button class="attachment-remove" @click="removeAttachment(index)">×</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMemoStore } from '../../stores/memo'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading, MemoEditor } from '../../components'
import { fileManager } from '@cyp-memo/shared'

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
const attachments = ref<File[]>([])
const lastSaved = ref('')
const hasUnsavedChanges = ref(false)

// 计算属性
const isEditMode = computed(() => !!route.params.id)
const memoId = computed(() => route.params.id as string)

// 标签建议（基于已有标签）
const suggestedTags = computed(() => {
  const allTags = memoStore.allTags
  return allTags.filter((tag) => !tags.value.includes(tag)).slice(0, 5)
})

// 方法
const loadMemo = async () => {
  if (!isEditMode.value) {
    // 新建模式，尝试加载草稿
    const draft = await memoStore.getDraft()
    if (draft) {
      content.value = draft
      toast.info('已恢复草稿')
    }
    return
  }

  // 编辑模式，加载备忘录
  isLoading.value = true
  try {
    const memo = await memoStore.getMemo(memoId.value)
    if (memo) {
      title.value = memo.title
      content.value = memo.content
      tags.value = [...memo.tags]
      // TODO: 加载附件
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

const handleTitleChange = () => {
  hasUnsavedChanges.value = true
}

const addTag = (event?: KeyboardEvent) => {
  if (event) {
    event.preventDefault()
  }

  const tag = newTag.value.trim()
  if (!tag) return

  // 验证标签名称
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
    // 验证文件大小（10GB）
    const maxSize = 10 * 1024 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('文件大小不能超过 10GB')
      return
    }

    attachments.value.push(file)
    hasUnsavedChanges.value = true
    toast.success(`已添加附件: ${file.name}`)
  } catch (err) {
    console.error('文件上传失败:', err)
    toast.error('文件上传失败')
  }
}

const removeAttachment = (index: number) => {
  attachments.value.splice(index, 1)
  hasUnsavedChanges.value = true
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
    // 新建模式，保存草稿
    memoStore.saveDraft(html)
    lastSaved.value = '草稿已保存'
    setTimeout(() => {
      lastSaved.value = ''
    }, 3000)
  } else {
    // 编辑模式，自动保存
    lastSaved.value = '自动保存中...'
    setTimeout(() => {
      lastSaved.value = '已自动保存'
      setTimeout(() => {
        lastSaved.value = ''
      }, 3000)
    }, 500)
  }
}

const handleSave = async () => {
  if (!authStore.currentUser) {
    toast.error('请先登录')
    return
  }

  // 验证
  if (!title.value.trim()) {
    toast.error('请输入标题')
    return
  }

  if (!content.value.trim()) {
    toast.error('请输入内容')
    return
  }

  isSaving.value = true
  try {
    // 上传附件
    const uploadedFileIds: string[] = []
    for (const file of attachments.value) {
      try {
        // 编辑模式时传递 memoId，新建模式时先不传
        const metadata = await fileManager.uploadFile(
          authStore.currentUser.id, 
          file, 
          isEditMode.value ? memoId.value : undefined
        )
        uploadedFileIds.push(metadata.id)
      } catch (err) {
        console.error('上传附件失败:', file.name, err)
        toast.warning(`附件 ${file.name} 上传失败`)
      }
    }

    if (isEditMode.value) {
      // 更新备忘录
      await memoStore.updateMemo(memoId.value, title.value, content.value, tags.value)
      
      // 如果有新上传的附件，更新备忘录的附件列表
      if (uploadedFileIds.length > 0) {
        const currentMemo = await memoStore.getMemo(memoId.value)
        if (currentMemo) {
          const newAttachments = [...(currentMemo.attachments || []), ...uploadedFileIds]
          await memoStore.updateMemo(memoId.value, title.value, content.value, tags.value, newAttachments)
        }
      }
      
      toast.success('保存成功')
    } else {
      // 创建备忘录
      const newMemo = await memoStore.createMemo(authStore.currentUser.id, title.value, content.value, tags.value)
      
      // 如果有上传的附件，更新文件的 memoId 并更新备忘录的附件列表
      if (uploadedFileIds.length > 0 && newMemo) {
        // 更新每个文件的 memoId
        for (const fileId of uploadedFileIds) {
          try {
            await fileManager.updateFileMemo(fileId, newMemo.id)
          } catch (err) {
            console.error('更新文件关联失败:', fileId, err)
          }
        }
        // 更新备忘录的附件列表
        await memoStore.updateMemo(newMemo.id, title.value, content.value, tags.value, uploadedFileIds)
      }
      
      // 清除草稿
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
    if (!confirm('有未保存的更改，确定要离开吗？')) {
      return
    }
  }
  router.push('/memos')
}

// 监听内容变化
watch(
  [title, content, tags],
  () => {
    hasUnsavedChanges.value = true
  },
  { deep: true }
)

// 页面离开前提示
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

// 生命周期
onMounted(async () => {
  await loadMemo()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

// 清理
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.memo-edit-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #67c23a;
}

.save-icon {
  font-size: 16px;
}

.save-text {
  font-size: 13px;
}

.right-actions {
  display: flex;
  gap: 12px;
}

.edit-form {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.form-content {
  max-width: 1200px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 24px;
}

.title-input {
  width: 100%;
  padding: 16px 20px;
  font-size: 24px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
}

.title-input:focus {
  outline: none;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.2);
}

.title-input::placeholder {
  color: #c0c4cc;
}

.tags-section {
  background: white;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tags-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.tags-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  background: #ecf5ff;
  color: #409eff;
  border-radius: 16px;
  font-size: 14px;
}

.tag-remove {
  background: none;
  border: none;
  color: #409eff;
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
  background: rgba(64, 158, 255, 0.2);
}

.tag-input {
  flex: 1;
  min-width: 120px;
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  font-size: 14px;
}

.tag-input:focus {
  outline: none;
  border-color: #409eff;
}

.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.suggestions-label {
  font-size: 12px;
  color: #909399;
}

.suggested-tag {
  padding: 4px 10px;
  background: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 12px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}

.suggested-tag:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.editor-group {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.attachments-section {
  background: white;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.attachments-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
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
  background: #f5f7fa;
  border-radius: 6px;
  transition: all 0.2s;
}

.attachment-item:hover {
  background: #ecf5ff;
}

.attachment-icon {
  font-size: 20px;
}

.attachment-name {
  flex: 1;
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 12px;
  color: #909399;
}

.attachment-remove {
  background: none;
  border: none;
  color: #f56c6c;
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

/* 移动端适配 */
@media (max-width: 768px) {
  .action-bar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .left-actions,
  .right-actions {
    justify-content: space-between;
  }

  .edit-form {
    padding: 16px;
  }

  .title-input {
    font-size: 20px;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .memo-edit-view {
  background: #141414;
}

[data-theme='dark'] .action-bar,
[data-theme='dark'] .title-input,
[data-theme='dark'] .tags-section,
[data-theme='dark'] .editor-group,
[data-theme='dark'] .attachments-section {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] .title-input {
  color: #cfd3dc;
}

[data-theme='dark'] .title-input::placeholder {
  color: #606266;
}

[data-theme='dark'] .tags-label,
[data-theme='dark'] .attachments-label,
[data-theme='dark'] .attachment-name {
  color: #cfd3dc;
}

[data-theme='dark'] .tag-chip {
  background: #337ecc;
  color: white;
}

[data-theme='dark'] .tag-remove {
  color: white;
}

[data-theme='dark'] .tag-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .suggested-tag {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .suggested-tag:hover {
  background: #337ecc;
  color: white;
}

[data-theme='dark'] .attachment-item {
  background: #262727;
}

[data-theme='dark'] .attachment-item:hover {
  background: #337ecc;
}
</style>
