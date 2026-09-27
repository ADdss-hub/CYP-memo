<!--
  找回账号和密码 - 选择页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="auth-shell">
    <div class="auth-card select-card">
      <div class="select-header">
        <BrandMark size="xl" class="select-brand" />
        <h1 class="select-title">找回账号和密码</h1>
        <p class="select-subtitle">请选择您需要的功能</p>
      </div>

      <!-- 功能选择 -->
      <div class="function-selection">
        <div class="function-card" @click="goToRecoverAccount">
          <div class="function-icon">
            <User />
          </div>
          <div class="function-info">
            <h3 class="function-title">找回账号</h3>
            <p class="function-desc">忘记了账号？通过个人令牌或安全问题找回您的账号</p>
          </div>
          <div class="function-arrow">
            <ArrowRight />
          </div>
        </div>

        <div class="function-card" @click="goToResetPassword">
          <div class="function-icon">
            <Lock />
          </div>
          <div class="function-info">
            <h3 class="function-title">找回密码</h3>
            <p class="function-desc">忘记了密码？通过个人令牌或安全问题重置您的密码</p>
          </div>
          <div class="function-arrow">
            <ArrowRight />
          </div>
        </div>
      </div>

      <div class="form-links">
        <router-link to="/login" class="link"> 返回登录 </router-link>
      </div>

      <!-- 底部版权信息 -->
      <div class="select-footer">
        <div class="footer-brand">
          <span class="brand-name">{{ copyrightLines.line1 }}</span>
          <span class="brand-author">{{ copyrightLines.line2 }}</span>
        </div>
        <div class="footer-copyright">
          <span>{{ copyrightLines.line3 }}</span>
          <span class="separator">·</span>
          <span>{{ copyrightLines.line4 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { VERSION } from '@cyp-memo/shared'
import { User, Lock, ArrowRight } from '@element-plus/icons-vue'
import BrandMark from '../../components/BrandMark.vue'

const router = useRouter()

// 版权信息
const copyrightLines = VERSION.copyrightLines

/**
 * 跳转到找回账号页面
 */
const goToRecoverAccount = () => {
  router.push('/recover-account')
}

/**
 * 跳转到找回密码页面
 */
const goToResetPassword = () => {
  router.push('/reset-password-new')
}
</script>

<style scoped>
.select-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cyp-bg-page);
  padding: 20px;
}

.select-container {
  width: 100%;
  max-width: 480px;
  background: var(--cyp-bg-card);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  border: 1px solid var(--cyp-border);
  padding: 40px;
}

.select-header {
  text-align: center;
  margin-bottom: 32px;
}

.select-brand {
  margin: 0 auto 16px;
}

.select-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0 0 8px 0;
}

.select-subtitle {
  font-size: 14px;
  color: var(--cyp-text-muted);
  margin: 0;
}

/* 功能选择卡片 */
.function-selection {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.function-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--cyp-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.function-card:hover {
  border-color: var(--cyp-brand);
  background: var(--cyp-bg-muted);
  box-shadow: 0 4px 12px rgba(0, 153, 255, 0.15);
  transform: translateY(-2px);
}

.function-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-soft) 100%);
  border-radius: 12px;
  color: white;
  font-size: 24px;
  flex-shrink: 0;
}

.function-info {
  flex: 1;
}

.function-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--cyp-text);
  margin: 0 0 4px 0;
}

.function-desc {
  font-size: 13px;
  color: var(--cyp-text-muted);
  margin: 0;
  line-height: 1.5;
}

.function-arrow {
  color: #c0c4cc;
  font-size: 20px;
  flex-shrink: 0;
  transition: all 0.3s;
}

.function-card:hover .function-arrow {
  color: var(--cyp-brand);
  transform: translateX(4px);
}

/* 链接 */
.form-links {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.link {
  font-size: 14px;
  color: var(--cyp-brand);
  text-decoration: none;
  transition: color 0.2s;
}

.link:hover {
  color: var(--cyp-brand-soft);
  text-decoration: underline;
}

/* 底部版权信息 */
.select-footer {
  padding-top: 20px;
  border-top: 1px solid var(--cyp-border);
  text-align: center;
}

.footer-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--cyp-brand);
  letter-spacing: 0.5px;
}

.brand-author {
  font-size: 12px;
  color: var(--cyp-text-secondary);
}

.footer-copyright {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cyp-text-muted);
}

.separator {
  color: #c0c4cc;
}

/* 深色主题支持 */
/* 响应式设计 */
@media (max-width: 480px) {
  .select-container {
    padding: 24px;
  }

  .select-title {
    font-size: 24px;
  }

  .function-card {
    padding: 16px;
  }

  .function-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .function-title {
    font-size: 15px;
  }

  .function-desc {
    font-size: 12px;
  }

  .footer-lines {
    font-size: 11px;
    gap: 2px;
  }
}
</style>
