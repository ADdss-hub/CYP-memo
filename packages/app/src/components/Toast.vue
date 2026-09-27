<!--
  Toast 提示组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="visible" :class="['toast', `toast-${type}`]">
        <div class="toast-icon">
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
        <button v-if="closable" class="toast-close" @click="close">
          <Close />
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
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 300px;
  max-width: 500px;
  padding: 16px 20px;
  background: var(--cyp-bg-card);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
  padding: 0;
  font-size: 16px;
  color: var(--cyp-text-muted);
  flex-shrink: 0;
}

.toast-close:hover {
  color: var(--cyp-text-secondary);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
