<!--
  使用协议对话框组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
  全面更新版本 - 现代化设计
-->
<template>
  <el-dialog
    v-model="visible"
    title=""
    width="720px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    :class="['terms-dialog', { 'dark-mode': isDarkMode }]"
  >
    <div class="terms-wrapper">
      <!-- 头部区域 -->
      <div class="terms-header">
        <div class="header-icon">
          <div class="icon-bg">
            <span class="icon">📋</span>
          </div>
        </div>
        <h2 class="header-title">使用协议</h2>
        <p class="header-subtitle">请仔细阅读以下条款后继续使用</p>
      </div>

      <!-- 内容区域 -->
      <div class="terms-content" ref="contentRef" @scroll="handleScroll">
        <!-- 欢迎卡片 -->
        <div class="welcome-card">
          <div class="welcome-icon">🎉</div>
          <div class="welcome-text">
            <h3>欢迎使用 CYP-memo 容器备忘录系统</h3>
            <p>一款现代化、安全可靠的个人备忘录管理工具</p>
          </div>
        </div>

        <!-- 协议条款 -->
        <div class="terms-sections">
          <section class="terms-section" v-for="(section, index) in sections" :key="index">
            <div class="section-header">
              <span class="section-number">{{ index + 1 }}</span>
              <h4 class="section-title">{{ section.title }}</h4>
            </div>
            <div class="section-content">
              <p v-if="section.content">{{ section.content }}</p>
              <ul v-if="section.list" class="section-list">
                <li v-for="(item, i) in section.list" :key="i">
                  <span class="list-icon">✓</span>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <!-- 软件信息卡片 -->
        <div class="info-card">
          <div class="info-header">
            <span class="info-icon">ℹ️</span>
            <span class="info-title">软件信息</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">软件名称</span>
              <span class="info-value">CYP-memo 容器备忘录系统</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前版本</span>
              <span class="info-value version-badge">v{{ version }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">开发作者</span>
              <span class="info-value">{{ author }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">联系邮箱</span>
              <span class="info-value email-link">{{ email }}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">版权信息</span>
              <span class="info-value">{{ copyright }}</span>
            </div>
          </div>
        </div>

        <!-- 开源许可 -->
        <div class="license-badge">
          <span class="license-icon">📜</span>
          <span class="license-text">本软件采用 <strong>MIT 许可证</strong> 开源</span>
        </div>
      </div>

      <!-- 底部区域 -->
      <div class="terms-footer">
        <div class="scroll-hint" v-if="!hasScrolledToBottom">
          <span class="hint-icon">👇</span>
          <span>请滚动阅读完整协议</span>
        </div>
        
        <div class="agreement-section">
          <label class="custom-checkbox" :class="{ checked: agreed, disabled: !hasScrolledToBottom }">
            <input 
              type="checkbox" 
              v-model="agreed" 
              :disabled="!hasScrolledToBottom"
            />
            <span class="checkbox-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="checkbox-label">我已阅读并同意以上使用协议</span>
          </label>
        </div>

        <button 
          class="accept-button" 
          :class="{ enabled: agreed }"
          :disabled="!agreed"
          @click="handleAccept"
        >
          <span class="button-icon">🚀</span>
          <span class="button-text">同意并开始使用</span>
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { VERSION } from '@cyp-memo/shared'

const visible = ref(false)
const agreed = ref(false)
const hasScrolledToBottom = ref(false)
const contentRef = ref<HTMLElement | null>(null)

const TERMS_ACCEPTED_KEY = 'cyp-memo-terms-accepted'

// 从 VERSION 配置获取信息
const version = computed(() => VERSION.full)
const author = computed(() => VERSION.author)
const email = computed(() => VERSION.email)
const copyright = computed(() => VERSION.copyright)

// 检测深色模式
const isDarkMode = computed(() => {
  return document.documentElement.getAttribute('data-theme') === 'dark'
})

// 协议条款内容
const sections = [
  {
    title: '免责声明',
    content: '本软件按"原样"提供，不提供任何形式的明示或暗示保证，包括但不限于对适销性、特定用途的适用性和非侵权性的保证。在任何情况下，作者或版权持有人均不对任何索赔、损害或其他责任负责，无论这些追责来自合同、侵权或其它行为中，还是产生于、源于或有关于本软件以及本软件的使用或其它处置。'
  },
  {
    title: '使用条款',
    list: [
      '本软件仅供学习和个人使用',
      '禁止用于任何商业用途',
      '用户应遵守所在地区的法律法规',
      '用户对使用本软件产生的数据负责',
      '作者保留随时修改本使用条款的权利'
    ]
  },
  {
    title: '数据隐私',
    content: '本软件将所有数据存储在您的本地环境中，不会未经授权上传到任何第三方服务器。您的数据完全由您自己控制和管理，我们尊重并保护您的隐私权。'
  },
  {
    title: '安全承诺',
    list: [
      '采用现代化加密技术保护数据安全',
      '定期更新以修复潜在安全漏洞',
      '不收集任何个人敏感信息',
      '支持数据导出和备份功能'
    ]
  }
]

// 处理滚动事件
function handleScroll() {
  if (contentRef.value) {
    const { scrollTop, scrollHeight, clientHeight } = contentRef.value
    // 当滚动到底部附近时（允许10px的误差）
    hasScrolledToBottom.value = scrollTop + clientHeight >= scrollHeight - 10
  }
}

onMounted(() => {
  // 检查用户是否已经同意过使用协议
  const termsAccepted = localStorage.getItem(TERMS_ACCEPTED_KEY)
  if (!termsAccepted) {
    visible.value = true
    // 延迟检查内容是否需要滚动
    setTimeout(() => {
      if (contentRef.value) {
        const { scrollHeight, clientHeight } = contentRef.value
        // 如果内容不需要滚动，直接允许勾选
        if (scrollHeight <= clientHeight + 10) {
          hasScrolledToBottom.value = true
        }
      }
    }, 100)
  }
})

const handleAccept = () => {
  if (!agreed.value) return
  
  // 记录用户已同意使用协议
  localStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
  localStorage.setItem('cyp-memo-terms-accepted-date', new Date().toISOString())
  visible.value = false
}
</script>

<style scoped>
/* 对话框基础样式 */
.terms-dialog :deep(.el-dialog) {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
}

.terms-dialog :deep(.el-dialog__header) {
  display: none;
}

.terms-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.terms-wrapper {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

/* 头部区域 */
.terms-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem 2.5rem;
  text-align: center;
  color: white;
}

.header-icon {
  margin-bottom: 1rem;
}

.icon-bg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.icon {
  font-size: 2rem;
}

.header-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  letter-spacing: 0.5px;
}

.header-subtitle {
  font-size: 0.95rem;
  opacity: 0.9;
  margin: 0;
}

/* 内容区域 */
.terms-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  max-height: 400px;
  background: #fafbfc;
}

