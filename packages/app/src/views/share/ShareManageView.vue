<!--
  分享管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="share-manage-view">
      <div class="header">
        <div class="header-left">
          <Button type="text" @click="handleBack">
            <span class="back-icon">←</span> 返回
          </Button>
          <h1>分享管理</h1>
        </div>
        <Button type="primary" @click="handleRefresh"> 🔄 刷新 </Button>
      </div>

      <Loading v-if="isLoading" />

      <div v-else-if="shareLinks.length === 0" class="empty-state">
        <div class="empty-icon">🔗</div>
        <p class="empty-text">暂无分享链接</p>
        <p class="empty-hint">在备忘录详情页点击"分享"按钮创建分享链接</p>
      </div>

      <div v-else class="share-list">
        <div
          v-for="share in shareLinks"
          :key="share.id"
          class="share-card"
          :class="{ expired: !isShareValid(share) }"
        >
          <div class="share-header">
            <div class="share-info">
              <h3 class="share-title">
                {{ getMemoTitle(share.memoId) }}
              </h3>
              <div class="share-meta">
                <span class="meta-item">
                  <span class="meta-icon">📅</span>
                  创建于 {{ formatDate(share.createdAt) }}
                </span>
                <span v-if="share.expiresAt" class="meta-item">
                  <span class="meta-icon">⏰</span>
                  {{ isShareValid(share) ? '过期于' : '已过期于' }}
                  {{ formatDate(share.expiresAt) }}
                </span>
                <span v-else class="meta-item">
                  <span class="meta-icon">♾️</span>
                  永久有效
                </span>
                <span class="meta-item">
                  <span class="meta-icon">👁️</span>
                  访问 {{ share.accessCount }} 次
                </span>
                <span v-if="share.hasPassword || share.password" class="meta-item">
                  <span class="meta-icon">🔒</span>
                  需要密码
                </span>
              </div>
            </div>
            <div class="share-actions">
              <Button v-if="isShareValid(share)" type="text" @click="handleCopyLink(share.id)">
                📋 复制链接
              </Button>
              <Button v-if="isShareValid(share)" type="text" @click="handleViewShare(share.id)">
                👁️ 预览
              </Button>
              <Button type="text" class="danger-text" @click="handleRevoke(share.id)">
                🗑️ 撤销
              </Button>
            </div>
          </div>

          <div v-if="isShareValid(share)" class="share-link">
            <input
              :value="getShareUrl(share.id)"
              readonly
              class="link-input"
              @click="handleSelectLink"
            />
          </div>

          <div class="comments-panel">
            <button
              type="button"
              class="comments-toggle"
              :aria-expanded="isCommentsExpanded(share.id)"
              @click="toggleComments(share.id)"
            >
              <span>
                访客反馈
                {{ commentCount(share.id) }} 条
                · 有帮助 {{ feedbackCount(share.id, 'helpful') }}
                · 一般 {{ feedbackCount(share.id, 'neutral') }}
                · 需改进 {{ feedbackCount(share.id, 'improve') }}
              </span>
              <span class="toggle-chevron">{{ isCommentsExpanded(share.id) ? '收起' : '展开' }}</span>
            </button>

            <div v-if="isCommentsExpanded(share.id)" class="comments-body">
              <p v-if="commentsFor(share.id).length === 0" class="comments-empty">暂无访客评论</p>
              <div
                v-for="c in commentsFor(share.id)"
                :key="c.id"
                class="comment-item"
              >
                <div class="comment-item-head">
                  <strong>{{ c.authorName || '访客' }}</strong>
                  <span class="feedback-tag">{{ feedbackLabel(c.feedback) }}</span>
                  <time>{{ formatDate(c.createdAt) }}</time>
                </div>
                <p class="comment-item-body">{{ c.content }}</p>
                <div v-if="c.replyContent" class="owner-reply">
                  <div class="owner-reply-label">已回复</div>
                  <p>{{ c.replyContent }}</p>
                  <time v-if="c.replyAt">{{ formatDate(c.replyAt) }}</time>
                </div>
                <div v-else class="reply-box">
                  <textarea
                    v-model="replyDrafts[c.id]"
                    class="reply-input"
                    rows="2"
                    maxlength="500"
                    placeholder="回复访客（1-500 字）"
                  />
                  <Button
                    type="primary"
                    :disabled="isReplying === c.id"
                    @click="handleReply(share.id, c.id)"
                  >
                    {{ isReplying === c.id ? '发送中...' : '回复' }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="shareLinks.length > 0" class="batch-actions">
        <Button type="primary" @click="handleCleanExpired"> 🧹 清理过期链接 </Button>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useMemoStore } from '../../stores/memo'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading } from '../../components'
