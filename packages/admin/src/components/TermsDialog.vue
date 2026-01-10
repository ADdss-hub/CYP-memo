<!--
  使用协议对话框组件（管理员端）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
  全面更新版本 - 现代化设计
-->
<template>
  <el-dialog
    v-model="visible"
    title=""
    width="750px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    :class="['admin-terms-dialog', { 'dark-mode': isDarkMode }]"
  >
    <div class="terms-wrapper">
      <!-- 头部区域 -->
      <div class="terms-header">
        <div class="header-badge">
          <span class="badge-icon">🛡️</span>
          <span class="badge-text">管理员专用</span>
        </div>
        <div class="header-icon">
          <div class="icon-bg">
            <span class="icon">⚙️</span>
          </div>
        </div>
        <h2 class="header-title">管理员使用协议</h2>
        <p class="header-subtitle">请仔细阅读以下条款，了解您的权限与责任</p>
      </div>

      <!-- 内容区域 -->
      <div class="terms-content" ref="contentRef" @scroll="handleScroll">
        <!-- 欢迎卡片 -->
        <div class="welcome-card admin-card">
          <div class="welcome-icon">👋</div>
          <div class="welcome-text">
            <h3>欢迎使用 CYP-memo 系统管理员端</h3>
            <p>您拥有系统的最高管理权限，请谨慎操作</p>
          </div>
        </div>

        <!-- 重要提醒 -->
        <div class="warning-banner">
          <span class="warning-icon">⚠️</span>
          <div class="warning-content">
            <strong>重要提醒</strong>
            <p>管理员操作可能影响所有用户数据，请在操作前确认无误</p>
          </div>
        </div>

        <!-- 协议条款 -->
        <div class="terms-sections">
          <section class="terms-section" v-for="(section, index) in sections" :key="index">
            <div class="section-header">
              <span class="section-icon">{{ section.icon }}</span>
              <h4 class="section-title">{{ section.title }}</h4>
            </div>
            <div class="section-content">
              <p v-if="section.content">{{ section.content }}</p>
              <ul v-if="section.list" class="section-list">
                <li v-for="(item, i) in section.list" :key="i">
                  <span class="list-icon" :class="section.listType || 'check'">
                    {{ section.listType === 'warning' ? '!' : '✓' }}
                  </span>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <!-- 软件信息卡片 -->
        <div class="info-card">
          <div class="info-header">
            <span class="info-icon">📋</span>
            <span class="info-title">软件信息</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">系统版本</span>
              <span class="info-value">
                <span class="version-badge admin">v{{ version }}</span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">开发作者</span>
              <span class="info-value">{{ author }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">联系邮箱</span>
              <span class="info-value email-link">{{ email }}</span>
            </div>
            <div class="info-item">
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
            <span class="checkbox-label">我已阅读并同意以上协议，承诺谨慎使用管理员权限</span>
          </label>
        </div>

        <button 
          class="accept-button" 
          :class="{ enabled: agreed }"
          :disabled="!agreed"
          @click="handleAccept"
        >
          <span class="button-icon">🔐</span>
          <span class="button-text">同意并进入管理后台</span>
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

const TERMS_ACCEPTED_KEY = 'cyp-memo-admin-terms-accepted'

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
    icon: '👤',
    title: '管理员责任',
    content: '作为系统管理员，您拥有管理用户、数据库和系统设置的权限。请谨慎使用这些权限，确保系统的安全性和稳定性。您对使用管理员权限执行的所有操作负责。'
  },
  {
    icon: '⚖️',
    title: '免责声明',
    content: '本软件按"原样"提供，不提供任何形式的明示或暗示保证。作者不对使用本软件造成的任何损失承担责任。管理员应自行评估操作风险。'
  },
  {
    icon: '📋',
    title: '使用条款',
    list: [
      '本软件仅供学习和个人使用',
      '禁止用于任何商业用途',
      '管理员应遵守所在地区的法律法规',
      '管理员应保护用户数据的隐私和安全',
      '作者保留随时修改本使用条款的权利'
    ]
  },
  {
    icon: '🔒',
    title: '数据安全要求',
    listType: 'warning',
    list: [
      '定期备份重要数据，防止意外丢失',
      '谨慎执行删除和清理操作',
      '保护管理员账号安全，定期更换密码',
      '不泄露任何用户隐私信息',
      '发现安全问题及时上报处理'
    ]
  },
  {
    icon: '🛡️',
    title: '权限使用规范',
    list: [
      '仅在必要时使用管理员权限',
      '操作前确认影响范围',
      '保留操作日志以便追溯',
      '遵循最小权限原则'
    ]
  }
]

// 处理滚动事件
function handleScroll() {
  if (contentRef.value) {
    const { scrollTop, scrollHeight, clientHeight } = contentRef.value
    hasScrolledToBottom.value = scrollTop + clientHeight >= scrollHeight - 10
  }
}

onMounted(() => {
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
  
  localStorage.setItem(TERMS_ACCEPTED_KEY, 'true')
  localStorage.setItem('cyp-memo-admin-terms-accepted-date', new Date().toISOString())
  visible.value = false
}
</script>

<style scoped>
/* 对话框基础样式 */
.admin-terms-dialog :deep(.el-dialog) {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
}

.admin-terms-dialog :deep(.el-dialog__header) {
  display: none;
}

.admin-terms-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.terms-wrapper {
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

/* 头部区域 */
.terms-header {
  background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
  padding: 2rem 2.5rem;
  text-align: center;
  color: white;
  position: relative;
}

.header-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255, 193, 7, 0.2);
  border: 1px solid rgba(255, 193, 7, 0.4);
  border-radius: 20px;
  font-size: 0.75rem;
  color: #ffc107;
}

