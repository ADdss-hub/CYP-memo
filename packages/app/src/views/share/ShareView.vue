<!--
  分享查看界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="share-view">
    <div class="share-container">
      <div class="share-brand">
        <h1 class="brand-title">CYP-memo</h1>
        <p class="brand-subtitle">查看分享的备忘录</p>
      </div>

      <Loading v-if="isLoading" />

      <div v-else-if="requiresPassword && !isUnlocked" class="password-form">
        <div class="form-icon">🔒</div>
        <h2 class="form-title">需要访问密码</h2>
        <p class="form-hint">此分享链接受密码保护，请输入密码访问</p>

        <div class="form-group">
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="请输入访问密码"
            @keyup.enter="handleUnlock"
          />
        </div>

        <div v-if="passwordError" class="error-message">
          {{ passwordError }}
        </div>

        <Button type="primary" class="unlock-button" :disabled="!password" @click="handleUnlock">
          解锁查看
        </Button>
      </div>

      <div v-else-if="error" class="error-container">
        <div class="error-icon">
          {{ error.includes('过期') ? '⏰' : '⚠️' }}
        </div>
        <h2 class="error-title">
          {{ error }}
        </h2>
        <p v-if="error.includes('过期')" class="error-hint">
          此分享链接已失效，请联系分享者重新生成链接
        </p>
        <p v-else-if="error.includes('不存在')" class="error-hint">链接可能已被撤销或不存在</p>
      </div>

      <div v-else-if="memo" class="memo-container">
        <div class="memo-toolbar">
          <span class="toolbar-hint">只读 · 访客可查看与复制</span>
          <div class="toolbar-actions">
            <button type="button" class="toolbar-text-btn" @click="handleCopyLink">复制链接</button>
            <button type="button" class="toolbar-text-btn" @click="handleCopyBody">复制正文</button>
          </div>
        </div>

        <div class="memo-layout">
          <article class="memo-article">
            <h1 class="memo-title">
              {{ memo.title || '无标题' }}
            </h1>

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

            <div v-if="memo.tags.length > 0" class="memo-tags">
              <span v-for="tag in memo.tags" :key="tag" class="tag">
                {{ tag }}
              </span>
            </div>

            <div class="divider" />

            <div class="memo-body" v-html="memo.content" />

            <div v-if="memo.attachments && memo.attachments.length > 0" class="attachments-notice">
              <div class="notice-icon">📎</div>
              <div class="notice-text">
                此备忘录包含 {{ memo.attachments.length }} 个附件，分享模式下暂不支持查看附件
              </div>
            </div>
          </article>

          <aside class="memo-aside" aria-label="评论与反馈">
            <h2 class="aside-title">评论与反馈</h2>
            <p class="aside-hint">选择一项反馈后可发表评论</p>

            <div class="feedback-group" role="radiogroup" aria-label="反馈">
              <label
                v-for="opt in feedbackOptions"
                :key="opt.value"
                class="feedback-option"
                :class="{ active: commentFeedback === opt.value }"
              >
                <input
                  v-model="commentFeedback"
                  type="radio"
                  name="share-feedback"
                  :value="opt.value"
                />
                {{ opt.label }}
              </label>
            </div>

            <input
              v-model="commentAuthor"
              type="text"
              class="comment-input"
              maxlength="40"
              placeholder="昵称（可选）"
            />
            <textarea
              v-model="commentContent"
              class="comment-textarea"
              maxlength="500"
              rows="3"
              placeholder="写一点看法（必填）"
            />
            <p v-if="commentError" class="comment-error">{{ commentError }}</p>
            <Button
              type="primary"
              class="comment-submit"
              :disabled="isSubmittingComment"
              @click="handleSubmitComment"
            >
              {{ isSubmittingComment ? '提交中...' : '发表评论' }}
            </Button>

            <div class="comment-list">
              <p v-if="commentsLoading" class="comment-empty">加载评论中...</p>
              <p v-else-if="comments.length === 0" class="comment-empty">暂无评论</p>
              <div v-for="c in comments" :key="c.id" class="comment-card">
                <div class="comment-head">
                  <strong>{{ c.authorName || '访客' }}</strong>
                  <span class="comment-feedback">{{ feedbackLabel(c.feedback) }}</span>
                </div>
                <p class="comment-body">{{ c.content }}</p>
                <time class="comment-time">{{ formatDate(c.createdAt) }}</time>
                <div v-if="c.replyContent" class="comment-reply">
                  <div class="reply-label">主人回复</div>
                  <p class="reply-body">{{ c.replyContent }}</p>
                  <time v-if="c.replyAt" class="comment-time">{{ formatDate(c.replyAt) }}</time>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div class="share-footer">
          <p class="footer-text">
            由 <strong>CYP-memo</strong> 分享 ·
            <a href="/" class="footer-link">创建你的备忘录</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Loading } from '../../components'
