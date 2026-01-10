<!--
  备忘录详情页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="memo-detail-view">
      <Loading v-if="isLoading" />

      <div v-else-if="error" class="error-container">
        <div class="error-icon">⚠️</div>
        <p class="error-message">
          {{ error }}
        </p>
        <Button type="primary" @click="handleBack"> 返回列表 </Button>
      </div>

      <div v-else-if="memo" class="detail-container">
        <!-- 顶部操作栏 -->
        <div class="action-bar">
          <div class="left-actions">
            <Button type="text" @click="handleBack"> ← 返回 </Button>
          </div>
          <div class="right-actions">
            <Button type="default" @click="handleShare"> 🔗 分享 </Button>
            <Button type="default" @click="handleEdit"> ✏️ 编辑 </Button>
            <Button type="danger" @click="handleDelete"> 🗑️ 删除 </Button>
          </div>
        </div>

        <!-- 备忘录内容 -->
        <div class="memo-content-wrapper">
          <article class="memo-article">
            <!-- 标题 -->
            <h1 class="memo-title">
              {{ memo.title || '无标题' }}
            </h1>

            <!-- 元信息 -->
            <div class="memo-meta">
              <div class="meta-item">
                <span class="meta-icon">📅</span>
                <span class="meta-text">创建于 {{ formatDate(memo.createdAt) }}</span>
              </div>
              <div v-if="memo.updatedAt !== memo.createdAt" class="meta-item">
                <span class="meta-icon">🔄</span>
                <span class="meta-text">更新于 {{ formatDate(memo.updatedAt) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-icon">📝</span>
                <span class="meta-text">{{ wordCount }} 字</span>
              </div>
            </div>

            <!-- 标签 -->
            <div v-if="memo.tags.length > 0" class="memo-tags">
              <span v-for="tag in memo.tags" :key="tag" class="tag" @click="handleTagClick(tag)">
                {{ tag }}
              </span>
            </div>

            <!-- 分隔线 -->
            <div class="divider" />

            <!-- 正文内容 (Markdown 渲染) -->
            <div class="memo-body" v-html="renderedContent" />

            <!-- 附件列表 -->
            <div v-if="memo.attachments && memo.attachments.length > 0" class="attachments-section">
              <h3 class="attachments-title">附件 ({{ memo.attachments.length }})</h3>
              <div class="attachments-grid">
                <div
                  v-for="(attachmentId, index) in memo.attachments"
                  :key="attachmentId"
                  class="attachment-card"
                  @click="handleAttachmentClick(attachmentId)"
                >
                  <div class="attachment-icon">📎</div>
                  <div class="attachment-info">
                    <div class="attachment-name">附件 {{ index + 1 }}</div>
                    <div class="attachment-action">点击查看</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- 分享对话框 -->
      <Modal 
        v-model="showShareDialog" 
        :title="shareLink ? '分享链接已生成' : '分享备忘录'"
        :show-footer="false"
        @close="handleCloseShareDialog"
      >
        <div class="share-dialog">
          <div v-if="!shareLink" class="share-options">
            <div class="share-option">
              <label>有效期:</label>
              <select v-model="shareExpiry" class="share-select">
                <option value="1">1 天</option>
                <option value="7">7 天</option>
                <option value="30">30 天</option>
                <option value="0">永久</option>
              </select>
            </div>
            <div class="share-option">
              <label>访问密码:</label>
              <input
                v-model="sharePassword"
                type="text"
                class="share-input"
                placeholder="可选，留空表示无需密码"
              />
            </div>
            <div class="share-actions">
              <Button type="default" @click="showShareDialog = false"> 取消 </Button>
              <Button
                type="primary"
                :disabled="isGeneratingShare"
                @click="handleGenerateShareLink"
              >
                {{ isGeneratingShare ? '生成中...' : '生成链接' }}
              </Button>
            </div>
          </div>

          <div v-else class="share-result">
            <p class="share-success">✅ 分享链接已生成</p>
            <div class="share-link-box">
              <input
                :value="shareUrl"
                readonly
                class="share-link-input"
                @click="handleSelectShareLink"
              />
              <Button type="primary" @click="handleCopyShareLink"> 📋 复制 </Button>
            </div>
            <div class="share-info">
              <p v-if="shareExpiry !== '0'" class="info-item">⏰ 有效期: {{ shareExpiry }} 天</p>
              <p v-else class="info-item">♾️ 永久有效</p>
              <p v-if="sharePassword" class="info-item">🔒 需要密码访问</p>
              <p v-else class="info-item">🔓 无需密码</p>
            </div>
            <div class="share-actions">
              <Button type="primary" @click="handleCloseShareDialog"> 完成 </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMemoStore } from '../../stores/memo'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading, Modal } from '../../components'
import { shareManager } from '@cyp-memo/shared'
import type { Memo, ShareLink } from '@cyp-memo/shared'

