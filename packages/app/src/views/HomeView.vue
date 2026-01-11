<template>
  <div class="home">
    <div class="home-header">
      <div class="logo-icon">📝</div>
      <h1>CYP-memo</h1>
      <p class="subtitle">容器备忘录系统 - 用户端</p>
    </div>
    <div class="home-info">
      <div class="info-item">
        <span class="label">版本</span>
        <span class="value">v{{ version }}</span>
      </div>
      <div class="info-item">
        <span class="label">作者</span>
        <span class="value">{{ author }}</span>
      </div>
    </div>
    <div class="home-features">
      <div class="feature-badge">🔒 安全可靠</div>
      <div class="feature-badge">⚡ 快速高效</div>
      <div class="feature-badge">🎨 简洁美观</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VERSION } from '@shared/config/version'

const version = VERSION.full
const author = VERSION.author
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.home-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.home h1 {
  font-size: 48px;
  font-weight: 700;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #fff 0%, #e0e7ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 18px;
  opacity: 0.9;
  margin: 0;
}

.home-info {
  display: flex;
  gap: 32px;
  margin-bottom: 32px;
  padding: 20px 32px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.label {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.value {
  font-size: 16px;
  font-weight: 600;
}

.home-features {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.feature-badge {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

/* 深色主题支持 */
[data-theme='dark'] .home {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
}
</style>
