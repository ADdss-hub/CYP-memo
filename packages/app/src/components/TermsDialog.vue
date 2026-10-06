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
        <p class="header-subtitle">请仔细阅读以下条款后继续使用（生效 {{ legalEffective }}）</p>
      </div>

      <!-- 内容区域 -->
      <div class="terms-content" ref="contentRef" @scroll="handleScroll">
        <!-- 欢迎卡片 -->
        <div class="welcome-card">
          <div class="welcome-icon">🎉</div>
          <div class="welcome-text">
            <h3>欢迎使用 CYP-memo 备忘录系统</h3>
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
              <span class="info-value">CYP-memo 备忘录系统</span>
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
import { TERMS_SECTIONS, LEGAL_EFFECTIVE_DATE } from '../content/legal'

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

// 与 /terms、页脚协议同源（2.0.0 现行能力；禁止再内嵌过期「禁止商业用途」文案）
const sections = TERMS_SECTIONS
const legalEffective = LEGAL_EFFECTIVE_DATE

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
.terms-dialog :deep(.el-dialog) {
  border-radius: 20px;
  overflow: hidden;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  box-shadow: var(--cyp-chrome-shadow), 0 25px 80px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.terms-dialog :deep(.el-dialog__header) {
  display: none;
}

.terms-dialog :deep(.el-dialog__body) {
  padding: 0;
  background: transparent;
}

.terms-wrapper {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

.terms-header {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  padding: 2rem 2.5rem;
  text-align: center;
  color: #ffffff;
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

.terms-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  max-height: 400px;
  background: var(--cyp-chrome-bg-soft);
}

.welcome-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--cyp-brand-tint);
  border: 1px solid var(--cyp-chrome-border);
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
  color: var(--cyp-brand-soft);
  margin: 0 0 0.25rem 0;
}

.welcome-text p {
  font-size: 0.875rem;
  color: var(--cyp-text-secondary);
  margin: 0;
}

.terms-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.terms-section {
  background: var(--cyp-chrome-bg-panel);
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: var(--cyp-chrome-shadow);
  border: 1px solid var(--cyp-chrome-border);
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
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0;
}

.section-content p {
  font-size: 0.9rem;
  color: var(--cyp-text-secondary);
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
  color: var(--cyp-text-secondary);
}

.list-icon {
  color: var(--cyp-success);
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-card {
  background: var(--cyp-chrome-bg-panel);
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1rem;
  box-shadow: var(--cyp-chrome-shadow);
  border: 1px solid var(--cyp-chrome-border);
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--cyp-border);
}

.info-icon {
  font-size: 1.25rem;
}

.info-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--cyp-text);
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
  color: var(--cyp-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 0.9rem;
  color: var(--cyp-text-secondary);
  font-weight: 500;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  border-radius: 6px;
  font-size: 0.8rem;
  width: fit-content;
}

.email-link {
  color: var(--cyp-brand);
}

.license-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: color-mix(in srgb, var(--cyp-warning) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--cyp-warning) 35%, var(--cyp-border));
  border-radius: 10px;
  margin-top: 1rem;
}

.license-icon {
  font-size: 1.25rem;
}

.license-text {
  font-size: 0.9rem;
  color: var(--cyp-warning);
}

.license-text strong {
  color: var(--cyp-warning-hover);
}

.terms-footer {
  padding: 1.5rem 2rem;
  background: var(--cyp-chrome-bg);
  border-top: 1px solid var(--cyp-chrome-border);
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
  background: color-mix(in srgb, var(--cyp-warning) 18%, transparent);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--cyp-warning);
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
  border: 2px solid var(--cyp-border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  background: var(--cyp-bg-input);
}

.checkbox-mark svg {
  width: 14px;
  height: 14px;
  opacity: 0;
  transform: scale(0);
  transition: all 0.2s ease;
  color: #ffffff;
}

.custom-checkbox.checked .checkbox-mark {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  border-color: transparent;
}

.custom-checkbox.checked .checkbox-mark svg {
  opacity: 1;
  transform: scale(1);
}

.checkbox-label {
  font-size: 0.95rem;
  color: var(--cyp-text);
  font-weight: 500;
}

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
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-muted);
}

.accept-button.enabled {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  box-shadow: 0 4px 15px var(--cyp-brand-tint-strong);
}

.accept-button.enabled:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--cyp-brand-tint-strong);
}

.accept-button:disabled {
  cursor: not-allowed;
}

.button-icon {
  font-size: 1.25rem;
}

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