.badge-icon {
  font-size: 0.875rem;
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
  background: rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
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
  opacity: 0.85;
  margin: 0;
}

/* 内容区域 */
.terms-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  max-height: 400px;
  background: #f8fafc;
}

/* 欢迎卡片 */
.welcome-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 12px;
  margin-bottom: 1rem;
}

.admin-card {
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  color: white;
}

.welcome-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.welcome-text h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.admin-card .welcome-text h3 {
  color: white;
}

.welcome-text p {
  font-size: 0.875rem;
  margin: 0;
  opacity: 0.9;
}

/* 警告横幅 */
.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  border-left: 4px solid #f59e0b;
}

.warning-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.warning-content strong {
  display: block;
  font-size: 0.95rem;
  color: #92400e;
  margin-bottom: 0.25rem;
}

.warning-content p {
  font-size: 0.875rem;
  color: #a16207;
  margin: 0;
  line-height: 1.5;
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
  border: 1px solid #e2e8f0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  border-radius: 8px;
  font-size: 1rem;
  flex-shrink: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.section-content p {
  font-size: 0.9rem;
  color: #475569;
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
  color: #475569;
}

.list-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 2px;
}

.list-icon.check {
  background: #dcfce7;
  color: #16a34a;
}

.list-icon.warning {
  background: #fef3c7;
  color: #d97706;
}

/* 信息卡片 */
.info-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e2e8f0;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.info-icon {
  font-size: 1.25rem;
}

.info-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
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

.info-label {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 0.9rem;
  color: #334155;
  font-weight: 500;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 6px;
  font-size: 0.8rem;
  width: fit-content;
}

.version-badge.admin {
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  color: white;
}

.email-link {
  color: #3b82f6;
}

/* 开源许可徽章 */
.license-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-radius: 10px;
  margin-top: 1rem;
}

.license-icon {
  font-size: 1.25rem;
}

.license-text {
  font-size: 0.9rem;
  color: #166534;
}

.license-text strong {
  color: #15803d;
}

/* 底部区域 */
.terms-footer {
  padding: 1.5rem 2rem;
  background: white;
  border-top: 1px solid #e2e8f0;
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
  border: 2px solid #cbd5e1;
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
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  border-color: transparent;
}

.custom-checkbox.checked .checkbox-mark svg {
  opacity: 1;
  transform: scale(1);
}

.checkbox-label {
  font-size: 0.9rem;
  color: #334155;
  font-weight: 500;
  line-height: 1.4;
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
  background: #e2e8f0;
  color: #94a3b8;
}

.accept-button.enabled {
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(30, 58, 95, 0.3);
}

.accept-button.enabled:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(30, 58, 95, 0.4);
}

.accept-button:disabled {
  cursor: not-allowed;
}

.button-icon {
  font-size: 1.25rem;
}

/* 深色模式 */
.dark-mode .terms-content {
  background: #0f172a;
}

.dark-mode .welcome-card.admin-card {
  background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
}

.dark-mode .warning-banner {
  background: linear-gradient(135deg, #78350f 0%, #92400e 100%);
  border-left-color: #fbbf24;
}

.dark-mode .warning-content strong {
  color: #fef3c7;
}

.dark-mode .warning-content p {
  color: #fde68a;
}

.dark-mode .terms-section {
  background: #1e293b;
  border-color: #334155;
}

.dark-mode .section-title {
  color: #f1f5f9;
}

.dark-mode .section-content p,
.dark-mode .section-list li {
  color: #cbd5e1;
}

.dark-mode .list-icon.check {
  background: #166534;
  color: #86efac;
}

.dark-mode .list-icon.warning {
  background: #92400e;
  color: #fde68a;
}

.dark-mode .info-card {
  background: #1e293b;
  border-color: #334155;
}

.dark-mode .info-header {
  border-bottom-color: #334155;
}

.dark-mode .info-title {
  color: #f1f5f9;
}

.dark-mode .info-label {
  color: #64748b;
}

.dark-mode .info-value {
  color: #e2e8f0;
}

.dark-mode .license-badge {
  background: linear-gradient(135deg, #14532d 0%, #166534 100%);
}

.dark-mode .license-text {
  color: #bbf7d0;
}

.dark-mode .license-text strong {
  color: #86efac;
}

.dark-mode .terms-footer {
  background: #0f172a;
  border-top-color: #1e293b;
}

.dark-mode .scroll-hint {
  background: #78350f;
  color: #fef3c7;
}

.dark-mode .checkbox-label {
  color: #e2e8f0;
}

.dark-mode .checkbox-mark {
  border-color: #475569;
}

.dark-mode .accept-button {
  background: #334155;
  color: #64748b;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .admin-terms-dialog :deep(.el-dialog) {
    width: 95% !important;
    margin: 0 auto;
  }

  .terms-header {
    padding: 1.5rem;
  }

  .header-badge {
    position: static;
    display: inline-flex;
    margin-bottom: 1rem;
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

  .warning-banner {
    flex-direction: column;
    text-align: center;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .terms-footer {
    padding: 1rem;
  }

  .checkbox-label {
    font-size: 0.85rem;
  }
}
</style>