import { shareManager } from '@cyp-memo/shared'
import type { Memo, ShareCommentFeedback, ShareCommentItem } from '@cyp-memo/shared'

const route = useRoute()

const isLoading = ref(true)
const requiresPassword = ref(false)
const isUnlocked = ref(false)
const password = ref('')
const unlockedPassword = ref<string | undefined>(undefined)
const passwordError = ref('')
const error = ref('')
const memo = ref<Memo | null>(null)

const comments = ref<ShareCommentItem[]>([])
const commentsLoading = ref(false)
const commentFeedback = ref<ShareCommentFeedback | ''>('')
const commentAuthor = ref('')
const commentContent = ref('')
const commentError = ref('')
const isSubmittingComment = ref(false)

const feedbackOptions: Array<{ value: ShareCommentFeedback; label: string }> = [
  { value: 'helpful', label: '有帮助' },
  { value: 'neutral', label: '一般' },
  { value: 'improve', label: '需改进' },
]

const shareId = computed(() => route.params.id as string)

const wordCount = computed(() => {
  if (!memo.value) return 0
  const text = memo.value.content.replace(/<[^>]*>/g, '')
  return text.length
})

const feedbackLabel = (f: ShareCommentFeedback): string => {
  return feedbackOptions.find((o) => o.value === f)?.label || f
}

const copyText = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fallback */
    }
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
}

const loadComments = async () => {
  commentsLoading.value = true
  try {
    const result = await shareManager.listShareComments(shareId.value, unlockedPassword.value)
    if (result.success) {
      comments.value = result.comments || []
    }
  } catch (err) {
    console.error('加载评论失败:', err)
  } finally {
    commentsLoading.value = false
  }
}

const loadShare = async () => {
  isLoading.value = true
  error.value = ''

  try {
    const result = await shareManager.accessShareLink(shareId.value)

    if (!result.success) {
      if (result.requiresPassword) {
        requiresPassword.value = true
        passwordError.value = result.error || ''
      } else {
        error.value = result.error || '访问失败'
      }
    } else {
      memo.value = result.memo || null
      isUnlocked.value = true
      unlockedPassword.value = undefined
      await loadComments()
    }
  } catch (err) {
    console.error('加载分享失败:', err)
    error.value = '加载失败，请重试'
  } finally {
    isLoading.value = false
  }
}

const handleUnlock = async () => {
  if (!password.value) {
    passwordError.value = '请输入密码'
    return
  }

  isLoading.value = true
  passwordError.value = ''

  try {
    const result = await shareManager.accessShareLink(shareId.value, password.value)

    if (!result.success) {
      passwordError.value = result.error || '密码错误'
    } else {
      memo.value = result.memo || null
      isUnlocked.value = true
      requiresPassword.value = false
      unlockedPassword.value = password.value
      await loadComments()
    }
  } catch (err) {
    console.error('解锁失败:', err)
    passwordError.value = '解锁失败，请重试'
  } finally {
    isLoading.value = false
  }
}

const handleCopyLink = async () => {
  const ok = await shareManager.copyShareLinkToClipboard(shareId.value)
  if (!ok) {
    commentError.value = '复制链接失败'
  }
}

const handleCopyBody = async () => {
  if (!memo.value) return
  const plain = memo.value.content.replace(/<[^>]*>/g, '')
  const text = `${memo.value.title || '无标题'}\n\n${plain}`
  const ok = await copyText(text)
  if (!ok) {
    commentError.value = '复制正文失败'
  }
}

