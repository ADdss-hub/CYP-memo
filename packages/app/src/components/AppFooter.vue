<!--
  底部信息栏 · 对齐 footer-gate（版权/作者：CYP/版本/联系/服务链接/安全区）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <footer class="app-footer">
    <div class="footer-content">
      <div class="footer-meta">
        <BrandMark size="sm" class="footer-logo" />
        <span class="footer-version">V{{ VERSION.full }}</span>
        <span class="sep" aria-hidden="true">·</span>
        <span class="footer-copy"
          >© {{ year }} CYP-memo 版权所有 作者：{{ VERSION.author }}</span
        >
      </div>
      <div class="footer-links">
        <RouterLink class="footer-link" to="/terms">服务条款</RouterLink>
        <span class="sep" aria-hidden="true">·</span>
        <RouterLink class="footer-link" to="/privacy">隐私</RouterLink>
        <span class="sep" aria-hidden="true">·</span>
        <a class="footer-link footer-email" :href="`mailto:${VERSION.email}`">{{
          VERSION.email
        }}</a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { VERSION } from '@shared/config/version'
import BrandMark from './BrandMark.vue'

const year = new Date().getFullYear()
</script>

<style scoped>
.app-footer {
  position: sticky;
  bottom: 0;
  z-index: 90;
  flex-shrink: 0;
  width: 100%;
  background: var(--cyp-bg-page);
  border-top: 1px solid var(--cyp-border);
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  text-align: center;
}

.footer-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 720px;
  margin: 0 auto;
  font-size: 12px;
  font-weight: 300;
  line-height: 1.5;
  color: var(--cyp-text-muted);
}

.footer-meta,
.footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 8px;
}

.footer-logo {
  flex-shrink: 0;
  width: 18px !important;
  height: 18px !important;
  border-radius: 4px;
  box-shadow: none;
}

.footer-version {
  font-variant-numeric: tabular-nums;
  color: var(--cyp-text-secondary);
}

.footer-copy {
  color: var(--cyp-text-muted);
}

.footer-link {
  color: var(--cyp-brand);
  text-decoration: none;
  font-weight: 300;
}

.footer-link:hover {
  text-decoration: underline;
  color: var(--cyp-brand-soft);
}

.footer-email {
  word-break: break-all;
}

.sep {
  color: var(--cyp-text-muted);
  opacity: 0.7;
  user-select: none;
}

/* 认证卡内嵌：去掉 sticky，与表单留出呼吸感 */
.login-container .app-footer,
.register-container .app-footer,
.recover-container .app-footer,
.reset-container .app-footer,
.select-container .app-footer {
  position: static;
  margin-top: 28px;
  padding-left: 0;
  padding-right: 0;
  background: transparent;
}

</style>
