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
                <span v-if="share.password" class="meta-item">
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
        </div>
      </div>

      <!-- 批量操作栏 -->
      <div v-if="shareLinks.length > 0" class="batch-actions">
        <Button type="primary" @click="handleCleanExpired"> 🧹 清理过期链接 </Button>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useMemoStore } from '../../stores/memo'
import { useToast } from '../../composables/useToast'
import { AppLayout, Button, Loading } from '../../components'
import { shareManager } from '@cyp-memo/shared'
import type { ShareLink } from '@cyp-memo/shared'

const router = useRouter()
const authStore = useAuthStore()
const memoStore = useMemoStore()
const toast = useToast()

// 状态
const isLoading = ref(false)
const shareLinks = ref<ShareLink[]>([])

// 方法
const loadShareLinks = async () => {
  isLoading.value = true
  try {
    const userId = authStore.currentUser?.id
    if (!userId) {
      throw new Error('用户未登录')
    }

    shareLinks.value = await shareManager.getUserShareLinks(userId)

    // 按创建时间倒序排序
    shareLinks.value.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
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
  if (!confirm('确定要撤销这个分享链接吗？撤销后链接将失效。')) {
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

const handleCleanExpired = async () => {
  if (!confirm('确定要清理所有过期的分享链接吗？')) {
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
    toast.error('清理失败')
  }
}

const handleBack = () => {
  router.back()
}

// 生命周期
onMounted(async () => {
  try {
    // 加载分享链接
    await loadShareLinks()
    
    // 加载备忘录列表（用于显示标题）
    const userId = authStore.currentUser?.id
    if (userId) {
      try {
        await memoStore.loadMemos(userId)
      } catch (error) {
        console.error('加载备忘录列表失败:', error)
        // 不影响分享链接的显示，继续执行
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
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin: 0;
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
  font-size: 18px;
  font-weight: 500;
  color: #606266;
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
}

.share-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.share-card.expired {
  opacity: 0.6;
  background: #f5f7fa;
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
  font-size: 18px;
  font-weight: 600;
  color: #303133;
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
  font-size: 14px;
  color: #909399;
}

.meta-icon {
  font-size: 16px;
}

.share-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.danger-text {
  color: #f56c6c;
}

.danger-text:hover {
  color: #f56c6c;
  background: #fef0f0;
}

.share-link {
  margin-top: 12px;
}

.link-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  color: #606266;
  background: #f5f7fa;
  cursor: pointer;
  transition: all 0.2s;
}

.link-input:hover {
  border-color: #409eff;
  background: white;
}

.link-input:focus {
  outline: none;
  border-color: #409eff;
  background: white;
}

.batch-actions {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  justify-content: center;
}

/* 移动端适配 */
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

/* 深色主题支持 */
[data-theme='dark'] h1,
[data-theme='dark'] .share-title {
  color: #cfd3dc;
}

[data-theme='dark'] .share-card {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] .share-card.expired {
  background: #262727;
}

[data-theme='dark'] .link-input {
  background: #262727;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .link-input:hover,
[data-theme='dark'] .link-input:focus {
  background: #1d1e1f;
}

[data-theme='dark'] .batch-actions {
  border-top-color: #414243;
}
</style>