const handleSubmitComment = async () => {
  commentError.value = ''
  if (!commentFeedback.value) {
    commentError.value = '请选择反馈：有帮助 / 一般 / 需改进'
    return
  }
  const content = commentContent.value.trim()
  if (!content) {
    commentError.value = '请填写评论内容'
    return
  }

  isSubmittingComment.value = true
  try {
    const result = await shareManager.createShareComment(shareId.value, {
      content,
      feedback: commentFeedback.value,
      authorName: commentAuthor.value.trim() || undefined,
      password: unlockedPassword.value,
    })
    if (!result.success) {
      commentError.value = result.error || '发表失败'
      return
    }
    commentContent.value = ''
    commentAuthor.value = ''
    commentFeedback.value = ''
    await loadComments()
  } catch (err) {
    console.error('发表评论失败:', err)
    commentError.value = '发表失败，请重试'
  } finally {
    isSubmittingComment.value = false
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

onMounted(async () => {
  await loadShare()
})
</script>

<style scoped>
.share-view {
  min-height: 100vh;
  background: var(--cyp-bg-page);
  padding: 40px 20px;
}

.share-container {
  max-width: 1120px;
  margin: 0 auto;
}

.share-brand {
  text-align: center;
  margin-bottom: 28px;
}

.brand-title {
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
  font-family: var(--cyp-font-sans);
}

.brand-subtitle {
  font-size: 1rem;
  color: var(--cyp-text-muted);
  margin: 0;
}

.password-form,
.error-container {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 12px;
  padding: 48px;
  text-align: center;
}

.form-icon,
.error-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.form-title,
.error-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 12px 0;
}

.form-hint,
.error-hint {
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
  margin: 0 0 24px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  font-size: 1rem;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-family: var(--cyp-font-sans);
}

.form-input:focus {
  outline: none;
  border-color: var(--cyp-brand);
  box-shadow: 0 0 0 3px var(--cyp-brand-tint);
}

.error-message,
.comment-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(245, 108, 108, 0.12);
  border: 1px solid var(--cyp-danger, #f56c6c);
  border-radius: 6px;
  color: var(--cyp-danger, #f56c6c);
  font-size: 0.875rem;
}

.unlock-button,
.comment-submit {
  width: 100%;
}

.memo-container {
  background: var(--cyp-bg-card);
  border: 1px solid var(--cyp-border);
  border-radius: 12px;
  overflow: hidden;
}

.memo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--cyp-border);
  background: var(--cyp-bg-muted);
}

.toolbar-hint {
  font-size: 0.8125rem;
  color: var(--cyp-text-muted);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-text-btn {
  border: none;
  background: transparent;
  color: var(--cyp-brand);
  font-size: 0.875rem;
  font-family: var(--cyp-font-sans);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.toolbar-text-btn:hover {
  background: var(--cyp-brand-tint);
}

.memo-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: stretch;
}

.memo-article {
  padding: 36px 40px;
  min-width: 0;
}

.memo-aside {
  border-left: 1px solid var(--cyp-border);
  background: var(--cyp-bg-muted);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(72vh, 720px);
  overflow: hidden;
}

.aside-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--cyp-text);
}

.aside-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--cyp-text-muted);
}

.feedback-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.feedback-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--cyp-border);
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  background: var(--cyp-bg-input);
}

.feedback-option.active {
  border-color: var(--cyp-brand);
  color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

.feedback-option input {
  margin: 0;
}

.comment-input,
.comment-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cyp-border);
  border-radius: 6px;
  background: var(--cyp-bg-input);
  color: var(--cyp-text);
  font-family: var(--cyp-font-sans);
  font-size: 0.8125rem;
  padding: 8px 10px;
}

.comment-textarea {
  resize: vertical;
  min-height: 4.5rem;
}

.comment-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding-right: 2px;
}

.comment-empty {
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: var(--cyp-text-muted);
}

.comment-card {
  padding: 10px;
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
  background: var(--cyp-bg-card);
}

.comment-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--cyp-text);
}

.comment-feedback {
  color: var(--cyp-brand);
  white-space: nowrap;
}

.comment-body,
.reply-body {
  margin: 6px 0;
  font-size: 0.8125rem;
  color: var(--cyp-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-time {
  font-size: 0.7rem;
  color: var(--cyp-text-muted);
}

.comment-reply {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--cyp-border);
}

.reply-label {
  font-size: 0.7rem;
  color: var(--cyp-brand);
  margin-bottom: 2px;
}

.memo-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 20px 0;
  line-height: 1.4;
}

