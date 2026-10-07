<!--
  Modal 对话框组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="modelValue"
        class="modal-overlay"
        @click="handleOverlayClick"
      >
        <Transition name="modal-slide">
          <div
            v-if="modelValue"
            ref="dialogRef"
            class="modal-container"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :style="{ width: width }"
            tabindex="-1"
            @click.stop
          >
            <div class="modal-header">
              <h3 :id="titleId" class="modal-title">
                {{ title }}
              </h3>
              <button
                v-if="closable"
                type="button"
                class="modal-close"
                aria-label="关闭对话框"
                @click="handleClose"
              >
                <Close aria-hidden="true" />
              </button>
            </div>
            <div class="modal-body">
              <slot />
            </div>
            <div v-if="showFooter" class="modal-footer">
              <slot name="footer">
                <Button v-if="showCancel" type="default" @click="handleCancel">
                  {{ cancelText }}
                </Button>
                <Button v-if="showConfirm" type="primary" @click="handleConfirm">
                  {{ confirmText }}
                </Button>
              </slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue'
import { Close } from '@element-plus/icons-vue'
import Button from './Button.vue'
import { useFocusTrap } from '../composables/useFocusTrap'

export interface ModalProps {
  modelValue: boolean
  title?: string
  width?: string
  closable?: boolean
  closeOnClickOverlay?: boolean
  showFooter?: boolean
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: string
  confirmText?: string
}

const props = withDefaults(defineProps<ModalProps>(), {
  title: '提示',
  width: '500px',
  closable: true,
  closeOnClickOverlay: true,
  showFooter: true,
  showCancel: true,
  showConfirm: true,
  cancelText: '取消',
  confirmText: '确定',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
  cancel: []
  confirm: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const titleId = computed(() => 'cyp-modal-title')
const open = toRef(props, 'modelValue')

const handleClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

useFocusTrap(open, dialogRef, { onEscape: handleClose })

const handleOverlayClick = () => {
  if (props.closeOnClickOverlay) {
    handleClose()
  }
}

const handleCancel = () => {
  emit('cancel')
  handleClose()
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cyp-overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
}

.modal-container {
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 8px;
  box-shadow: var(--cyp-chrome-shadow), var(--cyp-shadow-md);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  max-width: min(90vw, calc(100vw - 24px));
  max-height: min(90vh, calc(100dvh - 24px));
  display: flex;
  flex-direction: column;
  outline: none;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--cyp-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--cyp-text);
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  padding: 8px;
  font-size: 18px;
  color: var(--cyp-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.modal-close:hover {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
}

.modal-body {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  color: var(--cyp-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--cyp-border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-slide-enter-active,
.modal-slide-leave-active {
  transition: all 0.3s ease;
}

.modal-slide-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}

.modal-slide-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

@media (prefers-reduced-motion: reduce) {
  .modal-fade-enter-active,
  .modal-fade-leave-active,
  .modal-slide-enter-active,
  .modal-slide-leave-active {
    transition: none;
  }
}
</style>
