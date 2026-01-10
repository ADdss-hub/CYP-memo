<!--
  分享查看界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="share-view">
    <div class="share-container">
      <!-- Logo 和标题 -->
      <div class="share-brand">
        <h1 class="brand-title">CYP-memo</h1>
        <p class="brand-subtitle">查看分享的备忘录</p>
      </div>

      <!-- 加载状态 -->
      <Loading v-if="isLoading" />

      <!-- 密码验证 -->
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

      <!-- 错误状态 -->
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

      <!-- 备忘录内容 -->
      <div v-else-if="memo" class="memo-container">
        <div class="memo-header">
          <div class="readonly-badge">
            <span class="badge-icon">👁️</span>
            <span class="badge-text">只读模式</span>
          </div>
        </div>

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
            <span v-for="tag in memo.tags" :key="tag" class="tag">
              {{ tag }}
            </span>
          </div>

          <!-- 分隔线 -->
          <div class="divider" />

          <!-- 正文内容 -->
          <div class="memo-body" v-html="memo.content" />

          <!-- 附件提示 -->
          <div v-if="memo.attachments && memo.attachments.length > 0" class="attachments-notice">
            <div class="notice-icon">📎</div>
            <div class="notice-text">
              此备忘录包含 {{ memo.attachments.length }} 个附件，分享模式下暂不支持查看附件
            </div>
          </div>
        </article>

        <!-- 底部信息 -->
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
import type { Memo } from '@cyp-memo/shared'

const route = useRoute()

// 状态
const isLoading = ref(true)
const requiresPassword = ref(false)
const isUnlocked = ref(false)
const password = ref('')
const passwordError = ref('')
const error = ref('')
const memo = ref<Memo | null>(null)

// 计算属性
const shareId = computed(() => route.params.id as string)

const wordCount = computed(() => {
  if (!memo.value) return 0
  const text = memo.value.content.replace(/<[^>]*>/g, '')
  return text.length
})

// 方法
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
    }
  } catch (err) {
    console.error('解锁失败:', err)
    passwordError.value = '解锁失败，请重试'
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

// 生命周期
onMounted(async () => {
  await loadShare()
})
</script>

<style scoped>
.share-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.share-container {
  max-width: 900px;
  margin: 0 auto;
}

.share-brand {
  text-align: center;
  margin-bottom: 40px;
}

.brand-title {
  font-size: 48px;
  font-weight: 700;
  color: white;
  margin: 0 0 8px 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.brand-subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

/* 密码表单 */
.password-form {
  background: white;
  border-radius: 16px;
  padding: 48px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.form-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.form-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px 0;
}

.form-hint {
  font-size: 14px;
  color: #909399;
  margin: 0 0 32px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 2px solid #dcdfe6;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1);
}

.error-message {
  margin-bottom: 16px;
  padding: 12px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 6px;
  color: #f56c6c;
  font-size: 14px;
}

.unlock-button {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
}

/* 错误状态 */
.error-container {
  background: white;
  border-radius: 16px;
  padding: 64px 48px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.error-icon {
  font-size: 80px;
  margin-bottom: 24px;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px 0;
}

.error-hint {
  font-size: 14px;
  color: #909399;
  margin: 0;
  line-height: 1.6;
}

/* 备忘录内容 */
.memo-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.memo-header {
  padding: 20px 24px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}

.readonly-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 20px;
  font-size: 14px;
  color: #606266;
}

.badge-icon {
  font-size: 16px;
}

.memo-article {
  padding: 48px;
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

.attachments-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
  padding: 16px;
  background: #f0f9ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
}

.notice-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.notice-text {
  font-size: 14px;
  color: #1e40af;
  line-height: 1.6;
}

.share-footer {
  padding: 24px 48px;
  background: #f5f7fa;
  border-top: 1px solid #e4e7ed;
  text-align: center;
}

.footer-text {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.footer-link {
  color: #409eff;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.footer-link:hover {
  color: #66b1ff;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .share-view {
    padding: 20px 12px;
  }

  .brand-title {
    font-size: 36px;
  }

  .brand-subtitle {
    font-size: 16px;
  }

  .password-form,
  .error-container {
    padding: 32px 24px;
  }

  .memo-article,
  .share-footer {
    padding: 32px 24px;
  }

  .memo-title {
    font-size: 24px;
  }

  .memo-body {
    font-size: 15px;
  }

  .memo-meta {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