.memo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
}

.meta-icon {
  font-size: 1rem;
}

.memo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.tag {
  padding: 4px 12px;
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand);
  border-radius: 16px;
  font-size: 0.8125rem;
}

.divider {
  height: 1px;
  background: var(--cyp-border);
  margin: 24px 0;
}

.memo-body {
  font-size: 1rem;
  line-height: 1.8;
  color: var(--cyp-text);
  word-wrap: break-word;
}

.memo-body :deep(h1) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 28px 0 14px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cyp-border);
}

.memo-body :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 24px 0 12px 0;
}

.memo-body :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 20px 0 10px 0;
}

.memo-body :deep(p) {
  margin: 14px 0;
}

.memo-body :deep(ul),
.memo-body :deep(ol) {
  margin: 14px 0;
  padding-left: 28px;
}

.memo-body :deep(li) {
  margin: 6px 0;
}

.memo-body :deep(blockquote) {
  margin: 16px 0;
  padding: 10px 16px;
  border-left: 4px solid var(--cyp-brand);
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
}

.memo-body :deep(code) {
  padding: 2px 6px;
  background: var(--cyp-bg-muted);
  border-radius: 4px;
  font-family: var(--cyp-font-mono);
  font-size: 0.875rem;
}

.memo-body :deep(pre) {
  margin: 16px 0;
  padding: 16px;
  background: var(--cyp-bg-input);
  border-radius: 8px;
  overflow-x: auto;
}

.memo-body :deep(pre code) {
  padding: 0;
  background: none;
}

.memo-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px 0;
}

.memo-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.memo-body :deep(th),
.memo-body :deep(td) {
  padding: 10px;
  border: 1px solid var(--cyp-border);
  text-align: left;
}

.memo-body :deep(th) {
  background: var(--cyp-bg-muted);
  font-weight: 600;
}

.memo-body :deep(a) {
  color: var(--cyp-brand);
  text-decoration: none;
}

.memo-body :deep(ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
  margin: 14px 0;
}

.memo-body :deep(ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0;
}

.memo-body :deep(ul[data-type='taskList'] li > label) {
  flex-shrink: 0;
  margin-top: 0.2em;
}

.memo-body :deep(ul[data-type='taskList'] li > div) {
  flex: 1;
  min-width: 0;
}

.memo-body :deep(ul[data-type='taskList'] li[data-checked='true'] > div) {
  color: var(--cyp-text-muted);
  text-decoration: line-through;
}

.memo-body :deep(mark) {
  border-radius: 2px;
  padding: 0 2px;
  background: var(--cyp-brand-tint);
  color: inherit;
}

.memo-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--cyp-border);
  margin: 20px 0;
}

.memo-body :deep(sub) {
  font-size: 0.75em;
  vertical-align: sub;
}

.memo-body :deep(sup) {
  font-size: 0.75em;
  vertical-align: super;
}

.attachments-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding: 14px;
  background: var(--cyp-brand-tint);
  border: 1px solid var(--cyp-border);
  border-radius: 8px;
}

.notice-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.notice-text {
  font-size: 0.875rem;
  color: var(--cyp-text-secondary);
  line-height: 1.6;
}

.share-footer {
  padding: 18px 24px;
  background: var(--cyp-bg-muted);
  border-top: 1px solid var(--cyp-border);
  text-align: center;
}

.footer-text {
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
  margin: 0;
}

.footer-link {
  color: var(--cyp-brand);
  text-decoration: none;
  font-weight: 500;
}

@media (max-width: 900px) {
  .memo-layout {
    grid-template-columns: 1fr;
  }

  .memo-aside {
    border-left: none;
    border-top: 1px solid var(--cyp-border);
    max-height: none;
  }

  .memo-article {
    padding: 28px 20px;
  }

  .memo-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 768px) {
  .share-view {
    padding: 20px 12px;
  }

  .brand-title {
    font-size: 1.75rem;
  }

  .password-form,
  .error-container {
    padding: 28px 20px;
  }

  .memo-title {
    font-size: 1.35rem;
  }
}
</style>