const router = useRouter()
const route = useRoute()
const memoStore = useMemoStore()
const authStore = useAuthStore()
const toast = useToast()

// 状态
const isLoading = ref(false)
const error = ref<string | null>(null)
const memo = ref<Memo | null>(null)
const showShareDialog = ref(false)
const shareExpiry = ref('7')
const sharePassword = ref('')
const isGeneratingShare = ref(false)
const shareLink = ref<ShareLink | null>(null)
const shareUrl = ref('')

// 计算属性
const memoId = computed(() => route.params.id as string)

const renderedContent = computed(() => {
  if (!memo.value) return ''
  // 直接返回 HTML 内容（已经是富文本格式）
  return memo.value.content
})

const wordCount = computed(() => {
  if (!memo.value) return 0
  // 移除 HTML 标签后计算字数
  const text = memo.value.content.replace(/<[^>]*>/g, '')
  return text.length
})

// 方法
const loadMemo = async () => {
  isLoading.value = true
  error.value = null

  try {
    const result = await memoStore.getMemo(memoId.value)
    if (result) {
      memo.value = result
    } else {
      error.value = '备忘录不存在'
    }
  } catch (err) {
    console.error('加载备忘录失败:', err)
    error.value = '加载失败，请重试'
  } finally {
    isLoading.value = false
  }
}

const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const handleBack = () => {
  router.push('/memos')
}

const handleEdit = () => {
  router.push(`/memos/${memoId.value}/edit`)
}

const handleDelete = async () => {
  if (!confirm('确定要删除这个备忘录吗？此操作无法撤销。')) {
    return
  }

  try {
    await memoStore.deleteMemo(memoId.value)
    toast.success('删除成功')
    router.push('/memos')
  } catch (err) {
    console.error('删除备忘录失败:', err)
    toast.error('删除失败')
  }
}

const handleShare = () => {
  // 重置分享对话框状态
  shareLink.value = null
  shareUrl.value = ''
  shareExpiry.value = '7'
  sharePassword.value = ''
  showShareDialog.value = true
}

const handleGenerateShareLink = async () => {
  if (!authStore.currentUser?.id) {
    toast.error('用户未登录')
    return
  }

  isGeneratingShare.value = true

  try {
    const expiryDays = parseInt(shareExpiry.value)
    const result = await shareManager.createShareLink({
      memoId: memoId.value,
      userId: authStore.currentUser.id,
      password: sharePassword.value || undefined,
      expiryDays: expiryDays > 0 ? expiryDays : undefined,
    })

    shareLink.value = result
    // 生成分享链接URL
    const generatedUrl = shareManager.generateShareUrl(result.id)
    shareUrl.value = generatedUrl
    
    console.log('分享链接已生成:', {
      shareId: result.id,
      shareUrl: generatedUrl,
      expiryDays: expiryDays > 0 ? expiryDays : '永久',
      hasPassword: !!sharePassword.value
    })
    
    toast.success('分享链接已生成')
  } catch (err) {
    console.error('生成分享链接失败:', err)
    toast.error('生成失败，请重试')
  } finally {
    isGeneratingShare.value = false
  }
}

const handleCopyShareLink = async () => {
  if (!shareLink.value) return

  const success = await shareManager.copyShareLinkToClipboard(shareLink.value.id)
  if (success) {
    toast.success('链接已复制到剪贴板')
  } else {
    toast.error('复制失败')
  }
}

const handleSelectShareLink = (event: Event) => {
  const input = event.target as HTMLInputElement
  input.select()
}

const handleCloseShareDialog = () => {
  showShareDialog.value = false
  // 延迟重置状态，避免关闭动画时看到状态变化
  setTimeout(() => {
    shareLink.value = null
    shareUrl.value = ''
  }, 300)
}

const handleTagClick = (tag: string) => {
  // 跳转到列表页并筛选该标签
  router.push({
    path: '/memos',
    query: { tag },
  })
}

const handleAttachmentClick = async (attachmentId: string) => {
  try {
    // TODO: 实现附件查看/下载
    toast.info('附件查看功能即将推出')
  } catch (err) {
    console.error('打开附件失败:', err)
    toast.error('打开附件失败')
  }
}

// 生命周期
onMounted(async () => {
  await loadMemo()
})
</script>

<style scoped>
.memo-detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 20px;
}

.error-icon {
  font-size: 64px;
}

.error-message {
  font-size: 16px;
  color: #f56c6c;
}

.detail-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.left-actions,
.right-actions {
  display: flex;
  gap: 12px;
}

.memo-content-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 40px 24px;
}

.memo-article {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 48px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.memo-title {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 24px 0;
  line-height: 1.4;
}

.memo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #909399;
}

.meta-icon {
  font-size: 16px;
}

.memo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

.tag {
  padding: 6px 14px;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  background: #409eff;
  color: white;
  transform: translateY(-2px);
}

.divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #e4e7ed, transparent);
  margin: 32px 0;
}

.memo-body {
  font-size: 16px;
  line-height: 1.8;
  color: #303133;
  word-wrap: break-word;
}

/* Markdown 样式 */
.memo-body :deep(h1) {
  font-size: 28px;
  font-weight: 700;
  margin: 32px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #e4e7ed;
}

.memo-body :deep(h2) {
  font-size: 24px;
  font-weight: 700;
  margin: 28px 0 14px 0;
}

.memo-body :deep(h3) {
  font-size: 20px;
  font-weight: 600;
  margin: 24px 0 12px 0;
}

.memo-body :deep(p) {
  margin: 16px 0;
}

.memo-body :deep(ul),
.memo-body :deep(ol) {
  margin: 16px 0;
  padding-left: 28px;
}

.memo-body :deep(li) {
  margin: 8px 0;
}

.memo-body :deep(blockquote) {
  margin: 20px 0;
  padding: 12px 20px;
  border-left: 4px solid #409eff;
  background: #f5f7fa;
  color: #606266;
}

.memo-body :deep(code) {
  padding: 2px 6px;
  background: #f5f7fa;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #e83e8c;
}

.memo-body :deep(pre) {
  margin: 20px 0;
  padding: 20px;
  background: #282c34;
  border-radius: 8px;
  overflow-x: auto;
}

.memo-body :deep(pre code) {
  padding: 0;
  background: none;
  color: #abb2bf;
}

.memo-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 20px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.memo-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.memo-body :deep(th),
.memo-body :deep(td) {
  padding: 12px;
  border: 1px solid #e4e7ed;
  text-align: left;
}

.memo-body :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
}

.memo-body :deep(a) {
  color: #409eff;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s;
}

.memo-body :deep(a:hover) {
  border-bottom-color: #409eff;
}

.attachments-section {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 1px solid #e4e7ed;
}

.attachments-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 20px;
}

.attachments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.attachment-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.attachment-card:hover {
  background: #ecf5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.attachment-icon {
  font-size: 32px;
}

.attachment-info {
  flex: 1;
}

.attachment-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.attachment-action {
  font-size: 12px;
  color: #409eff;
}

/* 分享对话框 */
.share-dialog {
  padding: 20px 0;
}

.share-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-option {
  display: flex;
  align-items: center;
  gap: 12px;
}

.share-option label {
  min-width: 80px;
  font-size: 14px;
  color: #606266;
}

.share-select,
.share-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}

.share-select:focus,
.share-input:focus {
  outline: none;
  border-color: #409eff;
}

.share-result {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-success {
  font-size: 16px;
  font-weight: 500;
  color: #67c23a;
  margin: 0;
  text-align: center;
}

.share-link-box {
  display: flex;
  gap: 8px;
}

.share-link-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  background: #f5f7fa;
  cursor: pointer;
}

.share-link-input:focus {
  outline: none;
  border-color: #409eff;
  background: white;
}

.share-info {
  padding: 12px;
  background: #f0f9ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}

.info-item {
  font-size: 14px;
  color: #1e40af;
  margin: 4px 0;
}

.share-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
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

  .memo-content-wrapper {
    padding: 20px 16px;
  }

  .memo-article {
    padding: 24px 20px;
  }

  .memo-title {
    font-size: 24px;
  }

  .memo-body {
    font-size: 15px;
  }

  .attachments-grid {
    grid-template-columns: 1fr;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .memo-detail-view {
  background: #141414;
}

[data-theme='dark'] .action-bar,
[data-theme='dark'] .memo-article {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] .memo-title,
[data-theme='dark'] .memo-body,
[data-theme='dark'] .attachments-title,
[data-theme='dark'] .attachment-name {
  color: #cfd3dc;
}

[data-theme='dark'] .memo-body :deep(h1) {
  border-bottom-color: #414243;
}

[data-theme='dark'] .memo-body :deep(blockquote) {
  background: #262727;
  color: #a8abb2;
}

[data-theme='dark'] .memo-body :deep(code) {
  background: #262727;
}

[data-theme='dark'] .memo-body :deep(th),
[data-theme='dark'] .memo-body :deep(td) {
  border-color: #414243;
}

[data-theme='dark'] .memo-body :deep(th) {
  background: #262727;
}

[data-theme='dark'] .tag {
  background: #337ecc;
  color: white;
}

[data-theme='dark'] .tag:hover {
  background: #409eff;
}

[data-theme='dark'] .divider {
  background: linear-gradient(to right, transparent, #414243, transparent);
}

[data-theme='dark'] .attachments-section {
  border-top-color: #414243;
}

[data-theme='dark'] .attachment-card {
  background: #262727;
}

[data-theme='dark'] .attachment-card:hover {
  background: #337ecc;
}

[data-theme='dark'] .share-select,
[data-theme='dark'] .share-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}
</style>
