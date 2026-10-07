<!--
  Toast 提示组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div
        v-if="visible"
        :class="['toast', `toast-${type}`]"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div class="toast-icon" aria-hidden="true">
          <component :is="iconComponent" />
        </div>
        <div class="toast-content">
          <div v-if="title" class="toast-title">
            {{ title }}
          </div>
          <div class="toast-message">
            {{ message }}
          </div>
        </div>
        <button
          v-if="closable"
          type="button"
          class="toast-close"
          aria-label="关闭提示"
          @click="close"
        >
          <Close aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  InfoFilled,
  Close,
} from '@element-plus/icons-vue'

export interface ToastProps {
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  title?: string
  duration?: number
  closable?: boolean
  onClose?: () => void
}

const props = withDefaults(defineProps<ToastProps>(), {
  type: 'info',
  duration: 3000,
  closable: true,
})

const visible = ref(false)
let timer: number | null = null

const iconComponent = computed(() => {
  const icons = {
    success: SuccessFilled,
    error: CircleCloseFilled,
    warning: WarningFilled,
    info: InfoFilled,
  }
  return icons[props.type]
})

const close = () => {
  visible.value = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  props.onClose?.()
}

onMounted(() => {
  visible.value = true
  if (props.duration > 0) {
    timer = window.setTimeout(() => {
      close()
    }, props.duration)
  }
})
</script>

<style scoped>
.toast {
  /* 视口正中：禁止顶/底/左/右贴边 */
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: min(300px, calc(100vw - 32px));
  max-width: min(500px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 16px 20px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 8px;
  box-shadow: var(--cyp-chrome-shadow), var(--cyp-shadow-toast);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  display: flex;
  align-items: flex-start;
  gap: 12px;
  z-index: 9999;
}

.toast-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.toast-success .toast-icon {
  color: var(--cyp-success);
}

.toast-error .toast-icon {
  color: var(--cyp-danger);
}

.toast-warning .toast-icon {
  color: var(--cyp-warning);
}

.toast-info .toast-icon {
  color: var(--cyp-brand);
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  color: var(--cyp-text);
}

.toast-message {
  font-size: 14px;
  color: var(--cyp-text-secondary);
  line-height: 1.5;
}

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  padding: 8px;
  font-size: 16px;
  color: var(--cyp-text-muted);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.toast-close:hover {
  color: var(--cyp-text-secondary);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .toast-fade-enter-active,
  .toast-fade-leave-active {
    transition: none;
  }
}
</style>
