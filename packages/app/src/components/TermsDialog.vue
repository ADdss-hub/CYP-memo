<!--
  使用协议对话框组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
  全面更新版本 - 现代化设计
-->
<template>
  <!-- 同意后整段卸载，避免手机端 overlay 的 display:!important 残留挡住登录页 -->
  <el-dialog
    v-if="mounted"
    v-model="dialogVisible"
    title=""
    width="720px"
    modal-class="terms-dialog-overlay"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    :destroy-on-close="true"
    append-to-body
    :class="['terms-dialog', { 'dark-mode': isDarkMode }]"
    aria-labelledby="terms-dialog-title"
  >
    <div class="terms-wrapper">
      <!-- 头部区域 -->
      <div class="terms-header">
        <div class="header-icon">
          <div class="icon-bg">
            <span class="icon">📋</span>
          </div>
        </div>
        <h2 id="terms-dialog-title" class="header-title">使用协议</h2>
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
          <label
            class="custom-checkbox"
            :class="{ checked: agreed, disabled: !hasScrolledToBottom }"
            @click.prevent="toggleAgree"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="agreed"
              :aria-disabled="!hasScrolledToBottom"
              tabindex="-1"
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
          type="button"
          class="accept-button" 
          :class="{ enabled: agreed || hasScrolledToBottom }"
          :disabled="(!agreed && !hasScrolledToBottom) || accepting"
          @click.stop.prevent="handleAccept"
        >
          <span class="button-icon">🚀</span>
          <span class="button-text">同意并开始使用</span>
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { VERSION } from '@cyp-memo/shared'
import { TERMS_SECTIONS, LEGAL_EFFECTIVE_DATE } from '../content/legal'

const router = useRouter()

const mounted = ref(false)
const visible = ref(false)
const accepted = ref(false)
const agreed = ref(false)
const hasScrolledToBottom = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const accepting = ref(false)

const TERMS_ACCEPTED_KEY = 'cyp-memo-terms-accepted'
const TERMS_ACCEPTED_AT_KEY = 'cyp-memo-terms-accepted-date'

/** 同页会话记忆：手机自签 HTTPS 下 localStorage 可能写失败或读不到 */
let termsAcceptedMemory = false

function readStorageFlag(store: Storage | undefined): boolean {
  if (!store) return false
  try {
    const v = store.getItem(TERMS_ACCEPTED_KEY)
    return v === 'true' || v === '1' || v === 'yes'
  } catch {
    return false
  }
}

function readCookieFlag(): boolean {
  try {
    return typeof document !== 'undefined' && document.cookie.split(';').some((c) => {
      const t = c.trim()
      return t === `${TERMS_ACCEPTED_KEY}=1` || t.startsWith(`${TERMS_ACCEPTED_KEY}=1;`)
    })
  } catch {
    return false
  }
}

function hasAcceptedTerms(): boolean {
  if (accepted.value || termsAcceptedMemory) return true
  if (readStorageFlag(typeof localStorage !== 'undefined' ? localStorage : undefined)) {
    termsAcceptedMemory = true
    accepted.value = true
    return true
  }
  if (readStorageFlag(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined)) {
    termsAcceptedMemory = true
    accepted.value = true
    return true
  }
  if (readCookieFlag()) {
    termsAcceptedMemory = true
    accepted.value = true
    return true
  }
  return false
}

