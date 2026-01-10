<!--
  Loading 加载组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport v-if="fullscreen" to="body">
    <Transition name="loading-fade">
      <div v-if="visible" class="loading-overlay">
        <div class="loading-content">
          <div class="loading-spinner">
            <div class="spinner-circle" />
          </div>
          <div v-if="text" class="loading-text">
            {{ text }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <div v-else class="loading-inline">
    <div class="loading-spinner" :style="{ fontSize: size }">
      <div class="spinner-circle" />
    </div>
    <div v-if="text" class="loading-text">
      {{ text }}
    </div>
  </div>
</template>

<script setup lang="ts">
export interface LoadingProps {
  visible?: boolean
  text?: string
  fullscreen?: boolean
  size?: string
}

withDefaults(defineProps<LoadingProps>(), {
  visible: true,
  fullscreen: false,
  size: '32px',
})
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}

.loading-spinner {
  font-size: 32px;
  width: 1em;
  height: 1em;
  position: relative;
}

.spinner-circle {
  width: 100%;
  height: 100%;
  border: 3px solid #e4e7ed;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: #606266;
  text-align: center;
}

.loading-fade-enter-active,
.loading-fade-leave-active {
  transition: opacity 0.3s ease;
}

.loading-fade-enter-from,
.loading-fade-leave-to {
  opacity: 0;
}

/* 深色主题支持 */
[data-theme='dark'] .loading-overlay {
  background: rgba(0, 0, 0, 0.8);
}

[data-theme='dark'] .spinner-circle {
  border-color: #414243;
  border-top-color: #409eff;
}

[data-theme='dark'] .loading-text {
  color: #cfd3dc;
}
</style>
