<!--
  底部信息栏组件（版本号、作者、版权）- 分行展示版
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <footer class="app-footer">
    <div class="footer-content">
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
  </footer>
</template>

<script setup lang="ts">
import { VERSION } from '@shared/config/version'

const copyrightLines = VERSION.copyrightLines
</script>

<style scoped>
.app-footer {
  background: linear-gradient(to right, #f8f9fa, #ffffff, #f8f9fa);
  border-top: 1px solid #e4e7ed;
  padding: 16px 20px;
  position: sticky;
  bottom: 0;
  z-index: 90;
}

.footer-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  color: #667eea;
  letter-spacing: 0.5px;
}

.brand-author {
  font-size: 12px;
  color: #606266;
  padding-left: 12px;
  border-left: 1px solid #dcdfe6;
}

.footer-copyright {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #909399;
}

.separator {
  color: #c0c4cc;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .app-footer {
    padding: 12px 16px;
  }

  .footer-brand {
    flex-direction: column;
    gap: 4px;
  }

  .brand-author {
    padding-left: 0;
    border-left: none;
  }

  .footer-copyright {
    font-size: 10px;
  }
}

/* 深色主题支持 */
[data-theme='dark'] .app-footer {
  background: linear-gradient(to right, #1a1b1c, #1d1e1f, #1a1b1c);
  border-top-color: #414243;
}

[data-theme='dark'] .brand-name {
  color: #a5b4fc;
}

[data-theme='dark'] .brand-author {
  color: #a8abb2;
  border-left-color: #414243;
}

[data-theme='dark'] .footer-copyright {
  color: #6b7280;
}

[data-theme='dark'] .separator {
  color: #4b5563;
}
</style>
