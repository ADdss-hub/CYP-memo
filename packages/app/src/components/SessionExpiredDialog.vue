<!--
  会话失效/使用受限提示对话框
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="session-expired-overlay" @click.self="handleOverlayClick">
        <div class="session-expired-dialog">
          <div class="dialog-icon" :class="iconClass">
            <svg v-if="type === 'expired'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <svg v-else-if="type === 'restricted'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 class="dialog-title">{{ title }}</h2>
          <p class="dialog-message">{{ displayMessage }}</p>
          <p class="dialog-hint">{{ hint }}</p>
          <div class="dialog-actions">
            <button class="dialog-button primary" @click="handleConfirm">
              {{ confirmText }}
            </button>
            <button v-if="showCancel" class="dialog-button secondary" @click="handleCancel">
              {{ cancelText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  message?: string
  type?: 'expired' | 'restricted' | 'warning'
  title?: string
  hint?: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  closeOnOverlay?: boolean
}>(), {
  type: 'restricted',
  title: '使用受限',
  hint: '请重新登录本系统才能继续使用，如有问题请联系系统管理员',
  confirmText: '重新登录',
  cancelText: '取消',
  showCancel: false,
  closeOnOverlay: false
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const displayMessage = computed(() => {
  if (props.message) return props.message
  
  switch (props.type) {
    case 'expired':
      return '您的登录会话已过期，请重新登录'
    case 'restricted':
      return '您的账号使用受到限制，可能是账号已被删除或数据库已重置'
    default:
      return '系统检测到异常，请重新登录'
  }
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'expired':
      return 'icon-expired'
    case 'restricted':
      return 'icon-restricted'
    default:
      return 'icon-warning'
  }
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleOverlayClick() {
  if (props.closeOnOverlay) {
    emit('cancel')
  }
}
</script>

<style scoped>
.session-expired-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.session-expired-dialog {
  background: white;
  border-radius: 16px;
  padding: 32px 40px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: dialogEnter 0.3s ease-out;
}

@keyframes dialogEnter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-icon svg {
  width: 100%;
  height: 100%;
}

.icon-expired {
  background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
  color: #e67e22;
}

.icon-restricted {
  background: linear-gradient(135deg, #ffeef8 0%, #ffcce5 100%);
  color: #e74c3c;
}

.icon-warning {
  background: linear-gradient(135deg, #fff3cd 0%, #ffc107 100%);
  color: #856404;
}

.dialog-title {
  margin: 0 0 12px 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.dialog-message {
  margin: 0 0 8px 0;
  font-size: 15px;
  color: #606266;
  line-height: 1.6;
}

.dialog-hint {
  margin: 0 0 24px 0;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-button {
  width: 100%;
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.dialog-button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.dialog-button.secondary {
  background: #f5f7fa;
  color: #606266;
}

.dialog-button.secondary:hover {
  background: #e4e7ed;
}

.dialog-button:active {
  transform: translateY(0);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 深色主题 */
[data-theme='dark'] .session-expired-dialog {
  background: #262727;
}

[data-theme='dark'] .dialog-title {
  color: #e5eaf3;
}

[data-theme='dark'] .dialog-message {
  color: #cfd3dc;
}

[data-theme='dark'] .dialog-hint {
  color: #8a8f99;
}

[data-theme='dark'] .dialog-button.secondary {
  background: #363637;
  color: #cfd3dc;
}

[data-theme='dark'] .dialog-button.secondary:hover {
  background: #414243;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .session-expired-dialog {
    padding: 24px 20px;
    margin: 16px;
  }

  .dialog-icon {
    width: 60px;
    height: 60px;
    padding: 12px;
  }

  .dialog-title {
    font-size: 20px;
  }

  .dialog-message {
    font-size: 14px;
  }

  .dialog-hint {
    font-size: 12px;
  }

  .dialog-button {
    padding: 12px 20px;
    font-size: 15px;
  }
}
</style>