import { shareManager } from '@cyp-memo/shared'
import { ElMessageBox } from 'element-plus'
import type { ShareCommentFeedback, ShareCommentItem, ShareLink } from '@cyp-memo/shared'

const router = useRouter()
const authStore = useAuthStore()
const memoStore = useMemoStore()
const toast = useToast()

const isLoading = ref(false)
const shareLinks = ref<ShareLink[]>([])
const comments = ref<ShareCommentItem[]>([])
const expandedShareIds = ref<Set<string>>(new Set())
const replyDrafts = ref<Record<string, string>>({})
const isReplying = ref<string | null>(null)

const feedbackLabel = (f: ShareCommentFeedback): string => {
  if (f === 'helpful') return '有帮助'
  if (f === 'neutral') return '一般'
  if (f === 'improve') return '需改进'
  return f
}

const commentsFor = (shareId: string): ShareCommentItem[] =>
  comments.value.filter((c) => c.shareId === shareId)

const commentCount = (shareId: string): number => commentsFor(shareId).length

const feedbackCount = (shareId: string, f: ShareCommentFeedback): number =>
  commentsFor(shareId).filter((c) => c.feedback === f).length

const isCommentsExpanded = (shareId: string): boolean => expandedShareIds.value.has(shareId)

const toggleComments = (shareId: string) => {
  const next = new Set(expandedShareIds.value)
  if (next.has(shareId)) next.delete(shareId)
  else next.add(shareId)
  expandedShareIds.value = next
}