/* 欢迎卡片 */
.welcome-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: linear-gradient(135deg, #e0e7ff 0%, #f0e6ff 100%);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.welcome-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.welcome-text h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #4338ca;
  margin: 0 0 0.25rem 0;
}

.welcome-text p {
  font-size: 0.875rem;
  color: #6366f1;
  margin: 0;
}

/* 协议条款 */
.terms-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.terms-section {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e5e7eb;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.section-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.section-content p {
  font-size: 0.9rem;
  color: #4b5563;
  line-height: 1.7;
  margin: 0;
}

.section-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #4b5563;
}

.list-icon {
  color: #10b981;
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 信息卡片 */
.info-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e5e7eb;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.info-icon {
  font-size: 1.25rem;
}

.info-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-item.full-width {
  grid-column: span 2;
}

.info-label {
  font-size: 0.75rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 0.9rem;
  color: #374151;
  font-weight: 500;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 6px;
  font-size: 0.8rem;
  width: fit-content;
}

.email-link {
  color: #667eea;
}

/* 开源许可徽章 */
.license-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 10px;
  margin-top: 1rem;
}

.license-icon {
  font-size: 1.25rem;
}

.license-text {
  font-size: 0.9rem;
  color: #92400e;
}

.license-text strong {
  color: #78350f;
}

/* 底部区域 */
.terms-footer {
  padding: 1.5rem 2rem;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.scroll-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #fef3c7;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #92400e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.hint-icon {
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}

/* 自定义复选框 */
.agreement-section {
  display: flex;
  justify-content: center;
}

.custom-checkbox {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.custom-checkbox.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.custom-checkbox input {
  display: none;
}

.checkbox-mark {
  width: 24px;
  height: 24px;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.checkbox-mark svg {
  width: 14px;
  height: 14px;
  opacity: 0;
  transform: scale(0);
  transition: all 0.2s ease;
  color: white;
}

.custom-checkbox.checked .checkbox-mark {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: transparent;
}

.custom-checkbox.checked .checkbox-mark svg {
  opacity: 1;
  transform: scale(1);
}

.checkbox-label {
  font-size: 0.95rem;
  color: #374151;
  font-weight: 500;
}

/* 确认按钮 */
.accept-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #e5e7eb;
  color: #9ca3af;
}

.accept-button.enabled {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.accept-button.enabled:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.accept-button:disabled {
  cursor: not-allowed;
}

.button-icon {
  font-size: 1.25rem;
}

/* 深色模式 */
.dark-mode .terms-content {
  background: #1f2937;
}

.dark-mode .welcome-card {
  background: linear-gradient(135deg, #312e81 0%, #4c1d95 100%);
}

.dark-mode .welcome-text h3 {
  color: #c7d2fe;
}

.dark-mode .welcome-text p {
  color: #a5b4fc;
}

.dark-mode .terms-section {
  background: #374151;
  border-color: #4b5563;
}

.dark-mode .section-title {
  color: #f9fafb;
}

.dark-mode .section-content p,
.dark-mode .section-list li {
  color: #d1d5db;
}

.dark-mode .info-card {
  background: #374151;
  border-color: #4b5563;
}

.dark-mode .info-header {
  border-bottom-color: #4b5563;
}

.dark-mode .info-title {
  color: #f9fafb;
}

.dark-mode .info-label {
  color: #9ca3af;
}

.dark-mode .info-value {
  color: #e5e7eb;
}

.dark-mode .license-badge {
  background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
}

.dark-mode .license-text {
  color: #fef3c7;
}

.dark-mode .license-text strong {
  color: #fde68a;
}

.dark-mode .terms-footer {
  background: #1f2937;
  border-top-color: #374151;
}

.dark-mode .scroll-hint {
  background: #78350f;
  color: #fef3c7;
}

.dark-mode .checkbox-label {
  color: #e5e7eb;
}

.dark-mode .checkbox-mark {
  border-color: #6b7280;
}

.dark-mode .accept-button {
  background: #4b5563;
  color: #9ca3af;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .terms-dialog :deep(.el-dialog) {
    width: 95% !important;
    margin: 0 auto;
  }

  .terms-header {
    padding: 1.5rem;
  }

  .header-title {
    font-size: 1.5rem;
  }

  .terms-content {
    padding: 1rem;
    max-height: 350px;
  }

  .welcome-card {
    flex-direction: column;
    text-align: center;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-item.full-width {
    grid-column: span 1;
  }

  .terms-footer {
    padding: 1rem;
  }
}
</style>