function persistAcceptedTerms(): void {
  termsAcceptedMemory = true
  accepted.value = true
  const now = new Date().toISOString()
  try {
    localStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
    localStorage.setItem(TERMS_ACCEPTED_AT_KEY, now)
  } catch {
    /* 私密模式 / 策略拦截 */
  }
  try {
    sessionStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
    sessionStorage.setItem(TERMS_ACCEPTED_AT_KEY, now)
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${TERMS_ACCEPTED_KEY}=1; path=/; max-age=31536000; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

function unlockPageAfterTerms(): void {
  try {
    document.body.classList.remove('el-popup-parent--hidden')
    document.body.style.removeProperty('overflow')
    document.body.style.removeProperty('padding-right')
    document.documentElement.style.removeProperty('overflow')
  } catch {
    /* ignore */
  }
  try {
    document.querySelectorAll('.terms-dialog-overlay').forEach((el) => {
      el.parentElement?.removeChild(el)
    })
  } catch {
    /* ignore */
  }
}

function closeTermsDialog(): void {
  visible.value = false
  agreed.value = false
}

function teardownTermsDialog(): void {
  closeTermsDialog()
  mounted.value = false
  unlockPageAfterTerms()
}

/** 已同意后一律不展示；拦截 EP 内部把 model 写回 true */
const dialogVisible = computed({
  get: () => visible.value && !accepted.value && mounted.value,
  set: (open: boolean) => {
    if (!open || accepted.value || termsAcceptedMemory) {
      visible.value = false
      return
    }
    visible.value = open
  },
})

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

function syncScrollGate() {
  const el = contentRef.value
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  // 中间区高度异常（flex 未撑开）时放开勾选，避免手机点不动
  if (clientHeight < 48) {
    hasScrolledToBottom.value = true
    return
  }
  if (scrollHeight <= clientHeight + 16) {
    hasScrolledToBottom.value = true
    return
  }
  if (scrollTop + clientHeight >= scrollHeight - 24) {
    hasScrolledToBottom.value = true
  }
}

function handleScroll() {
  syncScrollGate()
}

function toggleAgree() {
  if (!hasScrolledToBottom.value) return
  agreed.value = !agreed.value
}

watch(visible, async (open) => {
  // 已同意后禁止任何路径再次打开（含 EP 内部回写）
  if (open && hasAcceptedTerms()) {
    closeTermsDialog()
    return
  }
  if (!open) return
  await nextTick()
  syncScrollGate()
  window.setTimeout(syncScrollGate, 80)
  window.setTimeout(syncScrollGate, 400)
})

onMounted(() => {
  if (hasAcceptedTerms()) {
    mounted.value = false
    unlockPageAfterTerms()
    return
  }
  mounted.value = true
  visible.value = true
})

const handleAccept = async () => {
  if (accepting.value) return
  if (!agreed.value && !hasScrolledToBottom.value) return
  // 手机上偶发勾选态不同步：已滚到底仍允许确认
  if (!agreed.value) {
    agreed.value = true
  }
  accepting.value = true
  persistAcceptedTerms()
  teardownTermsDialog()
  await nextTick()
  unlockPageAfterTerms()
  const path = router.currentRoute.value.path
  if (path === '/' || path === '') {
    try {
      await router.replace('/login')
    } catch {
      /* ignore */
    }
  }
  window.setTimeout(() => {
    unlockPageAfterTerms()
    accepting.value = false
  }, 50)
}
</script>

<style scoped>
.terms-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  max-height: min(85vh, 100dvh);
  pointer-events: auto;
  touch-action: pan-y;
}

.terms-header {
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  padding: 2rem 2.5rem;
  text-align: center;
  color: var(--cyp-brand-contrast);
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
  background: var(--cyp-brand-tint-contrast);
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
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.terms-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  overscroll-behavior: contain;
  padding: 1.5rem 2rem;
  background: var(--cyp-chrome-bg-soft);
  pointer-events: auto;
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
  color: var(--cyp-brand-contrast);
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
  color: var(--cyp-brand-contrast);
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
  flex-shrink: 0;
  padding: 1.5rem 2rem;
  background: var(--cyp-chrome-bg);
  border-top: 1px solid var(--cyp-chrome-border);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  pointer-events: auto;
  touch-action: manipulation;
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
  align-items: flex-start;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
  min-height: 44px;
  width: 100%;
}

.custom-checkbox.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.custom-checkbox input.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.checkbox-mark {
  width: 24px;
  height: 24px;
  margin-top: 2px;
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
  color: var(--cyp-brand-contrast);
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
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.accept-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 44px;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-muted);
  box-sizing: border-box;
}

.accept-button.enabled {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: var(--cyp-brand-contrast);
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

@media (max-width: 768px) {
  .terms-wrapper {
    max-height: none;
    height: 100%;
  }

  .terms-header {
    padding: 12px 16px 14px;
    padding-top: max(12px, env(safe-area-inset-top, 0px));
  }

  .header-icon {
    margin-bottom: 0.35rem;
  }

  .icon-bg {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }

  .icon {
    font-size: 1.35rem;
  }

  .header-title {
    font-size: 1.2rem;
    margin-bottom: 0.25rem;
  }

  .header-subtitle {
    font-size: 0.8rem;
  }

  .terms-content {
    padding: 12px 14px;
  }

  .welcome-card {
    flex-direction: column;
    text-align: center;
    padding: 0.85rem;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-item.full-width {
    grid-column: span 1;
  }

  .terms-footer {
    padding: 12px 14px;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px));
  }

  .accept-button {
    padding: 0.75rem;
  }
}
</style>

<style>
.el-dialog.terms-dialog {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: var(--cyp-chrome-shadow), var(--cyp-shadow-dialog);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  background: var(--cyp-chrome-bg-panel);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.el-dialog.terms-dialog .el-dialog__header {
  display: none;
}

.el-dialog.terms-dialog .el-dialog__body {
  padding: 0;
  background: transparent;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.terms-dialog-overlay {
  overflow: auto !important;
  pointer-events: auto !important;
}

.terms-dialog-overlay .el-overlay-dialog {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  pointer-events: auto;
}

@media (max-width: 768px) {
  /* 仅在 EP 打开态（未带 fade 关闭类）铺满；禁止 display:!important 盖死关闭后的遮罩 */
  .terms-dialog-overlay.el-overlay:not(.el-overlay-fade-leave-active):not(.el-overlay-fade-leave-to) {
    padding: 0;
    overflow: hidden;
    align-items: stretch;
    justify-content: stretch;
    -webkit-overflow-scrolling: touch;
  }

  .terms-dialog-overlay .el-overlay-dialog {
    padding: 0;
    margin: 0;
  }

  .terms-dialog-overlay .el-dialog.terms-dialog,
  .el-dialog.terms-dialog {
    width: 100%;
    max-width: 100%;
    margin: 0;
    height: 100%;
    max-height: 100dvh;
    border-radius: 0;
    pointer-events: auto;
  }
}
</style>
