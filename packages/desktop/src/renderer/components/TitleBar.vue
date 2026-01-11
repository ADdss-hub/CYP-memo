<script setup lang="ts">
/**
 * 桌面客户端标题栏组件
 * Custom title bar component for desktop client
 * 
 * 需求 10.1: 桌面客户端应在每个平台上提供原生外观和体验
 */

import { computed } from 'vue'
import { useElectron, useWindow } from '../composables'

const props = defineProps<{
  title?: string
}>()

const { isElectronEnv, isMac, isWindows, isLinux } = useElectron()
const { minimize, maximize, close } = useWindow()

// macOS 使用原生标题栏，不显示自定义控制按钮
const showControls = computed(() => isElectronEnv.value && !isMac.value)

// Windows 和 Linux 显示自定义控制按钮
const controlsPosition = computed(() => {
  if (isWindows.value) return 'right'
  if (isLinux.value) return 'right' // 大多数 Linux 桌面环境使用右侧
  return 'right'
})
</script>

<template>
  <div 
    v-if="isElectronEnv" 
    class="title-bar"
    :class="{ 'title-bar--mac': isMac }"
  >
    <!-- 拖拽区域 -->
    <div class="title-bar__drag-region">
      <span v-if="title" class="title-bar__title">{{ title }}</span>
    </div>

    <!-- 窗口控制按钮 (Windows/Linux) -->
    <div 
      v-if="showControls" 
      class="title-bar__controls"
      :class="`title-bar__controls--${controlsPosition}`"
    >
      <button 
        class="title-bar__button title-bar__button--minimize"
        @click="minimize"
        title="最小化"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      
      <button 
        class="title-bar__button title-bar__button--maximize"
        @click="maximize"
        title="最大化"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
      
      <button 
        class="title-bar__button title-bar__button--close"
        @click="close"
        title="关闭"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" stroke-width="1.2" />
          <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background: var(--bg-secondary, #f5f7fa);
  border-bottom: 1px solid var(--border-color, #dcdfe6);
  user-select: none;
  -webkit-app-region: drag;
}

.title-bar--mac {
  /* macOS 使用原生标题栏，只需要拖拽区域 */
  padding-left: 80px; /* 为红绿灯按钮留出空间 */
}

.title-bar__drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.title-bar__title {
  font-size: 12px;
  color: var(--text-secondary, #606266);
  font-weight: 500;
}

.title-bar__controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.title-bar__controls--right {
  order: 1;
}

.title-bar__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary, #303133);
  cursor: pointer;
  transition: background-color 0.15s;
}

.title-bar__button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.title-bar__button--close:hover {
  background: #e81123;
  color: white;
}

/* 深色主题 */
:root[data-theme='dark'] .title-bar,
html.dark .title-bar {
  background: var(--bg-secondary, #262727);
  border-bottom-color: var(--border-color, #414243);
}

:root[data-theme='dark'] .title-bar__button:hover,
html.dark .title-bar__button:hover {
  background: rgba(255, 255, 255, 0.1);
}

:root[data-theme='dark'] .title-bar__button--close:hover,
html.dark .title-bar__button--close:hover {
  background: #e81123;
  color: white;
}
</style>