const loadShareLinks = async () => {
  isLoading.value = true
  try {
    const userId = authStore.currentUser?.id
    if (!userId) {
      throw new Error('用户未登录')
    }

    shareLinks.value = await shareManager.getUserShareLinks(userId)
    shareLinks.value.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    try {
      comments.value = await shareManager.listOwnerShareComments(userId)
    } catch (err) {
      console.error('加载分享评论失败:', err)
      comments.value = []
    }
  } catch (error) {
    console.error('加载分享链接失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    toast.error(`加载分享链接失败: ${errorMessage}，如有问题请联系系统管理员`)
  } finally {
    isLoading.value = false
  }
}

const isShareValid = (share: ShareLink): boolean => {
  return shareManager.isShareLinkValid(share)
}

const getMemoTitle = (memoId: string): string => {
  const memo = memoStore.memos.find((m) => m.id === memoId)
  return memo?.title || '无标题备忘录'
}

const getShareUrl = (shareId: string): string => {
  return shareManager.generateShareUrl(shareId)
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

const handleRefresh = async () => {
  await loadShareLinks()
  toast.success('刷新成功')
}

const handleCopyLink = async (shareId: string) => {
  const success = await shareManager.copyShareLinkToClipboard(shareId)
  if (success) {
    toast.success('链接已复制到剪贴板')
  } else {
    toast.error('复制失败')
  }
}

const handleSelectLink = (event: Event) => {
  const input = event.target as HTMLInputElement
  input.select()
}

const handleViewShare = (shareId: string) => {
  const url = `/share/${shareId}`
  window.open(url, '_blank')
}

const handleRevoke = async (shareId: string) => {
  try {
    await ElMessageBox.confirm('确定要撤销这个分享链接吗？撤销后链接将失效。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    const userId = authStore.currentUser?.id
    if (!userId) {
      throw new Error('用户未登录')
    }

    await shareManager.revokeShareLink(shareId, userId)
    toast.success('撤销成功')
    await loadShareLinks()
  } catch (error) {
    console.error('撤销分享链接失败:', error)
    toast.error('撤销失败')
  }
}

const handleReply = async (shareId: string, commentId: string) => {
  const content = (replyDrafts.value[commentId] || '').trim()
  if (!content || content.length > 500) {
    toast.error('回复内容须为 1-500 字')
    return
  }
  isReplying.value = commentId
  try {
    const updated = await shareManager.replyShareComment(shareId, commentId, content)
    comments.value = comments.value.map((c) => (c.id === commentId ? updated : c))
    replyDrafts.value = { ...replyDrafts.value, [commentId]: '' }
    toast.success('回复成功')
  } catch (error) {
    console.error('回复失败:', error)
    const msg = error instanceof Error ? error.message : '回复失败'
    toast.error(msg)
  } finally {
    isReplying.value = null
  }
}

const handleCleanExpired = async () => {
  try {
    await ElMessageBox.confirm('确定要清理所有过期的分享链接吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    const count = await shareManager.cleanExpiredShareLinks()
    if (count > 0) {
      toast.success(`已清理 ${count} 个过期链接`)
      await loadShareLinks()
    } else {
      toast.info('没有过期的链接')
    }
  } catch (error) {
    console.error('清理过期链接失败:', error)
    const msg = error instanceof Error ? error.message : '清理失败'
    toast.error(msg)
  }
}

const handleBack = () => {
  router.back()
}

onMounted(async () => {
  try {
    await loadShareLinks()

    const userId = authStore.currentUser?.id
    if (userId) {
      try {
        await memoStore.loadMemos(userId)
      } catch (error) {
        console.error('加载备忘录列表失败:', error)
      }
    }
  } catch (error) {
    console.error('初始化失败:', error)
    toast.error('加载分享管理界面失败，请刷新重试')
  }
})
</script>

<style scoped>
.share-manage-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
  font-family: var(--cyp-font-sans);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--cyp-text-secondary);
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
  margin: 0;
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-card {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  padding: 20px;
  transition: box-shadow 0.2s;
  box-shadow: var(--cyp-chrome-shadow);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.share-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.share-card.expired {
  opacity: 0.65;
  background: var(--cyp-chrome-bg-soft);
}

.share-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;
}

.share-info {
  flex: 1;
}

.share-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 12px 0;
}

.share-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
}

.meta-icon {
  font-size: 1rem;
}

.share-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.danger-text {
  color: var(--cyp-danger, #f56c6c);
}

.share-link {
  margin-top: 12px;
}

.link-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: var(--cyp-font-mono);
  color: var(--cyp-text-secondary);
  background: var(--cyp-bg-muted);
  cursor: pointer;
}

.link-input:hover,
.link-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
  background: var(--cyp-bg-input);
}

.comments-panel {
  margin-top: 14px;
  border-top: 1px solid var(--cyp-border);
  padding-top: 12px;
}

.comments-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
  font-size: 0.8125rem;
  font-family: var(--cyp-font-sans);
  cursor: pointer;
  text-align: left;
}

.comments-toggle:hover {
  border-color: var(--cyp-brand);
  color: var(--cyp-brand);
}

.toggle-chevron {
  flex-shrink: 0;
  color: var(--cyp-brand);
}

.comments-body {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comments-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--cyp-text-muted);
}

.comment-item {
  padding: 12px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-input);
}

.comment-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--cyp-text);
}

.feedback-tag {
  color: var(--cyp-brand);
}

.comment-item-head time {
  margin-left: auto;
  color: var(--cyp-text-muted);
  font-size: 0.75rem;
}

.comment-item-body {
  margin: 8px 0;
  font-size: 0.875rem;
  color: var(--cyp-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.owner-reply {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--cyp-border);
}

.owner-reply-label {
  font-size: 0.75rem;
  color: var(--cyp-brand);
  margin-bottom: 4px;
}

.owner-reply p {
  margin: 0 0 4px;
  font-size: 0.8125rem;
  color: var(--cyp-text-secondary);
  white-space: pre-wrap;
}

.owner-reply time {
  font-size: 0.7rem;
  color: var(--cyp-text-muted);
}

.reply-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.reply-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-family: var(--cyp-font-sans);
  font-size: 0.8125rem;
  padding: 8px 10px;
  resize: vertical;
}

.batch-actions {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--cyp-border);
  display: flex;
  justify-content: center;
}

@media (max-width: 768px) {
  .share-manage-view {
    padding: 16px;
  }

  .header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .share-header {
    flex-direction: column;
  }

  .share-actions {
    justify-content: flex-start;
  }

  .share-meta {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
